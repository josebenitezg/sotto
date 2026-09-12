export type Mode = "review" | "automatic" | "paused";
export type Category =
  | "cold"
  | "marketing"
  | "newsletter"
  | "transactional"
  | "personal"
  | "uncertain";
export type DecisionState =
  "suggested" | "kept" | "moving" | "moved" | "restoring" | "restored";
export type Policy = {
  marketing: boolean;
  newsletters: boolean;
  protectedDomains: string[];
  instructions?: string;
};
export const defaultPolicy: Policy = {
  marketing: false,
  newsletters: false,
  protectedDomains: [],
};
export type Account = {
  id: string;
  email: string;
  name: string;
  mode: Mode;
  policy: Policy;
  connected: boolean;
  writesEnabled: boolean;
  lastSync: string | null;
  watchExpires: string | null;
  lastError: string | null;
  reviewedAt: string | null;
  sync?: {
    scanning?: boolean;
    since: string;
    total: number;
    done: number;
    pending: number;
    failed: number;
    retrying: number;
  };
};
export type Decision = {
  id: string;
  accountId: string;
  messageId: string;
  threadId: string;
  sender: string;
  subject: string;
  category: Category;
  reason: string;
  state: DecisionState;
  createdAt: string;
  confidence: number;
  gmailUrl?: string;
};
export type Rule = {
  id: string;
  accountId: string;
  sender: string;
  createdAt: string;
};
export type MailAllowance = {
  limit: number;
  used: number;
  remaining: number;
  trial: boolean;
  resetsAt: string | null;
  exhausted: boolean;
};
export type Dashboard = {
  allowance?: MailAllowance | null;
  accessActive?: boolean;
  /** Connected Gmail accounts the plan covers. Null when unlimited. */
  accountLimit?: number | null;
  accounts: Account[];
  decisions: Decision[];
  rules: Rule[];
  demo: boolean;
  configured: boolean;
  authenticated: boolean;
  writesEnabled: boolean;
};
export type Mail = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  text: string;
  labels: string[];
  headers: Record<string, string>;
  receivedAt: number;
};
export type Classification = {
  decision: "keep" | "review" | "move";
  category: Category;
  confidence: number;
  reason: string;
  protected: boolean;
};
