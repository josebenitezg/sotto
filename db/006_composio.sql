ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mail_provider text NOT NULL DEFAULT 'google' CHECK (mail_provider IN ('google','composio'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS composio_account_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS composio_user_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS composio_trigger_id text;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_composio_connection ON accounts(composio_account_id) WHERE composio_account_id IS NOT NULL;

-- The browser proves ownership before Composio exchanges the Google grant.
-- No Gmail credential or email content is stored in a pending connection.
CREATE TABLE IF NOT EXISTS composio_states (
  browser_hash text PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  connection_id text NOT NULL UNIQUE,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  start_filtering boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);

-- Retired Composio grants remain retryable even after local Gmail data is gone.
CREATE TABLE IF NOT EXISTS composio_cleanup (
  connection_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
