import { hosted } from "./config";
import { query } from "./db";
import { HttpError } from "./auth";
export type Entitlement = {
  internal?: boolean;
  subscription_status: string;
  trial_end: Date | string | null;
  paid_until: Date | string | null;
};
export function hasAccess(
  workspace: Entitlement | undefined,
  now = Date.now(),
) {
  if (!workspace) return false;
  if (workspace.internal) return true;
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
    "SELECT internal,subscription_status,trial_end,paid_until FROM workspaces WHERE id=$1",
    [workspaceId],
  );
  return hasAccess(workspace);
}
export async function accountProcessingAllowed(accountId: string) {
  if (!hosted()) return true;
  const [workspace] = await query<Entitlement>(
    "SELECT w.internal,w.subscription_status,w.trial_end,w.paid_until FROM workspaces w JOIN accounts a ON a.workspace_id=w.id WHERE a.id=$1",
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
