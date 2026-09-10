import { z } from "zod";
import { query } from "@/lib/server/db";
import { workAccount } from "@/lib/server/engine";
import { enqueueAccount } from "@/lib/server/queue";
import { isDemo } from "@/lib/server/config";
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
  // Small batches stay within the function's execution window.
  await workAccount(accountId, 3);
  const [pending] = await query(
    "SELECT min(available_at) AS next_at FROM jobs WHERE account_id=$1 AND state IN ('pending','running')",
    [accountId],
  );
  if (pending?.next_at) {
    const delay = Math.min(
      3600,
      Math.max(
        1,
        Math.ceil((new Date(pending.next_at).getTime() - Date.now()) / 1000),
      ),
    );
    await enqueueAccount(accountId, `${metadata.messageId}:next`, delay);
  }
  console.info("Sotto mailbox batch completed", {
    queueMessageId: metadata.messageId,
    continuation: !!pending?.next_at,
  });
}
