import { timingSafeEqual } from "node:crypto";
import { isDemo } from "@/lib/server/config";
import { pollingEnabled } from "@/lib/server/polling";
import { query } from "@/lib/server/db";
import { accountProcessingAllowed } from "@/lib/server/entitlements";
import { accountAllowance } from "@/lib/server/allowances";
import { enqueueAccount } from "@/lib/server/queue";
export const maxDuration = 60;
export async function GET(request: Request) {
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response(null, { status: 401 });
  if (isDemo() || !pollingEnabled() || process.env.QUEUE_DRIVER !== "vercel")
    return new Response(null, { status: 404 });
  const accounts =
    await query(`SELECT a.id FROM accounts a JOIN workspaces w ON w.id=a.workspace_id
    WHERE a.connected=true AND a.mode<>'paused' AND a.mail_provider='composio' AND w.internal=false ORDER BY a.created_at`);
  let queued = 0;
  for (const account of accounts) {
    if (!(await accountProcessingAllowed(account.id))) continue;
    if ((await accountAllowance(account.id))?.exhausted) continue;
    await enqueueAccount(
      account.id,
      `poll:${account.id}:${Math.floor(Date.now() / 1800000)}`,
    );
    queued++;
  }
  return Response.json({ queued });
}
