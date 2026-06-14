-- ============================================================================
-- MIGRATION 25 — per-product half-kg / quarter-kg availability toggles
-- ----------------------------------------------------------------------------
-- Some kg products cannot be sold in half/quarter units. These flags let an
-- admin enable/disable each fraction independently. DEFAULT TRUE preserves the
-- current behaviour (kg products show half + quarter) until an admin unchecks.
--
-- Idempotent. Mirrored by backend/src/config/productSchema.ts (ensureUnitToggleColumns).
-- ============================================================================

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_half_kg    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_quarter_kg BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
