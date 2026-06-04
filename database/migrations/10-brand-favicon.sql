-- ============================================================================
-- Migration 10: Global brand favicon (site_settings, Supabase uploads/favicon/)
-- Super admin uploads via Settings → Favicon tab; separate from brand logo.
-- ============================================================================

INSERT INTO permissions (code, description, category) VALUES
  ('settings.favicon.view', 'View brand favicon in settings', 'Settings'),
  ('settings.favicon.update', 'Update brand favicon (API: super_admin only)', 'Settings')
ON CONFLICT (code) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
  FROM admin_role_permissions rp
  JOIN permissions ps ON ps.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE ps.code IN (
         'settings.view',
         'settings.update',
         'settings.brand.view',
         'settings.banner.view'
       )
   AND p.code = 'settings.favicon.view'
ON CONFLICT DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM admin_roles r
  CROSS JOIN permissions p
 WHERE r.name = 'Full Access'
   AND p.code = 'settings.favicon.view'
ON CONFLICT DO NOTHING;

INSERT INTO site_settings (key, value, city_id, updated_at)
VALUES
  ('brand_favicon_url', '', NULL, NOW()),
  ('brand_favicon_storage_path', '', NULL, NOW())
ON CONFLICT (key) WHERE city_id IS NULL DO NOTHING;
