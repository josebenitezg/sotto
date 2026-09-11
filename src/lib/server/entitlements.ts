import { hosted } from "./config";
import { query } from "./db";
import { HttpError } from "./auth";
import { mailboxLimit } from "../plans";
export type Entitlement = {
  internal?: boolean;
  full_access?: boolean;
  subscription_status: string;
  trial_end: Date | string | null;
  paid_until: Date | string | null;
  billing_plan?: string;
  connected_accounts?: number;
};
export function hasAccess(
  workspace: Entitlement | undefined,
  now = Date.now(),
) {
  if (!workspace) return false;
  if (workspace.internal || workspace.full_access) return true;
  if (
    (workspace.connected_accounts ?? 0) > mailboxLimit(workspace.billing_plan)
  )
    return false;
  const end =
    workspace.subscription_status === "trialing"
      ? workspace.trial_end
      : workspace.subscription_status === "active"
        ? workspace.paid_until
        : null;
  return !!end && new Date(end).getTime() > now;
}
export async function processingAllowed(workspaceId: string) {
  if (!hosted()) return true;
  const [workspace] = await query<Entitlement>(
    `SELECT internal,sotto_full_access(email) AS full_access,subscription_status,trial_end,paid_until,billing_plan,
      (SELECT count(*)::int FROM accounts WHERE workspace_id=workspaces.id AND connected=true) AS connected_accounts
      FROM workspaces WHERE id=$1`,
    [workspaceId],
  );
  return hasAccess(workspace);
}
export async function accountProcessingAllowed(accountId: string) {
  if (!hosted()) return true;
  const [workspace] = await query<Entitlement>(
    `SELECT w.internal,sotto_full_access(w.email) AS full_access,w.subscription_status,w.trial_end,w.paid_until,w.billing_plan,
      (SELECT count(*)::int FROM accounts WHERE workspace_id=w.id AND connected=true) AS connected_accounts
      FROM workspaces w JOIN accounts a ON a.workspace_id=w.id WHERE a.id=$1`,
    [accountId],
  );
  return hasAccess(workspace);
}
export async function requireProcessingAccess(workspaceId: string) {
  if (!(await processingAllowed(workspaceId)))
    throw new HttpError(
      402,
      "Activate your plan to continue. You can still view your history and return emails to your inbox.",
    );
}
