import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { successResponse } from '../utils/response';
import { resolvePublicCityId } from '../utils/cityScope';
import {
  fetchBannerSettings,
  fetchWhatsAppOrderSettings,
  fetchBrandLogoSettings,
  fetchBrandFaviconSettings,
  fetchHeroImageSettings,
  fetchGlobalSettings,
  fetchServiceAreaMessages,
  ATTA_CHAKKI_ENABLED_KEY,
} from '../utils/siteSettings';
import { query } from '../config/database';
import { hasRestaurantDeliveryColumns } from '../config/restaurantSchema';

const router = Router();

// Public: global brand logo URL (no auth)
router.get('/brand', asyncHandler(async (_req, res) => {
  const brand = await fetchBrandLogoSettings();
  const logoUrl = brand.brand_logo_url?.trim() || null;
  successResponse(res, { logoUrl, logo_url: logoUrl }, 'Brand logo retrieved');
}));

router.get('/favicon', asyncHandler(async (_req, res) => {
  const favicon = await fetchBrandFaviconSettings();
  const faviconUrl = favicon.brand_favicon_url?.trim() || null;
  successResponse(res, { faviconUrl, favicon_url: faviconUrl }, 'Brand favicon retrieved');
}));

// Public: Get banner settings (no auth required)
router.get('/banner', asyncHandler(async (req, res) => {
  const cityId = await resolvePublicCityId(req);
  const [banner, whatsapp] = await Promise.all([
    fetchBannerSettings(cityId),
    fetchWhatsAppOrderSettings(cityId),
  ]);
  successResponse(res, { ...banner, ...whatsapp }, 'Banner settings retrieved');
}));

// Public: per-city hero image for website + customer app homepage (no auth)
router.get('/hero', asyncHandler(async (req, res) => {
  const cityId = await resolvePublicCityId(req);
  const hero = await fetchHeroImageSettings(cityId);
  const imageUrl = hero.hero_image_url?.trim() || null;
  successResponse(
    res,
    { heroImageUrl: imageUrl, hero_image_url: imageUrl },
    'Hero image retrieved'
  );
}));

// Public: WhatsApp order link for customer app hero (per city)
router.get('/whatsapp-order', asyncHandler(async (req, res) => {
  const cityId = await resolvePublicCityId(req);
  const settings = await fetchWhatsAppOrderSettings(cityId);
  successResponse(res, settings, 'WhatsApp order settings retrieved');
}));

// Public: global feature flags / config for storefront + apps (no auth required).
// Defaults are intentionally "off/coming-soon" when a flag has never been set.
router.get('/public-config', asyncHandler(async (_req, res) => {
  const map = await fetchGlobalSettings([ATTA_CHAKKI_ENABLED_KEY]);
  successResponse(
    res,
    { atta_chakki_enabled: map[ATTA_CHAKKI_ENABLED_KEY] === 'true' },
    'Public config retrieved'
  );
}));

// Public: active service-area polygons + out-of-area popup copy for a city.
// `enabled` is false when the city has no active polygon (no gating applied).
router.get('/service-area', asyncHandler(async (req, res) => {
  const cityId = await resolvePublicCityId(req);
  const [areas, message] = await Promise.all([
    cityId
      ? query(
          `SELECT polygon FROM service_areas WHERE city_id = $1 AND is_active = true`,
          [cityId]
        )
      : Promise.resolve({ rows: [] as Array<{ polygon: unknown }> }),
    fetchServiceAreaMessages(),
  ]);
  const polygons = areas.rows.map((r) => r.polygon);
  successResponse(
    res,
    { enabled: polygons.length > 0, polygons, message },
    'Service area retrieved'
  );
}));

