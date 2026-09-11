import { z } from "zod";
import { query } from "@/lib/server/db";
import { AccountBusy, workAccount } from "@/lib/server/engine";
import { enqueueAccount } from "@/lib/server/queue";
import { isDemo } from "@/lib/server/config";
import { accountProcessingAllowed } from "@/lib/server/entitlements";
import { accountAllowance } from "@/lib/server/allowances";
export async function consumeMailbox(
  payload: unknown,
  metadata: { messageId: string },
) {
  if (isDemo() || process.env.QUEUE_DRIVER !== "vercel") return;
  const { accountId } = z
    .object({ accountId: z.string().min(1).max(255) })
    .parse(payload);
  const [account] = await query(
    "SELECT id FROM accounts WHERE id=$1 AND connected=true AND mode<>'paused'",
    [accountId],
  );
  if (!account) {
    console.info("Sotto queue delivery completed: account inactive", {
      queueMessageId: metadata.messageId,
    });
    return;
  }
  if (!(await accountProcessingAllowed(accountId))) return;
  // Small batches stay within the function's execution window.
  try {
    await workAccount(accountId, 3);
  } catch (error) {
    if (!(error instanceof AccountBusy)) throw error;
    // Acknowledge only once a delayed replacement is durable. If scheduling
    // fails, the original delivery remains retryable through the queue.
    await enqueueAccount(accountId, `${metadata.messageId}:busy`, 15);
    return;
  }
  if (!(await accountProcessingAllowed(accountId))) return;
  const allowance = await accountAllowance(accountId);
  const [pending] = await query(
    `SELECT (SELECT min(available_at) FROM jobs j WHERE j.account_id=$1 AND j.state IN ('pending','running')
      AND ($2 OR EXISTS (SELECT 1 FROM message_allowances m WHERE m.account_id=j.account_id AND m.message_id=j.message_id))) AS next_at,
      (SELECT sync_page_token IS NOT NULL FROM accounts WHERE id=$1) AS scan_pending`,
    [accountId, !allowance?.exhausted],
  );
  if (pending?.next_at || (pending?.scan_pending && !allowance?.exhausted)) {
    const delay = Math.min(
      3600,
      Math.max(
        1,
        pending.next_at
          ? Math.ceil((new Date(pending.next_at).getTime() - Date.now()) / 1000)
          : 1,
      ),
    );
    await enqueueAccount(accountId, `${metadata.messageId}:next`, delay);
  }
  console.info("Sotto mailbox batch completed", {
    queueMessageId: metadata.messageId,
    continuation: !!pending?.next_at,
  });
}
