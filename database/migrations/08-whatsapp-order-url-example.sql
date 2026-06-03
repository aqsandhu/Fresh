-- Example: set WhatsApp order link for a city (run in Supabase SQL Editor).
-- Replace 'Gujrat' with your city name from service_cities, or pick id from:
--   SELECT id, name FROM service_cities WHERE is_active = true;

INSERT INTO site_settings (key, value, city_id, updated_at)
SELECT
  'whatsapp_order_url',
  'https://wa.me/923001234567',
  sc.id,
  NOW()
FROM service_cities sc
WHERE sc.name = 'Gujrat'
  AND sc.is_active = true
ON CONFLICT (key, city_id) WHERE city_id IS NOT NULL
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
