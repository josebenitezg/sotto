CREATE TABLE IF NOT EXISTS desktop_pairings (
  id text PRIMARY KEY,
  challenge text NOT NULL UNIQUE,
  user_code text NOT NULL,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE TABLE IF NOT EXISTS desktop_accounts (
  account_id text PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  device_hash text REFERENCES sessions(token_hash) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS desktop_leases (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  device_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('classify','learn')),
  decision_id text REFERENCES decisions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  UNIQUE(account_id,message_id,kind)
);
CREATE INDEX IF NOT EXISTS desktop_pairings_expiry ON desktop_pairings(expires_at);

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS local_auto_pending boolean NOT NULL DEFAULT false;
