-- ============================================================================
-- Migration 53 — reviews unique indexes: make NULL order_id non-bypassable
-- ----------------------------------------------------------------------------
-- The partial unique indexes from migration 24 (reviews_unique_product /
-- _rider / _service) include order_id directly. Postgres treats NULLs as
-- DISTINCT in unique indexes, so any review with order_id IS NULL bypasses
-- the constraint entirely — a customer can review the same product/rider
-- without an order unlimited times.
--
-- Fix: rebuild the same-named indexes on
--   COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid)
-- so NULL order_ids collapse to a sentinel UUID and the "one review per
-- customer per target per order" rule also applies to order-less reviews.
--
-- 1) Dedupe existing violations first (keep the newest review per
--    user/target/COALESCE(order_id) group, delete the older duplicates) —
--    otherwise CREATE UNIQUE INDEX would fail on live data. Only rows that
--    ALREADY violate the intended rule are removed.
-- 2) DROP INDEX IF EXISTS + CREATE UNIQUE INDEX (idempotent; index names are
--    unchanged so dependent tooling/EXPLAIN references keep working).
--
-- No BEGIN/COMMIT: the migration runner wraps each file in its own
-- transaction.
-- ============================================================================

-- 1a) product reviews
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id,
                            COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid),
                            product_id
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM reviews
    WHERE target_type = 'product'
)
DELETE FROM reviews r USING ranked k
WHERE r.id = k.id AND k.rn > 1;

-- 1b) rider reviews
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id,
                            COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid)
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM reviews
    WHERE target_type = 'rider'
)
DELETE FROM reviews r USING ranked k
WHERE r.id = k.id AND k.rn > 1;

-- 1c) service reviews
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id,
                            COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid)
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM reviews
    WHERE target_type = 'service'
)
DELETE FROM reviews r USING ranked k
WHERE r.id = k.id AND k.rn > 1;

-- 2) Rebuild the unique indexes with the COALESCE sentinel (same names).
DROP INDEX IF EXISTS reviews_unique_product;
CREATE UNIQUE INDEX reviews_unique_product
    ON reviews (user_id,
                (COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid)),
                product_id)
    WHERE target_type = 'product';

DROP INDEX IF EXISTS reviews_unique_rider;
CREATE UNIQUE INDEX reviews_unique_rider
    ON reviews (user_id,
                (COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    WHERE target_type = 'rider';

DROP INDEX IF EXISTS reviews_unique_service;
CREATE UNIQUE INDEX reviews_unique_service
    ON reviews (user_id,
                (COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    WHERE target_type = 'service';
