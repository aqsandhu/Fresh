-- ============================================================================
-- Migration 31 — Restaurant catalog
-- Separates the B2B (restaurant) catalog from the consumer catalog on the SAME
-- tables via `is_restaurant`, and adds quality tiers to restaurant products
-- (A = existing price, B = quality_b_price, C = quality_c_price). Idempotent;
-- also auto-applied at startup by backend/src/config/productSchema.ts.
-- ============================================================================

ALTER TABLE categories  ADD COLUMN IF NOT EXISTS is_restaurant   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products    ADD COLUMN IF NOT EXISTS is_restaurant   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products    ADD COLUMN IF NOT EXISTS quality_b_price NUMERIC(10,2);
ALTER TABLE products    ADD COLUMN IF NOT EXISTS quality_c_price NUMERIC(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quality         VARCHAR(1);

CREATE INDEX IF NOT EXISTS products_is_restaurant_idx   ON products (is_restaurant);
CREATE INDEX IF NOT EXISTS categories_is_restaurant_idx ON categories (is_restaurant);
