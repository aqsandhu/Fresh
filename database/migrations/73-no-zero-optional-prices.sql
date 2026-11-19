-- 73: optional prices are blank or above 0 — never Rs. 0 (B37, round 10).
-- A 0 in a ½ kg / ¼ kg / ½ dozen, Quality B / C or restaurant price box was
-- stored, and the price resolver treats 0 as a real price, so that unit sold
-- for Rs. 0. The server now refuses 0; this turns any 0 already stored into
-- blank (NULL = the automatic price / tier not offered). Safe to run again.
DO $$
DECLARE
  col TEXT;
  n INTEGER;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'half_kg_price', 'quarter_kg_price', 'half_dozen_price', 'price_b', 'price_c',
    'restaurant_price_a', 'restaurant_price_b', 'restaurant_price_c',
    'half_kg_price_b', 'quarter_kg_price_b', 'half_dozen_price_b',
    'half_kg_price_c', 'quarter_kg_price_c', 'half_dozen_price_c',
    'restaurant_half_kg_price_a', 'restaurant_quarter_kg_price_a', 'restaurant_half_dozen_price_a',
    'restaurant_half_kg_price_b', 'restaurant_quarter_kg_price_b', 'restaurant_half_dozen_price_b',
    'restaurant_half_kg_price_c', 'restaurant_quarter_kg_price_c', 'restaurant_half_dozen_price_c'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = col
    ) THEN
      EXECUTE format('UPDATE products SET %I = NULL WHERE %I = 0', col, col);
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN
        RAISE NOTICE 'products.%: % zero price(s) cleared to automatic', col, n;
      END IF;
    END IF;
  END LOOP;
END $$;
