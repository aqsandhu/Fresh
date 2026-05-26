-- ============================================================================
-- Migration 04 — City-scoped catalog, orders, riders, and admin roles
-- Safe to run multiple times. Run in Supabase SQL Editor after migration 03.
-- ============================================================================

ALTER TABLE categories ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES service_cities(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES service_cities(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES service_cities(id);
ALTER TABLE riders ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES service_cities(id);
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES service_cities(id);

-- Backfill existing rows to the default service city (Gujrat, else first city).
DO $$
DECLARE
  default_city UUID;
BEGIN
  SELECT id INTO default_city FROM service_cities WHERE LOWER(name) = 'gujrat' LIMIT 1;
  IF default_city IS NULL THEN
    SELECT id INTO default_city FROM service_cities ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF default_city IS NOT NULL THEN
    UPDATE categories SET city_id = default_city WHERE city_id IS NULL;
    UPDATE products SET city_id = default_city WHERE city_id IS NULL;
    UPDATE riders SET city_id = default_city WHERE city_id IS NULL AND deleted_at IS NULL;
    UPDATE orders SET city_id = default_city WHERE city_id IS NULL;
  END IF;
END $$;

-- Orders: prefer address city name when available.
UPDATE orders o
   SET city_id = sc.id
  FROM addresses a,
       service_cities sc
 WHERE o.address_id = a.id
   AND o.city_id IS NULL
   AND LOWER(sc.name) = LOWER(a.city);

-- Admin roles: map legacy text `city` column to city_id (non-system roles only).
UPDATE admin_roles ar
   SET city_id = sc.id
  FROM service_cities sc
 WHERE ar.city_id IS NULL
   AND ar.city IS NOT NULL
   AND ar.is_system = FALSE
   AND LOWER(sc.name) = LOWER(ar.city);

-- Per-city slug uniqueness (same slug allowed in different cities).
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;
DROP INDEX IF EXISTS categories_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_slug_city ON categories(slug, city_id);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_slug_key;
DROP INDEX IF EXISTS products_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_slug_city ON products(slug, city_id);

CREATE INDEX IF NOT EXISTS idx_categories_city ON categories(city_id);
CREATE INDEX IF NOT EXISTS idx_products_city ON products(city_id);
CREATE INDEX IF NOT EXISTS idx_orders_city ON orders(city_id);
CREATE INDEX IF NOT EXISTS idx_riders_city ON riders(city_id);
CREATE INDEX IF NOT EXISTS idx_admin_roles_city_id ON admin_roles(city_id);

COMMENT ON COLUMN categories.city_id IS 'Service city this category belongs to.';
COMMENT ON COLUMN products.city_id IS 'Service city this product is sold in.';
COMMENT ON COLUMN orders.city_id IS 'Service city for fulfilment / admin filtering.';
COMMENT ON COLUMN riders.city_id IS 'Primary city this rider operates in.';
COMMENT ON COLUMN admin_roles.city_id IS 'Required scope for custom admin roles (NULL = global system role).';
