import { plans, isPlanId } from "../plans";
import { hosted } from "./config";
import { query, transaction } from "./db";
import { hasAccess, type Entitlement } from "./entitlements";
import type { MailAllowance } from "../types";

export class MailAllowanceReached extends Error {}
type UsageWorkspace = Entitlement & {
  billing_plan: string;
  allowance_trial: boolean;
  allowance_period: string | null;
  allowance_resets_at: Date | null;
  used: number;
};
function limitFor(workspace: {
  billing_plan: string;
  allowance_trial: boolean;
}) {
  const plan =
    plans[isPlanId(workspace.billing_plan) ? workspace.billing_plan : "solo"];
  return workspace.allowance_trial ? plan.trialEmails : plan.emails;
}
export async function workspaceAllowance(
  workspaceId: string,
): Promise<MailAllowance | null> {
  if (!hosted()) return null;
  const [w] = await query<UsageWorkspace>(
    `SELECT w.*,sotto_full_access(w.email) AS full_access,COALESCE(u.used,0)::int AS used FROM workspaces w
    LEFT JOIN usage_periods u ON u.workspace_id=w.id AND u.period=w.allowance_period WHERE w.id=$1`,
    [workspaceId],
  );
  if (!w || w.internal || w.full_access) return null;
  const limit = limitFor(w);
  const remaining =
    w.allowance_period && hasAccess(w) ? Math.max(0, limit - w.used) : 0;
  return {
    limit,
    used: w.used,
    remaining,
    trial: w.allowance_trial,
    resetsAt: w.allowance_resets_at?.toISOString() ?? null,
    exhausted: remaining === 0,
  };
}
export async function accountAllowance(accountId: string) {
  if (!hosted()) return null;
  const [account] = await query(
    "SELECT workspace_id FROM accounts WHERE id=$1",
    [accountId],
  );
  return account ? workspaceAllowance(account.workspace_id) : null;
}
// All mailboxes in a workspace reserve under the same lock. Counting before
// provider calls bounds new work; retries and Undo never consume another slot.
export async function reserveMessage(accountId: string, messageId: string) {
  if (!hosted()) return;
  await transaction(async (db) => {
    const {
      rows: [w],
    } = await db.query(
      `SELECT w.*,sotto_full_access(w.email) AS full_access FROM workspaces w JOIN accounts a ON a.workspace_id=w.id WHERE a.id=$1 FOR UPDATE OF w`,
      [accountId],
    );
    if (w?.internal || w?.full_access) return;
    if (!w || !hasAccess(w) || !w.allowance_period)
      throw new MailAllowanceReached("Your plan is not active.");
    const { rows: existing } = await db.query(
      "SELECT 1 FROM message_allowances WHERE account_id=$1 AND message_id=$2",
      [accountId, messageId],
    );
    if (existing.length) return;
    await db.query(
      "INSERT INTO usage_periods(workspace_id,period) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [w.id, w.allowance_period],
    );
    const {
      rows: [usage],
    } = await db.query(
      "SELECT used FROM usage_periods WHERE workspace_id=$1 AND period=$2",
      [w.id, w.allowance_period],
    );
    if (usage.used >= limitFor(w))
      throw new MailAllowanceReached("Your included emails have been used.");
    await db.query(
      "INSERT INTO message_allowances(account_id,message_id,workspace_id,period) VALUES($1,$2,$3,$4)",
      [accountId, messageId, w.id, w.allowance_period],
    );
    await db.query(
      "UPDATE usage_periods SET used=used+1 WHERE workspace_id=$1 AND period=$2",
      [w.id, w.allowance_period],
    );
  });
}
