import { handleMailboxCallback } from "@/lib/server/queue";
import { consumeMailbox } from "@/lib/server/cloud-worker";
export const maxDuration = 300;
const callback = handleMailboxCallback(consumeMailbox, {
  visibilityTimeoutSeconds: 330,
});
export async function POST(request: Request) {
  return callback(request);
}
