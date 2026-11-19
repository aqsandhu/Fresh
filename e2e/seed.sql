-- Browser journeys (W19): the few rows a FRESH database needs on top of
-- schema.sql + migrations — a Gujrat category and product with stock, an
-- all-day time slot, and a verified rider (password rider123). Safe to run
-- again (it tops the stock back up).
INSERT INTO categories (name_en, name_ur, slug, city_id, is_active)
SELECT 'E2E Vegetables', 'سبزیاں', 'e2e-vegetables', sc.id, true
  FROM service_cities sc WHERE sc.name = 'Gujrat'
ON CONFLICT (slug, city_id) DO NOTHING;

INSERT INTO products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type)
SELECT 'E2E Tomato', 'ٹماٹر', 'e2e-tomato', c.id, 200, 500, sc.id, true, 'kg'
  FROM service_cities sc
  JOIN categories c ON c.slug = 'e2e-vegetables' AND c.city_id = sc.id
 WHERE sc.name = 'Gujrat'
ON CONFLICT (slug, city_id) DO UPDATE SET stock_quantity = 500, reserved_quantity = 0, is_active = true;

INSERT INTO time_slots (slot_name, start_time, end_time, status, max_orders)
SELECT 'E2E All day', '00:00', '23:59', 'available', 100000
 WHERE NOT EXISTS (SELECT 1 FROM time_slots WHERE slot_name = 'E2E All day');

-- password_hash below = bcrypt of rider123 (a test-only account)
WITH u AS (
  INSERT INTO users (phone, full_name, role, is_phone_verified, password_hash)
  VALUES ('+923480000001', 'Journey Rider', 'rider', true, '$2a$06$TkfjFzhWJTWhGpuKmCzifuGrph8xXtXr5pKkk/IXazI7oYG.or5fK')
  ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
  RETURNING id
)
INSERT INTO riders (user_id, cnic, vehicle_type, vehicle_number, status, verification_status, city_id)
SELECT u.id, '35202-0000001-1', 'bike', 'E2E-001', 'available', 'verified', sc.id
  FROM u, service_cities sc WHERE sc.name = 'Gujrat'
   AND NOT EXISTS (SELECT 1 FROM riders r WHERE r.user_id = u.id);
