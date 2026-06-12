-- ============================================================================
-- 19: Preserve order history when a product is permanently deleted
-- ----------------------------------------------------------------------------
-- order_items already snapshots everything an order needs to display
-- (product_name, product_image, product_sku, unit_price, quantity, unit).
-- The product_id column is only a convenience link back to the live catalog,
-- so a hard product delete must NULL it instead of being blocked (or worse,
-- cascading). Idempotent — safe to run more than once.
-- ============================================================================

ALTER TABLE order_items
  ALTER COLUMN product_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_items_product_id_fkey'
       AND conrelid = 'order_items'::regclass
  ) THEN
    ALTER TABLE order_items DROP CONSTRAINT order_items_product_id_fkey;
  END IF;

  ALTER TABLE order_items
    ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
END $$;

COMMENT ON COLUMN order_items.product_id IS
  'Link to the live product; NULL when the product was permanently deleted. Display fields are snapshotted on the row.';
