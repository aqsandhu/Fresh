-- ============================================================================
-- Migration 07: Granular settings permissions (per Settings tab + cities/zones)
-- Legacy settings.view / settings.update still grant full settings access.
-- ============================================================================

INSERT INTO permissions (code, description, category) VALUES
  ('settings.delivery.view',       'View delivery charge settings',     'Settings'),
  ('settings.delivery.update',     'Update delivery charge settings',   'Settings'),
  ('settings.timeslots.view',      'View delivery time slots',          'Settings'),
  ('settings.timeslots.manage',    'Manage delivery time slots',        'Settings'),
  ('settings.business_hours.view', 'View business hours',             'Settings'),
  ('settings.business_hours.update','Update business hours',            'Settings'),
  ('settings.banner.view',         'View website banner text',          'Settings'),
  ('settings.banner.update',       'Update website banner text',        'Settings'),
  ('settings.cities.view',         'View service cities',               'Settings'),
  ('settings.cities.manage',       'Manage service cities',             'Settings'),
  ('settings.delivery_zones.view', 'View delivery zones',               'Settings'),
  ('settings.delivery_zones.manage','Manage delivery zones',            'Settings')
ON CONFLICT (code) DO NOTHING;

-- Grant new permissions to Full Access system role
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM admin_roles r
  CROSS JOIN permissions p
 WHERE r.name = 'Full Access'
   AND p.code LIKE 'settings.%'
ON CONFLICT DO NOTHING;
