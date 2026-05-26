-- ============================================================================
-- Migration 03
-- 1) Unit-fraction pricing on products (½ kg, ¼ kg, ½ dozen)
-- 2) Cart / order line items remember which unit they were sold as
-- 3) Custom admin roles with permissions and optional city scope
-- ============================================================================
-- Safe to run multiple times. Designed for Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PRODUCT UNIT PRICING
-- ----------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS half_kg_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS quarter_kg_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS half_dozen_price DECIMAL(10,2);

COMMENT ON COLUMN products.half_kg_price IS
  'Optional admin-set price for ½ kg of this product. NULL = derive as price * 0.5.';
COMMENT ON COLUMN products.quarter_kg_price IS
  'Optional admin-set price for ¼ kg. NULL = derive as price * 0.25.';
COMMENT ON COLUMN products.half_dozen_price IS
  'Optional admin-set price for ½ dozen. NULL = derive as price * 0.5.';

-- ----------------------------------------------------------------------------
-- 2) CART + ORDER ITEM UNIT TRACKING
--    Allows half-kg and full-kg of the same product to coexist as separate
--    line items, and preserves the unit choice on historical orders.
-- ----------------------------------------------------------------------------
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'full';

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'full';

COMMENT ON COLUMN cart_items.unit IS
  'Which unit fraction of the product this row represents: full | half_kg | quarter_kg | half_dozen.';
COMMENT ON COLUMN order_items.unit IS
  'Frozen copy of cart_items.unit so historical orders show the correct unit.';

-- A given cart can have the same product as full AND half_kg side by side.
-- Drop the existing single-column uniqueness and replace with composite.
ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_cart_id_product_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_cart_product_unit_key'
  ) THEN
    ALTER TABLE cart_items
      ADD CONSTRAINT cart_items_cart_product_unit_key
      UNIQUE (cart_id, product_id, unit);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) ADMIN ROLES + PERMISSIONS
--
-- Single super-admin (the original `users.role = 'super_admin'`) can create
-- new admin roles, optionally scoped to a city. Each role holds a set of
-- permission codes (orders.view, products.update, etc). Existing admins
-- with the legacy enum role 'admin' or 'super_admin' keep working — they
-- are treated as "global admins" until assigned a custom role.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  category    VARCHAR(50),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE permissions IS
  'Catalogue of all permission codes the backend understands.';

INSERT INTO permissions (code, description, category) VALUES
  ('orders.view',        'View orders',                 'Orders'),
  ('orders.update',      'Update order status',         'Orders'),
  ('orders.cancel',      'Cancel orders',               'Orders'),
  ('orders.refund',      'Refund orders',               'Orders'),
  ('orders.assign_rider','Assign rider to orders',      'Orders'),

  ('products.view',      'View products',               'Products'),
  ('products.create',    'Create products',             'Products'),
  ('products.update',    'Update products',             'Products'),
  ('products.delete',    'Delete/deactivate products',  'Products'),

  ('categories.manage',  'Manage categories',           'Products'),

  ('customers.view',     'View customers',              'Customers'),
  ('customers.update',   'Update customers',            'Customers'),
  ('addresses.view',     'View customer addresses',     'Customers'),
  ('addresses.update',   'Update customer addresses',   'Customers'),

  ('riders.view',        'View riders',                 'Riders'),
  ('riders.manage',      'Approve/manage riders',       'Riders'),

  ('settings.view',      'View settings',               'Settings'),
  ('settings.update',    'Update site settings',        'Settings'),

  ('roles.manage',       'Create / manage admin roles', 'Admins'),
  ('admins.manage',      'Invite / manage admin users', 'Admins')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  -- NULL scope = global. Otherwise the role only governs records that
  -- match `city` (e.g. orders/customers whose city matches).
  city        VARCHAR(100),
  is_system   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  UUID REFERENCES users(id)
);

COMMENT ON TABLE admin_roles IS
  'Named admin roles created by the super-admin. Optional city scope makes a role specific to one city''s orders / customers.';

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id        UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Linking column on users — an admin can be assigned a custom role.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role_id UUID REFERENCES admin_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_admin_role ON users(admin_role_id)
  WHERE admin_role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_roles_city ON admin_roles(city)
  WHERE city IS NOT NULL;

-- Seed a "Full Access" system role so the super-admin always has a fallback
-- in the UI even before they create custom roles.
INSERT INTO admin_roles (name, description, city, is_system)
VALUES ('Full Access', 'All permissions, all cities', NULL, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Attach every existing permission to the Full Access role.
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM admin_roles r
  CROSS JOIN permissions p
 WHERE r.name = 'Full Access'
ON CONFLICT DO NOTHING;
