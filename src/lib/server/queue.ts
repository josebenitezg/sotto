import { createHash } from "node:crypto";
import { QueueClient } from "@vercel/queue";
import { isDemo } from "./config";

// Payloads only identify the account; the durable work lives in PostgreSQL.
// Let pending deliveries use the current deployment, so continuations do not
// keep obsolete classifiers and provider credentials alive after a release.
const queue = new QueueClient({ region: "iad1", deploymentId: null });
export const handleMailboxCallback = queue.handleCallback;

export async function enqueueAccount(
  accountId: string,
  key?: string,
  delaySeconds = 0,
) {
  if (process.env.QUEUE_DRIVER !== "vercel" || isDemo()) return;
  await queue.send(
    "sotto-mailboxes",
    { accountId },
    {
      delaySeconds,
      retentionSeconds: 86400,
      ...(key
        ? { idempotencyKey: createHash("sha256").update(key).digest("hex") }
        : {}),
    },
  );
}
