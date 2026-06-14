-- ============================================================================
-- Migration 22: AUTOMATIC COUPONS (welcome-back + order-milestone) + grants
-- ----------------------------------------------------------------------------
-- Extends the coupon engine with behaviour-triggered coupons that are GRANTED
-- to specific customers rather than typed by code:
--
--   * welcome_back   — granted when a customer has not ordered for at least
--                      `inactivity_days` days (a win-back offer).
--   * order_milestone — granted once a customer reaches `milestone_orders`
--                      DELIVERED orders (a loyalty reward).
--
-- `auto_reusable` decides whether, once granted, the coupon is single-use
-- (first order after qualifying) or stays available permanently.
--
-- user_coupons is the per-customer grant ledger: which customer has which
-- auto coupon, whether it's still available, and whether the win popup has
-- been seen. Eligibility is always (re)evaluated SERVER-SIDE; a customer can
-- only redeem an auto coupon they actually hold an 'available' grant for.
--
-- Idempotent — safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(20) NOT NULL DEFAULT 'manual';

-- Drop+recreate the CHECK so re-runs don't fail if it already exists.
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_trigger_type_chk;
ALTER TABLE coupons
  ADD CONSTRAINT coupons_trigger_type_chk
  CHECK (trigger_type IN ('manual', 'welcome_back', 'order_milestone'));

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS inactivity_days INTEGER
    CHECK (inactivity_days IS NULL OR inactivity_days >= 0);
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS milestone_orders INTEGER
    CHECK (milestone_orders IS NULL OR milestone_orders >= 1);
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS auto_reusable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS user_coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'used')),
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  UNIQUE (user_id, coupon_id)
);

CREATE INDEX IF NOT EXISTS user_coupons_user_status_idx
  ON user_coupons (user_id, status);
CREATE INDEX IF NOT EXISTS user_coupons_coupon_idx
  ON user_coupons (coupon_id);

COMMIT;
