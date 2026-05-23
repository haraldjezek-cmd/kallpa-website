-- **Recommended:** paste this entire file in Supabase Dashboard → SQL Editor → Run.
-- Same DDL as supabase/migrations/144_waitlist_landing.sql (idempotent).
-- Do NOT use `supabase db push` unless you intend to apply ALL pending migrations.
-- signup_type: 'notify' = notify at launch, 'beta' = apply for beta access.

CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  locale      TEXT        NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
  signup_type TEXT        NOT NULL DEFAULT 'notify' CHECK (signup_type IN ('notify', 'beta')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous waitlist signup" ON waitlist;
CREATE POLICY "Allow anonymous waitlist signup"
  ON waitlist FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can read waitlist" ON waitlist;
CREATE POLICY "Service role can read waitlist"
  ON waitlist FOR SELECT
  TO service_role
  USING (true);

COMMENT ON TABLE waitlist IS 'Marketing site waitlist; anon may INSERT only via RLS.';

-- Useful admin queries:
-- SELECT signup_type, COUNT(*) FROM waitlist GROUP BY signup_type;
-- SELECT * FROM waitlist WHERE signup_type = 'beta' ORDER BY created_at;
