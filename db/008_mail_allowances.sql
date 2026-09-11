ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS allowance_period text;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS allowance_resets_at timestamptz;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS allowance_trial boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS usage_periods (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period text NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (workspace_id,period)
);
CREATE TABLE IF NOT EXISTS message_allowances (
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  workspace_id text NOT NULL,
  period text NOT NULL,
  PRIMARY KEY (account_id,message_id),
  FOREIGN KEY (workspace_id,period) REFERENCES usage_periods(workspace_id,period) ON DELETE CASCADE
);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sync_page_token text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sync_cursor text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sync_kind text;
