-- Keep the original decision reason for auditability. A translation is used
-- only while it still matches that reason; changed decisions cannot show a
-- stale explanation. New classifier reasons are already written in English.
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS reason_en text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS reason_en_source text;