// Public: active "Today's Basket" combos for the selected city, with items.
router.get('/baskets', asyncHandler(async (req, res) => {
  const cityId = await resolvePublicCityId(req);
  const baskets = cityId
    ? await query(
        `SELECT id, name, description, total_price, image_url
           FROM baskets
          WHERE is_active = true AND (city_id = $1 OR city_id IS NULL)
          ORDER BY created_at DESC`,
        [cityId]
      )
    : await query(
        `SELECT id, name, description, total_price, image_url
           FROM baskets
          WHERE is_active = true AND city_id IS NULL
          ORDER BY created_at DESC`
      );

  const ids = baskets.rows.map((b) => b.id);
  let itemsByBasket: Record<string, any[]> = {};
  if (ids.length > 0) {
    const items = await query(
      `SELECT bi.basket_id, bi.product_id, bi.quality, bi.quantity, bi.unit,
              p.name_en, p.name_ur, p.primary_image
         FROM basket_items bi
         JOIN products p ON p.id = bi.product_id
        WHERE bi.basket_id = ANY($1::uuid[]) AND p.is_active = true
        ORDER BY bi.created_at ASC`,
      [ids]
    );
    itemsByBasket = items.rows.reduce((acc: Record<string, any[]>, row) => {
      (acc[row.basket_id] = acc[row.basket_id] || []).push({
        product_id: row.product_id,
        name: row.name_en || row.name_ur,
        image: row.primary_image,
        quality: row.quality,
        quantity: Number(row.quantity),
        unit: row.unit,
      });
      return acc;
    }, {});
  }

  const result = baskets.rows
    .map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      total_price: Number(b.total_price),
      image_url: b.image_url,
      items: itemsByBasket[b.id] || [],
    }))
    .filter((b) => b.items.length > 0);

  successResponse(res, result, 'Baskets retrieved');
}));

// Public: Get active service cities (no auth required)
router.get('/cities', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, name, province FROM service_cities WHERE is_active = true ORDER BY name`
  );
  successResponse(res, result.rows, 'Cities retrieved');
}));

// Public: Get delivery settings (no auth required)
router.get('/delivery', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT key, value FROM site_settings WHERE key LIKE 'delivery_%'`
  );
  const map: Record<string, string> = {};
  for (const row of result.rows) map[row.key.replace('delivery_', '')] = row.value;

  const num = (k: string, d: number) => {
    const n = parseFloat(map[k]);
    return Number.isFinite(n) ? n : d;
  };

  const settings = {
    base_charge: num('base_charge', 100),
    free_delivery_threshold: num('free_delivery_threshold', 500),
    express_charge: num('express_charge', 100),
    // Urgent (on-demand) delivery — alternative to time slots.
    urgent_charge: num('urgent_charge', 0),
    urgent_eta: (map['urgent_eta'] || '').trim(),
    urgent_enabled: num('urgent_charge', 0) > 0,
    // % of a TODAY slot's window that may elapse before it becomes unselectable.
    slot_cutoff_percent: num('slot_cutoff_percent', 60),
  };
  successResponse(res, settings, 'Delivery settings retrieved');
}));

// Public: optional Google Maps JS key (Render GOOGLE_MAPS_API_KEY). Browser keys are public.
router.get('/maps-key', asyncHandler(async (_req, res) => {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    '';
  successResponse(res, { key: key || null }, 'Maps key retrieved');
}));

// Public: Get available time slots (no auth required). Consumer slots only —
// restaurant slots (audience='restaurant') are served by /api/restaurant/time-slots.
router.get('/time-slots', asyncHandler(async (req, res) => {
  const dayOfWeek = new Date().getDay();
  const audienceClause = (await hasRestaurantDeliveryColumns()) ? `AND audience = 'consumer'` : '';
  const result = await query(
    `SELECT id, slot_name, start_time, end_time,
            is_free_delivery_slot, is_express_slot,
            (max_orders - booked_orders) as available_slots
     FROM time_slots
     WHERE status = 'available'
     ${audienceClause}
     AND (applicable_days IS NULL OR $1 = ANY(applicable_days))
     ORDER BY start_time ASC`,
    [dayOfWeek]
  );
  successResponse(res, result.rows, 'Time slots retrieved');
}));

export default router;
