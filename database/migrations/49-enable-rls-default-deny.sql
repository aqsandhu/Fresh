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

--
-- 20 Nov 2026 (N16): tables that belong to an EXTENSION are skipped, and a
-- table this role does not own is reported instead of failing. On Supabase
-- PostGIS's public.spatial_ref_sys is owned by supabase_admin, and the plain
-- loop stopped the first production run of this file with "must be owner of
-- table spatial_ref_sys" (the app's own tables are unaffected).

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
       )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'RLS left as is on public.% (owned by another role)', t.tablename;
    END;
  END LOOP;
END $$;
