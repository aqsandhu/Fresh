-- Migration 49: Enable Row Level Security (default-deny) on all public app tables.
--
-- Context (audit DBP-7): no table had RLS, while 00-reset.sql grants ALL on schema
-- public to anon/authenticated/service_role. Any future Supabase PostgREST exposure
-- (anon/authenticated key) would otherwise reach every table.
--
-- Safety model:
--   * The backend connects via the direct Postgres connection (table owner /
--     superuser), which BYPASSES RLS by default — so all backend queries are
--     unaffected and functionality is unchanged.
--   * Supabase's service_role also bypasses RLS.
--   * anon / authenticated roles (PostgREST) get DENIED by default because no
--     policies are created here. No shipped client uses PostgREST today, so this
--     closes the hole without breaking anything.
--   * If a future feature needs client-direct access to a table, add an explicit
--     CREATE POLICY for that table instead of disabling RLS globally.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op when already enabled.

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
