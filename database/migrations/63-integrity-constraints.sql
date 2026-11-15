-- ============================================================================
-- Migration 63 — the database itself refuses impossible stock and money.
--
-- Until now Postgres accepted stock of −500, an order whose total did not add
-- up (100 + 50 = 99,999) and a paid amount above the order total: every guard
-- lived only in application code, so one bug — or one hand-typed UPDATE —
-- could write nonsense that every report then trusted.
--
-- The rules (each one is what the application already does on every path):
--   products  on-hand stock (A, B, C) is never negative
--   orders    total = subtotal + delivery + tax − discount − coupon, never below 0
--   orders    paid amount is never more than the order total
-- and the older "not negative" rules of migrations 56 / 59, which were added
-- NOT VALID (new rows only), are now validated against every existing row.
--
-- SAFE ON A LIVE DATABASE: a rule is only switched on when no existing row
-- breaks it. If old rows do break it the rule is skipped (a NOTICE says how
-- many rows), nothing is changed and nothing fails — fix those rows and run
--     SELECT * FROM ensure_integrity_constraints();
-- again (it can be run any number of times). The owner's watchdog reports the
-- same breaks from the application side, so a skipped rule is never silent.
-- ============================================================================

CREATE OR REPLACE FUNCTION ensure_integrity_constraints()
RETURNS TABLE (rule TEXT, result TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  bad BIGINT;
  c   RECORD;
BEGIN
  -- 1. Stock is never negative ------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_nonnegative') THEN
    rule := 'products_stock_nonnegative'; result := 'already on'; RETURN NEXT;
  ELSE
    SELECT COUNT(*) INTO bad FROM products
     WHERE stock_quantity < 0 OR COALESCE(stock_quantity_b, 0) < 0 OR COALESCE(stock_quantity_c, 0) < 0;
    IF bad = 0 THEN
      ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative
        CHECK (stock_quantity >= 0 AND COALESCE(stock_quantity_b, 0) >= 0 AND COALESCE(stock_quantity_c, 0) >= 0);
      rule := 'products_stock_nonnegative'; result := 'switched on'; RETURN NEXT;
    ELSE
      RAISE NOTICE 'products_stock_nonnegative NOT added: % product(s) already hold negative stock', bad;
      rule := 'products_stock_nonnegative'; result := format('skipped — %s existing row(s) break it', bad); RETURN NEXT;
    END IF;
  END IF;

  -- 2. An order's total adds up (5 paisa tolerance for rounding) --------------
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_adds_up') THEN
    rule := 'orders_total_adds_up'; result := 'already on'; RETURN NEXT;
  ELSE
    SELECT COUNT(*) INTO bad FROM orders
     WHERE ABS(total_amount - GREATEST(0, COALESCE(subtotal, 0) + COALESCE(delivery_charge, 0) + COALESCE(tax_amount, 0)
                                          - COALESCE(discount_amount, 0) - COALESCE(coupon_discount, 0))) > 0.05;
    IF bad = 0 THEN
      ALTER TABLE orders ADD CONSTRAINT orders_total_adds_up
        CHECK (ABS(total_amount - GREATEST(0, COALESCE(subtotal, 0) + COALESCE(delivery_charge, 0) + COALESCE(tax_amount, 0)
                                              - COALESCE(discount_amount, 0) - COALESCE(coupon_discount, 0))) <= 0.05);
      rule := 'orders_total_adds_up'; result := 'switched on'; RETURN NEXT;
    ELSE
      RAISE NOTICE 'orders_total_adds_up NOT added: % order(s) already have a total that does not add up', bad;
      rule := 'orders_total_adds_up'; result := format('skipped — %s existing row(s) break it', bad); RETURN NEXT;
    END IF;
  END IF;

  -- 3. Nobody pays more than the order total ----------------------------------
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_paid_within_total') THEN
    rule := 'orders_paid_within_total'; result := 'already on'; RETURN NEXT;
  ELSE
    SELECT COUNT(*) INTO bad FROM orders WHERE COALESCE(paid_amount, 0) > total_amount + 0.05;
    IF bad = 0 THEN
      ALTER TABLE orders ADD CONSTRAINT orders_paid_within_total
        CHECK (COALESCE(paid_amount, 0) <= total_amount + 0.05);
      rule := 'orders_paid_within_total'; result := 'switched on'; RETURN NEXT;
    ELSE
      RAISE NOTICE 'orders_paid_within_total NOT added: % order(s) already show more paid than their total', bad;
      rule := 'orders_paid_within_total'; result := format('skipped — %s existing row(s) break it', bad); RETURN NEXT;
    END IF;
  END IF;

  -- 4. Validate the older NOT VALID rules (migrations 56, 59) against old rows -
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS tbl
      FROM pg_constraint con
     WHERE con.contype = 'c' AND NOT con.convalidated
       AND con.conname IN ('orders_money_nonnegative', 'order_items_unit_price_nonnegative',
                           'orders_rider_charge_nonnegative', 'time_slots_max_orders_positive')
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.tbl, c.conname);
      rule := c.conname; result := 'validated against existing rows'; RETURN NEXT;
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE '% could not be validated: existing rows break it', c.conname;
      rule := c.conname; result := 'left NOT VALID — existing row(s) break it'; RETURN NEXT;
    END;
  END LOOP;
END;
$$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM ensure_integrity_constraints() LOOP
    RAISE NOTICE 'integrity rule %: %', r.rule, r.result;
  END LOOP;
END $$;
