-- ============================================================================
-- Migration 23: VARIABLE-WEIGHT PRODUCTS
-- ----------------------------------------------------------------------------
-- Some products (cauliflower, watermelon, …) are sold by the piece but their
-- real packed weight differs from the estimate. For these:
--   * products.is_variable_weight  — enables the feature per-product.
--   * products.variable_weight_note — the (editable, Urdu) popup message shown
--     to the customer when they add such a product.
--   * order_items.final_weight_kg  — the ACTUAL weight an admin records after
--     packing; the line total + order total are recomputed from it
--     (price-per-kg × final weight), server-side.
--
-- Idempotent — safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_variable_weight BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variable_weight_note TEXT;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS final_weight_kg DECIMAL(8,3)
    CHECK (final_weight_kg IS NULL OR final_weight_kg >= 0);

COMMENT ON COLUMN products.is_variable_weight IS 'Weight may differ from the order; admin re-weighs at packing and the amount auto-adjusts';
COMMENT ON COLUMN order_items.final_weight_kg IS 'Actual packed weight (kg) recorded by admin; recomputes total_price';

COMMIT;
