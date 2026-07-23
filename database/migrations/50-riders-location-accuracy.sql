-- ============================================================================
-- Migration 50 — riders.location_accuracy
-- ----------------------------------------------------------------------------
-- backend/src/controllers/admin/riders.controller.ts reads r.location_accuracy
-- (GPS accuracy in meters reported by the rider app), but the column was never
-- added to the riders table — every admin rider list/detail query failed with
-- 42703 (undefined column).
--
-- Idempotent — safe to re-run. No BEGIN/COMMIT: the migration runner wraps
-- each file in its own transaction. Already reflected in database/schema.sql
-- for fresh installs.
-- ============================================================================

ALTER TABLE riders ADD COLUMN IF NOT EXISTS location_accuracy DECIMAL(6,2);

COMMENT ON COLUMN riders.location_accuracy IS 'GPS accuracy in meters reported by the rider app at last location update';
