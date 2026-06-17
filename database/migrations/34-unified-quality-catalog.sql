-- ============================================================================
-- Migration 34 — Unified catalog + per-quality shared stock
-- ----------------------------------------------------------------------------
-- Replaces the old, separate "restaurant catalog" model (migration 31) where a
-- physical item lived as TWO rows — one consumer (is_restaurant = FALSE) and one
-- restaurant (is_restaurant = TRUE) — each with its OWN stock_quantity. That
-- split made inventory double-bookkept and corruption-prone.
--
-- New model — ONE product row, ONE shared stock, per QUALITY tier (A/B/C):
--   * Consumer price per tier:  price (A), price_b, price_c
--   * Shared stock per tier:    stock_quantity (A), stock_quantity_b, stock_quantity_c
--   * Restaurant price per tier: restaurant_price_a / _b / _c  (blank → consumer price)
--   * categories.available_for_restaurants — category bhi restaurant storefront par dikhe
--   * products.available_for_restaurants   — product restaurant storefront par dikhe
--
-- A customer OR a restaurant ordering quality X decrements the SAME quality-X
-- bucket. Restaurants keep ordering — now from this unified catalog.
--
-- Idempotent — safe to re-run. Also auto-applied at startup by
-- backend/src/config/productSchema.ts (ensureQualityCatalogColumns).
-- ============================================================================

BEGIN;

-- 1) Remove the OLD separate-restaurant catalog rows (only if the old column is
--    still present). order_items.product_id is ON DELETE SET NULL (migration 19)
--    so order/billing history stays intact; the restaurants table + restaurant
--    orders themselves are untouched.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products'
       AND column_name = 'is_restaurant'
  ) THEN
    DELETE FROM cart_items
      WHERE product_id IN (SELECT id FROM products WHERE is_restaurant = TRUE);
    DELETE FROM products WHERE is_restaurant = TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'categories'
       AND column_name = 'is_restaurant'
  ) THEN
    DELETE FROM categories WHERE is_restaurant = TRUE;
  END IF;
END $$;

-- 2) Drop the old model's columns + indexes.
DROP INDEX IF EXISTS products_is_restaurant_idx;
DROP INDEX IF EXISTS categories_is_restaurant_idx;
ALTER TABLE products   DROP COLUMN IF EXISTS is_restaurant;
ALTER TABLE products   DROP COLUMN IF EXISTS quality_b_price;
ALTER TABLE products   DROP COLUMN IF EXISTS quality_c_price;
ALTER TABLE categories DROP COLUMN IF EXISTS is_restaurant;

-- 3) Add the new unified-quality columns.
--    Consumer Quality B/C prices (A = existing products.price).
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_b NUMERIC(10,2) CHECK (price_b IS NULL OR price_b >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_c NUMERIC(10,2) CHECK (price_c IS NULL OR price_c >= 0);

--    Shared Quality B/C stock (A = existing products.stock_quantity).
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity_b NUMERIC(10,3) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity_c NUMERIC(10,3) NOT NULL DEFAULT 0;

--    Restaurant prices per quality (blank → falls back to the consumer price).
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_price_a NUMERIC(10,2) CHECK (restaurant_price_a IS NULL OR restaurant_price_a >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_price_b NUMERIC(10,2) CHECK (restaurant_price_b IS NULL OR restaurant_price_b >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_price_c NUMERIC(10,2) CHECK (restaurant_price_c IS NULL OR restaurant_price_c >= 0);

--    "Also available for restaurants" flags.
ALTER TABLE products    ADD COLUMN IF NOT EXISTS available_for_restaurants BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE categories  ADD COLUMN IF NOT EXISTS available_for_restaurants BOOLEAN NOT NULL DEFAULT FALSE;

--    The chosen quality on a cart line / order line (A/B/C). order_items.quality
--    was first added in migration 31 — re-assert it idempotently here.
ALTER TABLE cart_items  ADD COLUMN IF NOT EXISTS quality VARCHAR(1) NOT NULL DEFAULT 'A';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quality VARCHAR(1);

-- 4) Indexes for the restaurant storefront filters.
CREATE INDEX IF NOT EXISTS products_avail_restaurants_idx   ON products (available_for_restaurants);
CREATE INDEX IF NOT EXISTS categories_avail_restaurants_idx ON categories (available_for_restaurants);

COMMENT ON COLUMN products.price_b IS 'Consumer price for Quality B (NULL = tier not offered)';
COMMENT ON COLUMN products.price_c IS 'Consumer price for Quality C (NULL = tier not offered)';
COMMENT ON COLUMN products.stock_quantity_b IS 'Shared stock for Quality B (consumer + restaurant draw from this)';
COMMENT ON COLUMN products.stock_quantity_c IS 'Shared stock for Quality C (consumer + restaurant draw from this)';
COMMENT ON COLUMN products.restaurant_price_a IS 'Restaurant price for Quality A (NULL → falls back to products.price)';
COMMENT ON COLUMN products.available_for_restaurants IS 'Show this product on the restaurant storefront';
COMMENT ON COLUMN categories.available_for_restaurants IS 'Show this category on the restaurant storefront';

COMMIT;
