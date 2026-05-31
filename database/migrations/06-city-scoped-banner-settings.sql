-- ============================================================================
-- Migration 06: Per-city website banner text (green top bar)
-- Adds city_id to site_settings; global rows (city_id NULL) remain as fallback.
-- ============================================================================

BEGIN;

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES service_cities(id) ON DELETE CASCADE;

ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_settings_key_global
  ON site_settings (key)
  WHERE city_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_settings_key_city
  ON site_settings (key, city_id)
  WHERE city_id IS NOT NULL;

COMMIT;
