-- Login ownership survives deletion of a Gmail connection. No Gmail token,
-- address, preferences, message metadata or classification is stored here.
CREATE TABLE IF NOT EXISTS workspace_identities (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  gmail_deleted_at timestamptz
);
INSERT INTO workspace_identities(id,workspace_id)
  SELECT id,workspace_id FROM accounts ON CONFLICT(id) DO NOTHING;
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT clock_timestamp();
