import { randomUUID } from "node:crypto";
import { pool, query, transaction } from "./db";
import { Gmail, GmailError, emailAddress } from "./google";
import {
  classify,
  protection,
  shouldMove,
  authenticatedSender,
  CLASSIFIER_POLICY_VERSION,
  type Context,
} from "./classifier";
import { writesEnabled } from "./config";
import { accountProcessingAllowed } from "./entitlements";
import { processingErrorCode, retryPlan } from "./processing-error";
import type { Classification, Policy } from "../types";

export class AccountBusy extends Error {}

export async function withAccountLock<T>(
  accountId: string,
  fn: () => Promise<T>,
  wait = false,
) {
  const client = await pool().connect();
  const lock = `sotto:${accountId}`;
  try {
    const result = await client.query(
      wait
        ? "SELECT pg_advisory_lock(hashtext($1))"
        : "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [lock],
    );
    if (!wait && !result.rows[0].acquired)
      throw new AccountBusy("Account busy");
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lock]);
    }
  } finally {
    client.release();
  }
}
export function historyCandidates(
  history: {
    messagesAdded?: { message: { id: string } }[];
    labelsAdded?: { message: { id: string }; labelIds: string[] }[];
  }[],
) {
  return [
    ...new Set(
      history.flatMap((h) => [
        ...(h.messagesAdded ?? []).map((m) => m.message.id),
        ...(h.labelsAdded ?? [])
          .filter((m) => m.labelIds.includes("INBOX"))
          .map((m) => m.message.id),
      ]),
    ),
  ];
}
export async function syncMailbox(accountId: string, gmail: Gmail) {
  if (!(await accountProcessingAllowed(accountId))) return;
  const [account] = await query(
    "SELECT * FROM accounts WHERE id=$1 AND connected=true",
    [accountId],
  );
  if (!account || account.mode === "paused") return;
  const syncStarted = new Date();
  let cursor: string | undefined = account.history_id;
  const candidates = new Set<string>();
  if (cursor) {
    const startHistoryId = cursor;
    try {
      let page: string | undefined;
      do {
        const params = new URLSearchParams({ startHistoryId });
        if (page) params.set("pageToken", page);
        const result = await gmail.request<{
          historyId: string;
          nextPageToken?: string;
          history?: Parameters<typeof historyCandidates>[0];
        }>(`history?${params}`);
        historyCandidates(result.history ?? []).forEach((id) =>
          candidates.add(id),
        );
        page = result.nextPageToken;
        // Keep the original start cursor for all pages; only commit after the final page.
        if (!page) cursor = result.historyId;
      } while (page);
    } catch (error) {
      if (!(error instanceof GmailError) || error.status !== 404) throw error;
      cursor = undefined;
    }
  }
  if (!cursor) {
    const profile = await gmail.request<{ historyId: string }>("profile");
    cursor = profile.historyId;
    let page: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `in:inbox after:${Math.floor(new Date(account.start_at).getTime() / 1000)}`,
        maxResults: "100",
      });
      if (page) params.set("pageToken", page);
      const result = await gmail.request<{
        messages?: { id: string }[];
        nextPageToken?: string;
      }>(`messages?${params}`);
      result.messages?.forEach((m) => candidates.add(m.id));
      page = result.nextPageToken;
    } while (page);
  }
  await transaction(async (client) => {
    for (const messageId of candidates) {
      await client.query(
        "INSERT INTO jobs(account_id,message_id) VALUES($1,$2) ON CONFLICT(account_id,message_id) DO NOTHING",
        [accountId, messageId],
      );
    }
    await client.query(
      "UPDATE accounts SET history_id=$2,last_sync=now(),last_error=NULL WHERE id=$1",
      [accountId, cursor],
    );
    await client.query(
      "UPDATE mailbox_events SET processed_at=now() WHERE account_id=$1 AND created_at<=$2 AND processed_at IS NULL",
      [accountId, syncStarted],
    );
  });
}
async function contextFor(
  accountId: string,
  gmail: Gmail,
  mail: Awaited<ReturnType<Gmail["message"]>>,
): Promise<Context> {
  const [account] = await query(
    "SELECT email,policy FROM accounts WHERE id=$1",
    [accountId],
  );
  if (!account) throw new Error("Missing account");
  const rules = await query(
    "SELECT sender FROM sender_rules WHERE account_id=$1",
    [accountId],
  );
  const context: Context = {
    accountEmail: account.email,
    policy: account.policy,
    allowedSenders: rules.map((r) => r.sender),
    hasReply: false,
    previouslyContacted: false,
  };
  if (!protection(mail, context)) {
    context.hasReply = await gmail.threadHasReply(mail.threadId);
    if (!context.hasReply)
      context.previouslyContacted = await gmail.hasWrittenTo(
        emailAddress(mail.from),
      );
  }
  return context;
}
async function classifyJob(accountId: string, messageId: string, gmail: Gmail) {
  const existing = await query(
    "SELECT id FROM decisions WHERE account_id=$1 AND message_id=$2",
    [accountId, messageId],
  );
  if (existing.length) return;
  const mail = await gmail.message(messageId);
  if (
    !mail.labels.includes("INBOX") ||
    mail.labels.some((l) => ["SPAM", "TRASH", "SENT", "DRAFT"].includes(l))
  )
    return;
  const context = await contextFor(accountId, gmail, mail);
  const result = await classify(mail, context);
  const candidate = shouldMove(result, context.policy);
  const id = randomUUID();
  await query(
    `INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state,ai_decision,policy_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(account_id,message_id) DO NOTHING`,
    [
      id,
      accountId,
      mail.id,
      mail.threadId,
      emailAddress(mail.from),
      mail.subject,
      result.category,
      result.confidence,
      result.reason,
      candidate ? "suggested" : "kept",
      result.decision,
      CLASSIFIER_POLICY_VERSION,
    ],
  );
  const [account] = await query(
    "SELECT mode,auto_after FROM accounts WHERE id=$1",
    [accountId],
  );
  if (
    candidate &&
    writesEnabled() &&
    account?.mode === "automatic" &&
    account.auto_after &&
    mail.receivedAt >= new Date(account.auto_after).getTime()
  ) {
    await moveDecision(id, gmail, true);
  }
}
// Caller holds the same account advisory lock used by worker and user actions.
export async function moveDecision(
  decisionId: string,
  gmail: Gmail,
  automatic = false,
) {
  if (!writesEnabled()) throw new Error("Mailbox writes disabled");
  const [decision] = await query("SELECT * FROM decisions WHERE id=$1", [
    decisionId,
  ]);
  if (!decision || !["suggested", "moving"].includes(decision.state)) return;
  if (!(await accountProcessingAllowed(decision.account_id))) return;
  const [account] = await query(
    "SELECT * FROM accounts WHERE id=$1 AND connected=true",
    [decision.account_id],
  );
  if (
    !account ||
    account.mode === "paused" ||
    (automatic && account.mode !== "automatic")
  )
    return;
  const mail = await gmail.message(decision.message_id);
  const ctx = await contextFor(decision.account_id, gmail, mail);
  const blocked = protection(mail, ctx);
  if (
    blocked ||
    mail.labels.some((l) => ["TRASH", "SPAM", "SENT", "DRAFT"].includes(l)) ||
    !authenticatedSender(mail)
  ) {
    await query(
      "UPDATE decisions SET state='kept',reason=$2,updated_at=now() WHERE id=$1",
      [
        decisionId,
        blocked?.reason ?? "El estado del correo cambió. Se conserva en Gmail.",
      ],
    );
    return;
  }
  if (!mail.labels.includes("INBOX")) {
    // A previous attempt may have succeeded before the process stopped.
    const moved =
      decision.state === "moving" &&
      decision.label_added &&
      mail.labels.includes(decision.label_added);
    await query("UPDATE decisions SET state=$2,updated_at=now() WHERE id=$1", [
      decisionId,
      moved ? "moved" : "kept",
    ]);
    return;
  }
  const result: Classification = {
    decision: decision.ai_decision,
    category: decision.category,
    confidence: decision.confidence,
    protected: false,
    reason: decision.reason,
  };
  if (!shouldMove(result, account.policy as Policy)) return;
  const label =
    decision.label_added ??
    (await gmail.ensureLabel(
      decision.category === "cold" ? "Sotto/Cold" : "Sotto/Lectura",
    ));
  const addedByUs =
    decision.state === "moving"
      ? decision.added_by_us
      : !mail.labels.includes(label);
  await query(
    "UPDATE decisions SET state='moving',label_added=$2,added_by_us=$3,inbox_removed=true,updated_at=now() WHERE id=$1",
    [decisionId, label, addedByUs],
  );
  await gmail.modify(mail.id, [label], ["INBOX"]);
  await query(
    "UPDATE decisions SET state='moved',updated_at=now() WHERE id=$1",
    [decisionId],
  );
}
export async function restoreDecision(decisionId: string, gmail: Gmail) {
  if (!writesEnabled()) throw new Error("Mailbox writes disabled");
  const [decision] = await query("SELECT * FROM decisions WHERE id=$1", [
    decisionId,
  ]);
  if (!decision || !["moved", "moving", "restoring"].includes(decision.state))
    return;
  const mail = await gmail.message(decision.message_id);
  if (mail.labels.some((l) => ["TRASH", "SPAM"].includes(l)))
    throw new Error("Message moved elsewhere; restore it in Gmail");
  await query(
    "UPDATE decisions SET state='restoring',updated_at=now() WHERE id=$1",
    [decisionId],
  );
  await gmail.modify(
    mail.id,
    decision.inbox_removed ? ["INBOX"] : [],
    decision.added_by_us && decision.label_added ? [decision.label_added] : [],
  );
  await query(
    "UPDATE decisions SET state='restored',updated_at=now() WHERE id=$1",
    [decisionId],
  );
}
export async function workAccount(accountId: string, maxJobs = 30) {
  // Queued workers wait their turn, including while an older deployment is
  // draining. The pool's statement timeout bounds this wait to 15 seconds.
  // Interactive actions still use the immediate, non-blocking lock above.
  await withAccountLock(
    accountId,
    async () => {
      const [account] = await query(
        "SELECT * FROM accounts WHERE id=$1 AND connected=true",
        [accountId],
      );
      if (!account) return;
      if (!(await accountProcessingAllowed(accountId))) return;
      const gmail = await Gmail.forAccount(accountId);
      if (
        process.env.GOOGLE_PUBSUB_TOPIC &&
        (!account.last_watch ||
          Date.now() - new Date(account.last_watch).getTime() > 20 * 3600000)
      ) {
        const watch = await gmail.watch();
        await query(
          "UPDATE accounts SET watch_expires=$2,last_watch=now() WHERE id=$1",
          [accountId, new Date(Number(watch.expiration))],
        );
      }
      if (account.mode === "paused") return;
      await syncMailbox(accountId, gmail);
      const interrupted = await query(
        "SELECT id,state FROM decisions WHERE account_id=$1 AND state IN ('moving','restoring')",
        [accountId],
      );
      for (const decision of interrupted) {
        if (decision.state === "restoring")
          await restoreDecision(decision.id, gmail);
        else await moveDecision(decision.id, gmail, false);
      }
      // Holding the account lock means no other worker owns these jobs.
      await query(
        "UPDATE jobs SET state='pending' WHERE account_id=$1 AND state='running'",
        [accountId],
      );
      const jobs = await query(
        "SELECT * FROM jobs WHERE account_id=$1 AND state='pending' AND available_at<=now() ORDER BY id LIMIT $2",
        [accountId, maxJobs],
      );
      let failed = false;
      for (const job of jobs) {
        if (!(await accountProcessingAllowed(accountId))) break;
        await query(
          "UPDATE jobs SET state='running',attempts=attempts+1,locked_at=now() WHERE id=$1",
          [job.id],
        );
        try {
          await classifyJob(accountId, job.message_id, gmail);
          await query(
            "UPDATE jobs SET state='done',last_error=NULL WHERE id=$1",
            [job.id],
          );
        } catch (error) {
          if (error instanceof GmailError && error.status === 404) {
            await query("UPDATE jobs SET state='done' WHERE id=$1", [job.id]);
            continue;
          }
          failed = true;
          const code = processingErrorCode(error);
          console.warn("Sotto classification retry", { code });
          const attempts = job.attempts + 1;
          const retry = retryPlan(error, attempts);
          await query(
            "UPDATE jobs SET state=$2,available_at=now()+($3 * interval '1 second'),last_error=$4 WHERE id=$1",
            [job.id, retry.state, retry.delay, code],
          );
          if (retry.deferMailbox) {
            // A provider limit applies to the mailbox's remaining work too.
            // Stop this batch instead of hammering the provider once per email.
            await query(
              "UPDATE jobs SET available_at=GREATEST(available_at,now()+($2 * interval '1 second')) WHERE account_id=$1 AND state='pending'",
              [accountId, retry.delay],
            );
            await query("UPDATE accounts SET last_error=$2 WHERE id=$1", [
              accountId,
              "El servicio de IA alcanzó su límite temporal. Los correos siguen pendientes; Sotto reintentará automáticamente.",
            ]);
            return;
          }
        }
      }
      const [pendingFailure] = await query(
        "SELECT 1 FROM jobs WHERE account_id=$1 AND state='failed' LIMIT 1",
        [accountId],
      );
      if (failed || pendingFailure)
        await query("UPDATE accounts SET last_error=$2 WHERE id=$1", [
          accountId,
          "Hay correos pendientes de procesar. Revisá la conexión o reintentá la sincronización.",
        ]);
    },
    true,
  );
}
