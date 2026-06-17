-- ============================================================================
-- Migration 32 — Restaurant orders in the unified orders pipeline
-- Restaurant (B2B) orders share the orders table with consumer orders so riders
-- and accounting stay combined. `restaurant_id` identifies them; user_id and
-- address_id are relaxed to NULL (a restaurant order has no consumer account or
-- saved address — the address rides in delivery_address_snapshot). Idempotent;
-- also auto-applied at startup by backend/src/config/orderSchema.ts.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL;
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN address_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS orders_restaurant_idx ON orders (restaurant_id);
