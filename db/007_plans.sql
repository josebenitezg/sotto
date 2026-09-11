ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS billing_plan text;
UPDATE workspaces SET billing_plan=CASE WHEN stripe_subscription_id IS NOT NULL THEN 'duo' ELSE 'solo' END WHERE billing_plan IS NULL;
ALTER TABLE workspaces ALTER COLUMN billing_plan SET DEFAULT 'solo';
ALTER TABLE workspaces ALTER COLUMN billing_plan SET NOT NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS checkout_plan text;

-- Only technical usage. No addresses, message bodies, subjects or credentials.
CREATE TABLE IF NOT EXISTS ai_usage (
  id bigserial PRIMARY KEY,
  account_id text REFERENCES accounts(id) ON DELETE CASCADE,
  model text NOT NULL,
  input_tokens integer NOT NULL,
  cached_input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_account_date ON ai_usage(account_id,created_at);
