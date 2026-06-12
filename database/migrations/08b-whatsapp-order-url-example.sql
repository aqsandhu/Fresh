-- WhatsApp order links: global default + optional per-city overrides.
-- No new table — uses existing site_settings (city_id column from 06-city-scoped-banner-settings.sql).
--
-- Prefer the admin panel: Settings → WhatsApp tab (all cities at once).
-- Use this SQL only for one-time seeding in Supabase SQL Editor.

-- 1) Global default (all cities when a city has no own link)
INSERT INTO site_settings (key, value, city_id, updated_at)
VALUES ('whatsapp_order_url', 'https://wa.me/923001234567', NULL, NOW())
ON CONFLICT (key) WHERE city_id IS NULL
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- 2) Optional: same link for every active city (remove if you only want the global default)
INSERT INTO site_settings (key, value, city_id, updated_at)
SELECT
  'whatsapp_order_url',
  'https://wa.me/923001234567',
  sc.id,
  NOW()
FROM service_cities sc
WHERE sc.is_active = true
ON CONFLICT (key, city_id) WHERE city_id IS NOT NULL
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
