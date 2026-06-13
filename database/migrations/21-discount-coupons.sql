-- ============================================================================
-- Migration 21: DISCOUNT COUPONS (international-standard coupon engine)
-- ----------------------------------------------------------------------------
-- Adds a city-scoped coupon catalogue + a redemption ledger. Coupons are
-- created by city admins (their city) or the super admin (any city, or a
-- global coupon with city_id NULL that works everywhere).
--
-- Supported discount logic (mirrors Shopify / WooCommerce / Stripe):
--   * percentage   — % off the cart subtotal, optionally capped by
--                    max_discount_amount.
--   * fixed        — flat Rs. amount off the subtotal.
--   * free_delivery — waives the delivery charge.
--   with: minimum order amount, total usage limit, per-customer usage limit,
--   first-order-only eligibility, and a valid_from / valid_until window.
--
-- SECURITY: the actual discount and every usage-limit check are enforced
-- SERVER-SIDE at order placement (order.controller) inside the order
-- transaction with a FOR UPDATE lock on the coupon row, so the client can
-- never set its own discount and limited coupons can't be over-redeemed under
-- concurrency. used_count + coupon_redemptions are the source of truth.
--
-- Idempotent — safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage'
    CHECK (discount_type IN ('percentage', 'fixed', 'free_delivery')),
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  max_discount_amount NUMERIC(10,2) CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
  min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit >= 0),
  usage_limit_per_user INTEGER CHECK (usage_limit_per_user IS NULL OR usage_limit_per_user >= 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  first_order_only BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  city_id UUID REFERENCES service_cities(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Codes are case-insensitive-unique within their scope: per-city for city
-- coupons, globally for the (city_id NULL) global coupons.
CREATE UNIQUE INDEX IF NOT EXISTS coupons_city_code_uidx
  ON coupons (city_id, UPPER(code)) WHERE city_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS coupons_global_code_uidx
  ON coupons (UPPER(code)) WHERE city_id IS NULL;
CREATE INDEX IF NOT EXISTS coupons_lookup_idx ON coupons (UPPER(code), is_active);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_user_idx
  ON coupon_redemptions (coupon_id, user_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_order_idx
  ON coupon_redemptions (order_id);

-- Register coupon permissions and grant to every admin role so city admins can
-- manage their city's coupons out of the box (super admin already has '*').
INSERT INTO permissions (code, description, category) VALUES
  ('coupons.view',   'View discount coupons',             'Coupons'),
  ('coupons.manage', 'Create / manage discount coupons',  'Coupons')
ON CONFLICT (code) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM admin_roles r
  CROSS JOIN permissions p
 WHERE p.code IN ('coupons.view', 'coupons.manage')
ON CONFLICT DO NOTHING;

COMMIT;
