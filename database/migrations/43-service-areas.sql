-- ============================================================================
-- Migration 43 — Map-based service areas (per-city delivery boundary polygons)
-- Safe to run multiple times. Run in Supabase SQL Editor after migration 42.
-- ----------------------------------------------------------------------------
-- The super admin draws a delivery boundary per service city. A customer whose
-- delivery pin falls outside the active polygon is shown a "not in your area
-- yet" popup (copy stored in site_settings). Cities with NO active polygon stay
-- fully unrestricted, so this never locks out existing customers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city_id UUID NOT NULL REFERENCES service_cities(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL DEFAULT 'Service Area',
  -- Boundary ring: JSON array of [lng, lat] coordinate pairs.
  polygon JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_areas_city ON service_areas(city_id);
CREATE INDEX IF NOT EXISTS idx_service_areas_city_active ON service_areas(city_id, is_active);

COMMENT ON TABLE service_areas IS 'Super-admin drawn delivery boundary polygons per service city.';
COMMENT ON COLUMN service_areas.polygon IS 'JSON array of [lng, lat] coordinate pairs forming the boundary ring.';
