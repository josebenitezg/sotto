CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  token_cipher text NOT NULL,
  mode text NOT NULL DEFAULT 'review' CHECK (mode IN ('review','automatic','paused')),
  policy jsonb NOT NULL DEFAULT '{"marketing":false,"newsletters":false,"protectedDomains":[]}',
  connected boolean NOT NULL DEFAULT true,
  history_id text,
  start_at timestamptz NOT NULL DEFAULT now(),
  watch_expires timestamptz,
  last_watch timestamptz,
  last_sync timestamptz,
  last_error text,
  label_cold text,
  label_reading text,
  reviewed_at timestamptz,
  auto_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash text PRIMARY KEY,
  verifier_cipher text NOT NULL,
  browser_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS sender_rules (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sender text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, sender)
);
CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  UNIQUE (account_id, message_id)
);
CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  thread_id text NOT NULL,
  sender text NOT NULL,
  subject text NOT NULL,
  category text NOT NULL,
  confidence double precision NOT NULL,
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('suggested','kept','moving','moved','restoring','restored')),
  label_added text,
  added_by_us boolean NOT NULL DEFAULT false,
  inbox_removed boolean NOT NULL DEFAULT false,
  policy_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, message_id)
);
CREATE TABLE IF NOT EXISTS mailbox_events (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  history_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(state, available_at);
CREATE INDEX IF NOT EXISTS decisions_account_date ON decisions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_pending ON mailbox_events(account_id) WHERE processed_at IS NULL;

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS ai_decision text NOT NULL DEFAULT 'review' CHECK(ai_decision IN ('keep','review','move'));
