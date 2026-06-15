-- ============================================================================
-- MIGRATION 27 — link WhatsApp orders to the real customer + saved address
-- ----------------------------------------------------------------------------
-- When an admin places a WhatsApp order for an existing customer, store the
-- matched user + selected address so the order shows the same house number,
-- saved location and door picture — and so a rider's later update to that
-- shared address row reflects on the order everywhere.
--
-- Idempotent. Mirrored by backend/src/config/whatsappOrderSchema.ts.
-- ============================================================================

BEGIN;

ALTER TABLE whatsapp_orders ADD COLUMN IF NOT EXISTS user_id          UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_orders ADD COLUMN IF NOT EXISTS address_id       UUID REFERENCES addresses(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_orders ADD COLUMN IF NOT EXISTS door_picture_url TEXT;

CREATE INDEX IF NOT EXISTS whatsapp_orders_user_idx ON whatsapp_orders (user_id);

COMMIT;
