import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import { isDemo } from "./config";

export async function enqueueAccount(
  accountId: string,
  key?: string,
  delaySeconds = 0,
) {
  if (process.env.QUEUE_DRIVER !== "vercel" || isDemo()) return;
  await send(
    "sotto-mailboxes",
    { accountId },
    {
      region: "iad1",
      delaySeconds,
      retentionSeconds: 86400,
      ...(key
        ? { idempotencyKey: createHash("sha256").update(key).digest("hex") }
        : {}),
    },
  );
}
