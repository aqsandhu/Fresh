-- ============================================================================
-- Migration 05: Allow fractional stock (half kg / quarter kg orders)
-- stock_quantity was INTEGER — deducting 0.5 kg failed on order placement.
--
-- active_products_view depends on stock_quantity; drop it first, then recreate.
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS active_products_view;

ALTER TABLE products
  ALTER COLUMN stock_quantity TYPE DECIMAL(10,3)
    USING stock_quantity::decimal;

ALTER TABLE products
  ALTER COLUMN low_stock_threshold TYPE DECIMAL(10,3)
    USING low_stock_threshold::decimal;

CREATE VIEW active_products_view AS
SELECT
    p.id, p.name_ur, p.name_en, p.slug, p.price, p.unit_type, p.unit_value,
    p.stock_quantity, p.stock_status, p.primary_image,
    c.name_en AS category_name, c.slug AS category_slug,
    c.qualifies_for_free_delivery, c.minimum_order_for_free_delivery
FROM products p
JOIN categories c ON p.category_id = c.id
WHERE p.is_active = TRUE;

COMMIT;
