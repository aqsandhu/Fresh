-- ============================================================================
-- Migration 44 — Today's Basket (curated combo packages, super-admin built)
-- Safe to run multiple times. Run in Supabase SQL Editor after migration 43.
-- ----------------------------------------------------------------------------
-- A basket is a curated set of products (with quality + quantity) plus an
-- advertised combo price. Adding a basket on the storefront adds its component
-- products to the cart, so the existing (price-authoritative) checkout, stock
-- and reconciliation flow is reused unchanged.
-- ============================================================================

CREATE TABLE IF NOT EXISTS baskets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city_id UUID REFERENCES service_cities(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS basket_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  basket_id UUID NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quality VARCHAR(1) NOT NULL DEFAULT 'A',  -- A | B | C
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit VARCHAR(20) NOT NULL DEFAULT 'full',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baskets_city_active ON baskets(city_id, is_active);
CREATE INDEX IF NOT EXISTS idx_basket_items_basket ON basket_items(basket_id);

COMMENT ON TABLE baskets IS 'Today''s Basket — curated combo packages (super-admin created).';
COMMENT ON COLUMN baskets.total_price IS 'Advertised combo price shown to customers.';
COMMENT ON TABLE basket_items IS 'Products that make up a basket (with quality + quantity).';
