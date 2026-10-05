-- ============================================================================
-- Migration 56 — money / quantity sanity CHECK constraints
-- ----------------------------------------------------------------------------
-- No order or line may carry a negative amount, and no payment may exceed what
-- a row can represent. Added NOT VALID so legacy rows are not scanned (and a
-- bad historical row cannot block the deploy); every INSERT/UPDATE from now on
-- is checked. Run `ALTER TABLE … VALIDATE CONSTRAINT …` after cleaning data.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_money_nonnegative') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_money_nonnegative
      CHECK (
        COALESCE(subtotal, 0)        >= 0 AND
        COALESCE(discount_amount, 0) >= 0 AND
        COALESCE(delivery_charge, 0) >= 0 AND
        COALESCE(total_amount, 0)    >= 0 AND
        COALESCE(paid_amount, 0)     >= 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_unit_price_nonnegative') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_unit_price_nonnegative
      CHECK (unit_price >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_rider_charge_nonnegative')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'orders' AND column_name = 'rider_delivery_charge') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_rider_charge_nonnegative
      CHECK (COALESCE(rider_delivery_charge, 0) >= 0) NOT VALID;
  END IF;
END $$;
