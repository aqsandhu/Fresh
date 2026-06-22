-- ============================================================================
-- Migration 46 — Marketing / retargeting (abandoned carts)
-- Safe to run multiple times. Run in Supabase SQL Editor after migration 45.
-- ----------------------------------------------------------------------------
-- Tracks cart snapshots for BOTH anonymous (device_id) and registered (user_id)
-- visitors so admins can see and retarget people who added to cart but did not
-- order. Pixel IDs + reminder settings live in site_settings (no schema needed).
-- ============================================================================

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id VARCHAR(64) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  city_id UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  phone VARCHAR(30),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_count INTEGER NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | ordered | reminded
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reminded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_abandoned_carts_device ON abandoned_carts(device_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_user ON abandoned_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status_activity
  ON abandoned_carts(status, last_activity_at);

COMMENT ON TABLE abandoned_carts IS 'Cart snapshots (anonymous + registered) for retargeting/abandonment.';
