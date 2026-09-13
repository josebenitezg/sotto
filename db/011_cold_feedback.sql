-- Owner corrections, separate from the original AI decision. Message bodies
-- are never stored here. Deleting an account/decision also deletes its memory.
CREATE TABLE IF NOT EXISTS cold_feedback (
  decision_id text PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  pattern text CHECK (length(pattern) BETWEEN 1 AND 450),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cold_feedback_pending
  ON cold_feedback(available_at) WHERE pattern IS NULL AND attempts < 3;
