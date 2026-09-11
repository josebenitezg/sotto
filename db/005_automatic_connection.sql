-- Existing connections and in-flight OAuth attempts keep their current mode.
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS start_filtering boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS automatic_authorized_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mode_changed_at timestamptz;
