-- ============================================================================
-- Migration 08: Hide customer phone by default + ensure address permissions exist
-- ============================================================================

ALTER TABLE orders ALTER COLUMN show_customer_phone SET DEFAULT FALSE;

INSERT INTO permissions (code, description, category) VALUES
  ('addresses.view',   'View customer addresses',   'Customers'),
  ('addresses.update', 'Update customer addresses', 'Customers')
ON CONFLICT (code) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM admin_roles r
  CROSS JOIN permissions p
 WHERE r.name = 'Full Access'
   AND p.code IN ('addresses.view', 'addresses.update')
ON CONFLICT DO NOTHING;
