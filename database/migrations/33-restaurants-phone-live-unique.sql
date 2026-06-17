-- ============================================================================
-- Migration 33 — Relax restaurant phone uniqueness to LIVE rows only
-- The original migration 30 added a plain UNIQUE column constraint on
-- restaurants.phone (restaurants_phone_key). That counts soft-deleted rows, so a
-- removed restaurant could never re-register (duplicate-key 500). Drop it and
-- rely on the partial unique index (one LIVE account per phone). Idempotent;
-- also auto-applied at startup by backend/src/config/restaurantSchema.ts.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_phone_live_idx
  ON restaurants (phone) WHERE deleted_at IS NULL;

ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_phone_key;
