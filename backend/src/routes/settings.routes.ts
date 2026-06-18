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
