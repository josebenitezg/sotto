CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  email text NOT NULL,
  internal boolean NOT NULL DEFAULT false,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  subscription_status text NOT NULL DEFAULT 'none',
  trial_used boolean NOT NULL DEFAULT false,
  trial_end timestamptz,
  paid_until timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  checkout_id text,
  checkout_url text,
  checkout_expires timestamptz,
  checkout_attempt text,
  billing_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS checkout_attempt text;
INSERT INTO workspaces(id,email,internal) VALUES('installation','',true) ON CONFLICT DO NOTHING;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'installation' REFERENCES workspaces(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'installation' REFERENCES workspaces(id);
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS workspace_id text REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS accounts_workspace ON accounts(workspace_id);
CREATE TABLE IF NOT EXISTS stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
