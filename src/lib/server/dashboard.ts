import type { Account, Dashboard, Decision, Rule } from "../types";
import { demoDashboard } from "../demo";
import { authenticated } from "./auth";
import { configured, isDemo, writesEnabled } from "./config";
import { query } from "./db";
const iso = (date: Date | null) => date?.toISOString() ?? null;
export async function dashboard(): Promise<Dashboard> {
  if (isDemo()) return structuredClone(demoDashboard);
  const ready = configured();
  const loggedIn = ready && (await authenticated());
  const empty: Dashboard = {
    accounts: [],
    decisions: [],
    rules: [],
    demo: false,
    configured: ready,
    authenticated: !!loggedIn,
    writesEnabled: writesEnabled(),
  };
  if (!loggedIn) return empty;
  const [rawAccounts, rawDecisions, rawRules] = await Promise.all([
    query(
      "SELECT id,email,name,mode,policy,connected,last_sync,watch_expires,last_error,reviewed_at FROM accounts ORDER BY CASE WHEN name='Trabajo' THEN 0 ELSE 1 END,created_at",
    ),
    query(
      "SELECT d.*,a.email FROM decisions d JOIN accounts a ON a.id=d.account_id ORDER BY d.created_at DESC LIMIT 200",
    ),
    query("SELECT * FROM sender_rules ORDER BY created_at DESC"),
  ]);
  const accounts = rawAccounts.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    mode: a.mode,
    policy: a.policy,
    connected: a.connected,
    lastSync: iso(a.last_sync),
    watchExpires: iso(a.watch_expires),
    lastError: a.last_error,
    reviewedAt: iso(a.reviewed_at),
  })) as Account[];
  const decisions = rawDecisions.map((d) => ({
    id: d.id,
    accountId: d.account_id,
    messageId: d.message_id,
    threadId: d.thread_id,
    sender: d.sender,
    subject: d.subject,
    category: d.category,
    reason: d.reason,
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
  return { ...empty, accounts, decisions, rules };
}
