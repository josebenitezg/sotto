CREATE TABLE IF NOT EXISTS global_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO global_config(key,value) VALUES('full_access_emails','[]'::jsonb)
ON CONFLICT(key) DO NOTHING;

-- This is an entitlement for the verified workspace owner, never a linked
-- mailbox, email domain, wildcard, browser parameter or permanent internal flag.
CREATE OR REPLACE FUNCTION sotto_full_access(owner_email text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_config
    WHERE key='full_access_emails' AND jsonb_typeof(value)='array'
      AND value ? lower(btrim(owner_email))
  )
$$;
