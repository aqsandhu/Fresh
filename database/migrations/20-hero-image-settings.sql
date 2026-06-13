-- ============================================================================
-- Migration 20: Per-city homepage HERO IMAGE (website + customer app)
-- ----------------------------------------------------------------------------
-- The hero image is stored in site_settings under the keys 'hero_image_url'
-- and 'hero_image_storage_path', scoped per service city (city_id). A global
-- row (city_id NULL) acts as the fallback when a city hasn't set its own.
--
-- This reuses the city-scoped site_settings infrastructure from migration 06.
-- The column/index creation here is idempotent so the hero feature works even
-- on a database where migration 06 was skipped.
--
-- Every city admin (and the super admin) can manage their city's hero image,
-- so the new settings.hero.* permissions are granted to ALL existing admin
-- roles, not just Full Access.
-- ============================================================================

BEGIN;

-- 1. Ensure site_settings supports per-city rows (mirrors migration 06).
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES service_cities(id) ON DELETE CASCADE;

ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_settings_key_global
  ON site_settings (key)
  WHERE city_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_settings_key_city
  ON site_settings (key, city_id)
  WHERE city_id IS NOT NULL;

-- 2. Register the new permission codes (no-op if the permissions table or rows
--    already exist).
INSERT INTO permissions (code, description, category) VALUES
  ('settings.hero.view',   'View homepage hero image',           'Settings'),
  ('settings.hero.update', 'Update homepage hero image (per city)', 'Settings')
ON CONFLICT (code) DO NOTHING;

-- 3. Grant the hero permissions to EVERY admin role so every city admin can
--    manage their city's hero image out of the box.
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM admin_roles r
  CROSS JOIN permissions p
 WHERE p.code IN ('settings.hero.view', 'settings.hero.update')
ON CONFLICT DO NOTHING;

COMMIT;
