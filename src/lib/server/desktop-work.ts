import { randomUUID } from "node:crypto";
import {
  LOCAL_CLASSIFIER_INSTRUCTIONS,
  LOCAL_POLICY_VERSION,
} from "./desktop-prompt";
import { z } from "zod";
import { query, transaction } from "./db";
import { HttpError } from "./auth";
import { Gmail, GmailError, emailAddress } from "./google";
import {
  withAccountLock,
  syncMailbox,
  contextFor,
  moveDecision,
  restoreDecision,
} from "./engine";
import {
  classificationSchema,
  protection,
  shouldMove,
  authenticatedSender,
} from "./classifier";
import { coldMemory, MEMORY_INSTRUCTIONS } from "./cold-memory";
import { requireProcessingAccess } from "./entitlements";
import {
  accountAllowance,
  reserveMessage,
  MailAllowanceReached,
} from "./allowances";
import { writesEnabled } from "./config";
import { retryPlan, processingErrorCode } from "./processing-error";
import type { Classification } from "../types";

const accountKey = z.string().regex(/^[a-zA-Z0-9_-]{1,255}$/);
export async function enableDesktop(
  workspaceId: string,
  device: string,
  accountId: string,
  mode: string,
) {
  accountKey.parse(accountId);
  z.enum(["review", "automatic", "paused"]).parse(mode);
  return withAccountLock(accountId, async () => {
    const [account] = await query(
      "SELECT * FROM accounts WHERE id=$1 AND workspace_id=$2 AND connected=true",
      [accountId, workspaceId],
    );
    if (!account || account.mail_provider !== "composio")
      throw new HttpError(
        409,
        "Connect this Gmail account with Composio first.",
      );
    if (mode !== "paused") await requireProcessingAccess(workspaceId);
    if (mode === "automatic" && !writesEnabled(accountId))
      throw new HttpError(409, "Filtering is disabled for this account.");
    await transaction(async (db) => {
      await db.query(
        "INSERT INTO desktop_accounts(account_id,device_hash) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET device_hash=$2,enabled=true,updated_at=now()",
        [accountId, device],
      );
      await db.query("DELETE FROM desktop_leases WHERE account_id=$1", [
        accountId,
      ]);
      await db.query(
        "UPDATE decisions SET local_auto_pending=false WHERE account_id=$1 AND state='suggested'",
        [accountId],
      );
      await db.query(
        "UPDATE jobs SET state='pending',available_at=now() WHERE account_id=$1 AND state='running'",
        [accountId],
      );
      await db.query(
        "UPDATE accounts SET policy=jsonb_set(policy,'{processingLocation}','\"desktop\"'::jsonb),mode=$2,mode_changed_at=now(),auto_after=CASE WHEN $2='automatic' THEN now() ELSE auto_after END,last_error=NULL WHERE id=$1",
        [accountId, mode],
      );
    });
    return { ok: true };
  });
}
async function ownedAccount(
  workspace: string,
  device: string,
  accountId: string,
) {
  const [account] = await query(
    "SELECT a.* FROM accounts a JOIN desktop_accounts d ON d.account_id=a.id WHERE a.id=$1 AND a.workspace_id=$2 AND a.connected=true AND d.enabled=true AND d.device_hash=$3",
    [accountId, workspace, device],
  );
  if (!account)
    throw new HttpError(
      409,
      "Enable this account on this Mac before processing.",
    );
  return account;
}
export async function claimDesktop(
  workspace: string,
  device: string,
  accountId: string,
) {
  accountKey.parse(accountId);
  return withAccountLock(accountId, async () => {
    const account = await ownedAccount(workspace, device, accountId);
    await requireProcessingAccess(workspace);
    if (account.mode === "paused") return {};
    // One lease per mailbox. Expiry recovers interrupted apps without exposing bodies in a queue.
    await query(
      "DELETE FROM desktop_leases WHERE account_id=$1 AND expires_at<=now()",
      [accountId],
    );
    if (
      (
        await query("SELECT 1 FROM desktop_leases WHERE account_id=$1", [
          accountId,
        ])
      ).length
    )
      return {};
    const gmail = await Gmail.forAccount(accountId);
    for (const d of await query(
      "SELECT id,state,local_auto_pending FROM decisions WHERE account_id=$1 AND (state IN ('moving','restoring') OR (state='suggested' AND local_auto_pending=true)) ORDER BY created_at LIMIT 3",
      [accountId],
    )) {
      if (!writesEnabled(accountId)) break;
      if (d.state === "restoring") await restoreDecision(d.id, gmail);
      else await moveDecision(d.id, gmail, d.local_auto_pending);
      await query("UPDATE decisions SET local_auto_pending=false WHERE id=$1", [
        d.id,
      ]);
    }
    const [feedback] = await query(
      "SELECT f.decision_id,d.message_id FROM cold_feedback f JOIN decisions d ON d.id=f.decision_id WHERE d.account_id=$1 AND d.state='moved' AND f.pattern IS NULL AND f.attempts<3 AND f.available_at<=now() ORDER BY f.created_at LIMIT 1",
      [accountId],
    );
    if (feedback) {
      await query(
        "UPDATE cold_feedback SET attempts=attempts+1,available_at=now()+interval '5 minutes' WHERE decision_id=$1",
        [feedback.decision_id],
      );
      const mail = await gmail.message(feedback.message_id);
      const id = randomUUID();
      await query(
        "INSERT INTO desktop_leases(id,account_id,message_id,device_hash,kind,decision_id) VALUES($1,$2,$3,$4,'learn',$5)",
        [id, accountId, mail.id, device, feedback.decision_id],
      );
      return {
        id,
        kind: "learn",
        instructions: MEMORY_INSTRUCTIONS,
        input: {
          ownerCorrection: "This specific email is unwanted cold outreach.",
          email: { subject: mail.subject, body: mail.text.slice(0, 6000) },
        },
      };
    }
    const allowance = await accountAllowance(accountId);
    if (
      !allowance?.exhausted &&
      (!account.last_sync ||
        Date.now() - new Date(account.last_sync).getTime() > 120000 ||
        account.sync_page_token)
    )
      await syncMailbox(accountId, gmail);
    await query(
      "UPDATE jobs SET state='pending' WHERE account_id=$1 AND state='running'",
      [accountId],
    );
    const [job] = await query(
      "SELECT j.* FROM jobs j WHERE j.account_id=$1 AND j.state='pending' AND j.available_at<=now() AND ($2 OR EXISTS(SELECT 1 FROM message_allowances m WHERE m.account_id=j.account_id AND m.message_id=j.message_id)) ORDER BY j.id LIMIT 1",
      [accountId, !allowance?.exhausted],
    );
    if (!job) return {};
    if (
      (
        await query(
          "SELECT 1 FROM decisions WHERE account_id=$1 AND message_id=$2",
          [accountId, job.message_id],
        )
      ).length
    ) {
      await query("UPDATE jobs SET state='done' WHERE id=$1", [job.id]);
      return {};
    }
    try {
      await reserveMessage(accountId, job.message_id);
    } catch (e) {
      if (e instanceof MailAllowanceReached) return {};
      throw e;
    }
    if (job.attempts >= 8) {
      await query(
        "UPDATE jobs SET state='failed',last_error='local_retries_exhausted' WHERE id=$1",
        [job.id],
      );
      return {};
    }
    await query(
      "UPDATE jobs SET state='running',locked_at=now(),attempts=attempts+1 WHERE id=$1",
      [job.id],
    );
    try {
      const mail = await gmail.message(job.message_id);
      if (
        !mail.labels.includes("INBOX") ||
        mail.labels.some((l) => ["TRASH", "SPAM", "SENT", "DRAFT"].includes(l))
      ) {
        await query("UPDATE jobs SET state='done' WHERE id=$1", [job.id]);
        return {};
      }
      const context = await contextFor(accountId, gmail, mail);
      const protectedResult = protection(mail, context);
      const id = randomUUID();
      await query(
        "INSERT INTO desktop_leases(id,account_id,message_id,device_hash,kind) VALUES($1,$2,$3,$4,'classify')",
        [id, accountId, mail.id, device],
      );
      if (protectedResult) {
        await completeUnderLock(workspace, device, id, protectedResult);
        return {};
      }
      context.coldCorrections = await coldMemory(accountId);
      return {
        id,
        kind: "classify",
        instructions: LOCAL_CLASSIFIER_INSTRUCTIONS,
        input: {
          recipient: context.accountEmail,
          sender: mail.from,
          subject: mail.subject,
          body: mail.text,
          listMail: !!mail.headers["list-unsubscribe"],
          context: {
            preferences: context.policy.instructions || "",
            coldCorrections: context.coldCorrections,
            enabledCategories: {
              cold: true,
              marketing: context.policy.marketing,
              newsletter: context.policy.newsletters,
            },
            hasReply: context.hasReply,
            previouslyContacted: context.previouslyContacted,
          },
        },
      };
    } catch (error) {
      await query(
        "DELETE FROM desktop_leases WHERE account_id=$1 AND message_id=$2",
        [accountId, job.message_id],
      );
      if (error instanceof GmailError && error.status === 404) {
        await query("UPDATE jobs SET state='done' WHERE id=$1", [job.id]);
        return {};
      }
      const retry = retryPlan(error, job.attempts + 1);
      await query(
        "UPDATE jobs SET state=$2,available_at=now()+($3*interval '1 second'),last_error=$4 WHERE id=$1",
        [job.id, retry.state, retry.delay, processingErrorCode(error)],
      );
      throw error;
    }
  });
}
export async function completeDesktop(
  workspace: string,
  device: string,
  id: string,
  result: unknown,
) {
  const [lease] = await query(
    "SELECT l.account_id FROM desktop_leases l JOIN accounts a ON a.id=l.account_id WHERE l.id=$1 AND l.device_hash=$2 AND a.workspace_id=$3",
    [id, device, workspace],
  );
  if (!lease)
    throw new HttpError(409, "This task expired. Check again to continue.");
  return withAccountLock(lease.account_id, () =>
    completeUnderLock(workspace, device, id, result),
  );
}
async function completeUnderLock(
  workspace: string,
  device: string,
  id: string,
  raw: unknown,
) {
  const [lease] = await query(
    "SELECT * FROM desktop_leases WHERE id=$1 AND device_hash=$2 AND expires_at>now()",
    [id, device],
  );
  if (!lease)
    throw new HttpError(409, "This task expired. Check again to continue.");
  const account = await ownedAccount(workspace, device, lease.account_id);
  await requireProcessingAccess(workspace);
  if (account.mode === "paused")
    throw new HttpError(409, "This account is paused.");
  if (lease.kind === "learn") {
    const checked = z
      .object({ pattern: z.string().trim().max(450) })
      .safeParse(raw);
    if (!checked.success)
      throw new HttpError(400, "The model returned an invalid pattern.");
    const { pattern } = checked.data;
    if (
      pattern &&
      /@|https?:|www\.|\b[\w-]+\.(?:com|net|org|io|ai|email)\b|\d/i.test(
        pattern,
      )
    )
      throw new HttpError(
        400,
        "The learned pattern contains private identifiers.",
      );
    if (pattern)
      await query(
        "UPDATE cold_feedback SET pattern=$2 WHERE decision_id=$1 AND EXISTS(SELECT 1 FROM decisions WHERE id=$1 AND state='moved')",
        [lease.decision_id, pattern],
      );
    await query("DELETE FROM desktop_leases WHERE id=$1", [id]);
    return { ok: true };
  }
  const checked = classificationSchema.safeParse(raw);
  if (!checked.success)
    throw new HttpError(400, "The model returned an invalid decision.");
  const parsed = checked.data;
  const gmail = await Gmail.forAccount(account.id);
  const mail = await gmail.message(lease.message_id);
  const context = await contextFor(account.id, gmail, mail);
  const safe =
    mail.labels.includes("INBOX") &&
    !mail.labels.some((l) => ["SPAM", "TRASH", "SENT", "DRAFT"].includes(l));
  // Small models can quote body details despite prompt instructions. Persist only
  // a fixed explanation; never the free-form model reason, identifiers or codes.
  const localReasons: Record<Classification["category"], string> = {
    cold: "The local model identified individual sales outreach.",
    marketing: "The local model identified a marketing campaign.",
    newsletter: "The local model identified an editorial newsletter.",
    transactional:
      "The local model identified a transactional or operational message.",
    personal: "The local model identified a potentially useful message.",
    uncertain: "The local model could not confidently categorize this message.",
  };
  let result: Classification = protection(mail, context) ?? {
    ...parsed,
    reason: localReasons[parsed.category],
  };
  if (result.protected && result.decision === "move")
    result = { ...result, decision: "keep" };
  if (!safe || !authenticatedSender(mail))
    result = { ...result, decision: "keep", protected: true };
  // The client never supplies Gmail IDs, label IDs, a price, or permission to bypass server policy.
  const candidate = shouldMove(result, context.policy);
  const decisionId = randomUUID();
  const autoPending =
    candidate &&
    account.mode === "automatic" &&
    writesEnabled(account.id) &&
    !!account.auto_after &&
    mail.receivedAt >= new Date(account.auto_after).getTime();
  await transaction(async (db) => {
    await db.query(
      "INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state,ai_decision,policy_version,local_auto_pending) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(account_id,message_id) DO NOTHING",
      [
        decisionId,
        account.id,
        mail.id,
        mail.threadId,
        emailAddress(mail.from),
        mail.subject,
        result.category,
        result.confidence,
        result.reason,
        candidate ? "suggested" : "kept",
        result.decision,
        `local:${LOCAL_POLICY_VERSION}`,
        autoPending,
      ],
    );
    await db.query(
      "UPDATE jobs SET state='done',last_error=NULL WHERE account_id=$1 AND message_id=$2",
      [account.id, mail.id],
    );
    await db.query("DELETE FROM desktop_leases WHERE id=$1", [id]);
  });
  if (autoPending) {
    await moveDecision(decisionId, gmail, true);
    await query("UPDATE decisions SET local_auto_pending=false WHERE id=$1", [
      decisionId,
    ]);
  }
  return { ok: true };
}

export async function failDesktop(
  workspace: string,
  device: string,
  id: string,
) {
  const [lease] = await query(
    "SELECT l.* FROM desktop_leases l JOIN accounts a ON a.id=l.account_id WHERE l.id=$1 AND l.device_hash=$2 AND a.workspace_id=$3",
    [id, device, workspace],
  );
  if (!lease) return { ok: true };
  return withAccountLock(lease.account_id, async () => {
    await ownedAccount(workspace, device, lease.account_id);
    await query(
      "UPDATE jobs SET state=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,available_at=now()+interval '2 minutes',last_error='local_model_retry' WHERE account_id=$1 AND message_id=$2 AND state='running'",
      [lease.account_id, lease.message_id],
    );
    await query("DELETE FROM desktop_leases WHERE id=$1 AND device_hash=$2", [
      id,
      device,
    ]);
    return { ok: true };
  });
}
