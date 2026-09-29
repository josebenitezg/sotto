import { isDemo } from "./config";
import { query } from "./db";
import { processingAllowed } from "./entitlements";
import { workspaceAllowance } from "./allowances";
import { enqueueAccount } from "./queue";

// A connection can be admitted before its owner receives processing access.
// Recover the discarded first delivery when the dashboard next refreshes.
export async function recoverInitialSync(workspaceId: string) {
  if (isDemo() || process.env.QUEUE_DRIVER !== "vercel") return;
  if (!(await processingAllowed(workspaceId))) return;
  if ((await workspaceAllowance(workspaceId))?.exhausted) return;
  const accounts = await query<{ id: string }>(
    `SELECT id FROM accounts WHERE workspace_id=$1 AND connected=true
      AND mode<>'paused' AND last_sync IS NULL
      AND COALESCE(policy->>'processingLocation','cloud')<>'desktop'
      AND created_at<now()-interval '30 seconds'`,
    [workspaceId],
  );
  for (const account of accounts) {
    // One durable claim per minute across tabs and concurrent function instances.
    const [claim] = await query<{ id: string }>(
      `INSERT INTO mailbox_events(id,account_id,history_id)
       SELECT 'initial-recovery:' || id || ':' || floor(extract(epoch FROM now())/60)::text,id,'0'
       FROM accounts WHERE id=$1 AND workspace_id=$2 AND connected=true
         AND mode<>'paused' AND last_sync IS NULL
         AND COALESCE(policy->>'processingLocation','cloud')<>'desktop'
       ON CONFLICT DO NOTHING RETURNING id`,
      [account.id, workspaceId],
    );
    if (!claim) continue;
    try {
      await enqueueAccount(account.id, claim.id);
    } catch (error) {
      await query("DELETE FROM mailbox_events WHERE id=$1", [claim.id]);
      throw error;
    }
  }
}
