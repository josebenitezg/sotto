import { handleCallback } from "@vercel/queue";
import { consumeMailbox } from "@/lib/server/cloud-worker";
export const maxDuration = 300;
const callback = handleCallback(consumeMailbox, {
  visibilityTimeoutSeconds: 330,
});
export async function POST(request: Request) {
  return callback(request);
}
