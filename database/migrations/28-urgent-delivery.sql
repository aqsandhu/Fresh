-- ============================================================================
-- MIGRATION 28 — urgent (on-demand) delivery on orders
-- ----------------------------------------------------------------------------
-- Lets a customer pick urgent delivery instead of a time slot. The urgent rate
-- + ETA are super-admin settings (site_settings: delivery_urgent_charge /
-- delivery_urgent_eta); urgent orders ignore free-delivery thresholds, free
-- slots and coupons.
--
-- Idempotent. Mirrored by backend/src/config/orderSchema.ts (ensureUrgentDeliveryColumns).
-- ============================================================================

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_urgent_delivery  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS urgent_delivery_eta VARCHAR(100);

COMMIT;
