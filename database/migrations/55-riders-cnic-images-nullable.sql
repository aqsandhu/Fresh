-- ============================================================================
-- Migration 55 — riders.cnic_front_image / cnic_back_image become nullable
-- ----------------------------------------------------------------------------
-- The admin "create rider" endpoint inserts NULL for both CNIC images (they are
-- uploaded later from the rider app), but schema.sql declares them NOT NULL —
-- so on a database built from schema.sql the insert fails with 23502 and no
-- rider can be created from the admin panel. Hosted databases were patched by
-- hand; this makes the schema match the code everywhere.
-- ============================================================================
ALTER TABLE riders ALTER COLUMN cnic_front_image DROP NOT NULL;
ALTER TABLE riders ALTER COLUMN cnic_back_image  DROP NOT NULL;
