import { timingSafeEqual } from "node:crypto";
import { query } from "@/lib/server/db";
import { enqueueAccount } from "@/lib/server/queue";
import { isDemo } from "@/lib/server/config";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response(null, { status: 401 });
  if (isDemo() || process.env.QUEUE_DRIVER !== "vercel")
    return new Response(null, { status: 404 });
  const accounts = await query(
    "SELECT id FROM accounts WHERE connected=true AND mode<>'paused' ORDER BY created_at",
  );
  for (const account of accounts) await enqueueAccount(account.id);
  await query("DELETE FROM sessions WHERE expires_at<now()");
  await query("DELETE FROM oauth_states WHERE expires_at<now()");
  await query(
    "DELETE FROM mailbox_events WHERE processed_at<now()-interval '7 days'",
  );
  return Response.json({ queued: accounts.length });
}
