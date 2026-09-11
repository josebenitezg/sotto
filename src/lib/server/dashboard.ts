import type { Account, Dashboard, Decision, Rule } from "../types";
import { demoDashboard } from "../demo";
import { sessionWorkspace } from "./auth";
import { configured, isDemo, writesEnabled } from "./config";
import { query } from "./db";
const iso = (date: Date | null) => date?.toISOString() ?? null;
export async function dashboard(): Promise<Dashboard> {
  if (isDemo()) return structuredClone(demoDashboard);
  const ready = configured();
  const workspaceId = ready ? await sessionWorkspace() : null;
  const loggedIn = !!workspaceId;
  const empty: Dashboard = {
    accounts: [],
    decisions: [],
    rules: [],
    demo: false,
    configured: ready,
    authenticated: !!loggedIn,
    writesEnabled: false,
  };
  if (!loggedIn) return empty;
  const [rawAccounts, rawDecisions, rawRules] = await Promise.all([
    query(
      `SELECT a.id,a.email,a.name,a.mode,a.policy,a.connected,a.last_sync,a.watch_expires,a.last_error,a.reviewed_at,a.start_at,a.history_id,
        j.total,j.done,j.pending,j.failed,j.retrying
       FROM accounts a LEFT JOIN LATERAL (
         SELECT count(*)::int AS total,
           count(*) FILTER (WHERE state='done')::int AS done,
           count(*) FILTER (WHERE state IN ('pending','running'))::int AS pending,
           count(*) FILTER (WHERE state='failed')::int AS failed,
           count(*) FILTER (WHERE state IN ('pending','running') AND last_error IS NOT NULL)::int AS retrying
         FROM jobs WHERE account_id=a.id
       ) j ON true WHERE a.workspace_id=$1
       ORDER BY CASE WHEN a.name IN ('Trabajo','Work') THEN 0 ELSE 1 END,a.created_at`,
      [workspaceId],
    ),
    query(
      `SELECT d.*,a.email FROM accounts a JOIN LATERAL (
         SELECT * FROM decisions WHERE account_id=a.id
         ORDER BY created_at DESC LIMIT 200
       ) d ON true WHERE a.workspace_id=$1 ORDER BY d.created_at DESC`,
      [workspaceId],
    ),
    query(
      "SELECT r.* FROM sender_rules r JOIN accounts a ON a.id=r.account_id WHERE a.workspace_id=$1 ORDER BY r.created_at DESC",
      [workspaceId],
    ),
  ]);
  const accounts = rawAccounts.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name === "Trabajo" ? "Work" : a.name,
    mode: a.mode,
    policy: a.policy,
    connected: a.connected,
    writesEnabled: a.connected && writesEnabled(a.id),
    lastSync: iso(a.last_sync),
    watchExpires: iso(a.watch_expires),
    lastError: a.last_error,
    reviewedAt: iso(a.reviewed_at),
    sync: {
      scanning: !a.history_id,
      since: iso(a.start_at),
      total: a.total,
      done: a.done,
      pending: a.pending,
      failed: a.failed,
      retrying: a.retrying,
    },
  })) as Account[];
  const decisions = rawDecisions.map((d) => ({
    id: d.id,
    accountId: d.account_id,
    messageId: d.message_id,
    threadId: d.thread_id,
    sender: d.sender,
    subject: d.subject,
    category: d.category,
    reason:
      d.reason_en_source === d.reason && d.reason_en ? d.reason_en : d.reason,
    state: d.state,
    confidence: d.confidence,
    createdAt: iso(d.created_at),
    gmailUrl: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(d.email)}#all/${encodeURIComponent(d.thread_id)}`,
  })) as Decision[];
  const rules = rawRules.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    sender: r.sender,
    createdAt: iso(r.created_at),
  })) as Rule[];
  return {
    ...empty,
    accounts,
    decisions,
    rules,
    writesEnabled: accounts.some((a) => a.writesEnabled),
  };
}
