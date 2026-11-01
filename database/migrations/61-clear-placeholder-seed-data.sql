-- ============================================================================
-- Migration 61 — remove placeholder values left by the old seed data
-- ----------------------------------------------------------------------------
-- 1) Images. schema.sql used to seed every category with an icon at
--    https://cdn.example.com/icons/… and five sample products with images at
--    https://cdn.example.com/products/…. example.com is a reserved domain that
--    never serves an image, so every surface rendered a broken / blank picture
--    (the customer app showed empty grey category tiles). Those dead URLs are
--    set to NULL, which every storefront renders as its "no image" fallback.
--    No row is deleted or hidden; any real image the admin uploaded is kept.
--
-- 2) WhatsApp. Migration 08b used to seed https://wa.me/923001234567 (a
--    placeholder, not the business number) as the global default and for every
--    city, so "WhatsApp to Order" opened a chat with a stranger. Only rows that
--    still hold exactly that placeholder are removed; a link the admin saved is
--    untouched. With no link, the storefronts hide the button until the admin
--    sets the real one in Settings → WhatsApp.
--
-- Idempotent: a second run matches nothing.
-- ============================================================================
UPDATE categories SET icon_url = NULL
 WHERE icon_url LIKE 'http%://cdn.example.com/%';

UPDATE categories SET image_url = NULL
 WHERE image_url LIKE 'http%://cdn.example.com/%';

UPDATE products SET primary_image = NULL
 WHERE primary_image LIKE 'http%://cdn.example.com/%';

-- images is TEXT[]: drop just the placeholder entries, keep any real ones.
UPDATE products
   SET images = NULLIF(
         ARRAY(SELECT u FROM unnest(images) AS u WHERE u NOT LIKE 'http%://cdn.example.com/%'),
         '{}'::TEXT[]
       )
 WHERE EXISTS (SELECT 1 FROM unnest(images) AS u WHERE u LIKE 'http%://cdn.example.com/%');

DELETE FROM site_settings
 WHERE key = 'whatsapp_order_url'
   AND value IN ('https://wa.me/923001234567', 'https://wa.me/+923001234567');
