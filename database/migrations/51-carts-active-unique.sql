-- ============================================================================
-- Migration 51 — One active cart per user (partial unique index)
-- ----------------------------------------------------------------------------
-- carts has no uniqueness on (user_id), so races / retries in getOrCreateCart
-- could create multiple 'active' carts for the same user — items then split
-- across carts and the "wrong" cart is shown/ordered.
--
-- 1) Dedupe existing data: for users with more than one active cart, keep the
--    most recently updated one and mark the older ones 'abandoned' (a status
--    the carts.status comment already documents; rows are preserved, not
--    deleted, so no cart_items history is lost).
-- 2) Add a partial unique index so at most ONE 'active' cart per user can
--    exist. The application side pairs this with
--    INSERT ... ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING
--    followed by a re-SELECT (backend-core contract C3).
--
-- Idempotent — safe to re-run. No BEGIN/COMMIT: the migration runner wraps
-- each file in its own transaction.
-- ============================================================================

-- 1) Dedupe: keep the newest active cart per user, abandon the rest.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM carts
    WHERE status = 'active'
)
UPDATE carts c
SET status = 'abandoned'
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 2) Enforce one active cart per user going forward.
CREATE UNIQUE INDEX IF NOT EXISTS carts_one_active_per_user
    ON carts (user_id)
    WHERE status = 'active';
