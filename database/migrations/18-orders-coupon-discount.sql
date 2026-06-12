-- ============================================================================
-- Migration 18: persist coupon deductions on orders
-- ----------------------------------------------------------------------------
-- createOrder subtracts the cart's coupon_discount from total_amount but had
-- no column to store it, so for any order with a coupon:
--   subtotal - discount_amount + delivery_charge != total_amount
-- and the coupon portion was unrecoverable for reporting/refunds.
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10,2) DEFAULT 0.00;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);

COMMENT ON COLUMN orders.coupon_discount IS 'Coupon portion of the total deduction (discount_amount holds the non-coupon portion)';
COMMENT ON COLUMN orders.coupon_code IS 'Coupon code applied at checkout, snapshotted from the cart';
