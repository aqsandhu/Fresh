-- ============================================================================
-- DESTRUCTIVE: drop everything in the public schema and recreate it empty.
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor when you want a clean slate.
-- After this script runs successfully:
--   1. run database/schema.sql to recreate the core FreshBazar tables, types,
--      indexes, functions, triggers, and seed data, THEN
--   2. run `cd backend && npm run migrate:sql` — REQUIRED. schema.sql is NOT
--      fully migrated (~29 tables from later migrations exist only in
--      database/migrations/*.sql); without step 2 the API fails at runtime
--      with 42P01 (relation does not exist). Do NOT --baseline a fresh
--      install. See database/README.md.
--
-- This drops EVERY table, view, type, function, and sequence in `public`.
-- Supabase system schemas (auth, storage, realtime, extensions, etc.) are
-- left untouched.
-- ============================================================================

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Restore the default Supabase grants on the fresh public schema so the
-- API role (and your DB user) can use it.
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO public;

-- The uuid-ossp extension is referenced by schema.sql; create it now so the
-- next script can rely on uuid_generate_v4().
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
