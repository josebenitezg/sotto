-- The signed-in person's name and picture, shown in the header. Optional:
-- older connections and providers without the profile scope leave them null.
ALTER TABLE workspace_identities ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE workspace_identities ADD COLUMN IF NOT EXISTS picture text;
-- Which identity signed in, so a workspace with two accounts shows the right person.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS identity_id text;
