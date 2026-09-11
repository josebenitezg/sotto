import { hosted } from "./config";
import { query } from "./db";
export const pollingEnabled = () =>
  hosted() && process.env.COMPOSIO_NOTIFICATION_MODE === "poll";
export async function usesComposioPolling(accountId: string) {
  if (!pollingEnabled()) return false;
  const [account] = await query(
    `SELECT 1 FROM accounts a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=$1 AND a.mail_provider='composio' AND w.internal=false`,
    [accountId],
  );
  return !!account;
}
