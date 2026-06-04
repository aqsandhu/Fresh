-- ============================================================================
-- Migration 09: Global brand logo (site_settings) + view permission
-- Super admin uploads via API; city admins may view only.
-- ============================================================================

INSERT INTO permissions (code, description, category) VALUES
  ('settings.brand.view', 'View brand logo in settings', 'Settings'),
  ('settings.brand.update', 'Update brand logo (enforced: super_admin only in API)', 'Settings')
ON CONFLICT (code) DO NOTHING;

-- Grant brand view to roles that already have any settings access
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
  FROM admin_role_permissions rp
  JOIN permissions ps ON ps.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE ps.code IN (
         'settings.view',
         'settings.update',
         'settings.banner.view',
         'settings.delivery.view',
         'settings.business_hours.view'
       )
   AND p.code = 'settings.brand.view'
ON CONFLICT DO NOTHING;

-- Full Access role: view (update is super_admin-only in controller)
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM admin_roles r
  CROSS JOIN permissions p
 WHERE r.name = 'Full Access'
   AND p.code = 'settings.brand.view'
ON CONFLICT DO NOTHING;

-- Global logo keys (empty = clients use bundled /logo.png until upload)
INSERT INTO site_settings (key, value, city_id, updated_at)
VALUES
  ('brand_logo_url', '', NULL, NOW()),
  ('brand_logo_storage_path', '', NULL, NOW())
ON CONFLICT (key) WHERE city_id IS NULL DO NOTHING;
