import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { successResponse } from '../utils/response';
import { resolvePublicCityId } from '../utils/cityScope';
import { fetchBannerSettings, fetchWhatsAppOrderSettings } from '../utils/siteSettings';
import { query } from '../config/database';

const router = Router();

// Public: Get banner settings (no auth required)
router.get('/banner', asyncHandler(async (req, res) => {
  const cityId = await resolvePublicCityId(req);
  const [banner, whatsapp] = await Promise.all([
    fetchBannerSettings(cityId),
    fetchWhatsAppOrderSettings(cityId),
  ]);
  successResponse(res, { ...banner, ...whatsapp }, 'Banner settings retrieved');
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
  const settings: Record<string, number> = {
    base_charge: 100,
    free_delivery_threshold: 500,
    express_charge: 100,
  };
  for (const row of result.rows) {
    const shortKey = row.key.replace('delivery_', '');
    settings[shortKey] = parseFloat(row.value) || 0;
  }
  successResponse(res, settings, 'Delivery settings retrieved');
}));

// Public: Get available time slots (no auth required)
router.get('/time-slots', asyncHandler(async (req, res) => {
  const dayOfWeek = new Date().getDay();
  const result = await query(
    `SELECT id, slot_name, start_time, end_time, 
            is_free_delivery_slot, is_express_slot,
            (max_orders - booked_orders) as available_slots
     FROM time_slots
     WHERE status = 'available'
     AND (applicable_days IS NULL OR $1 = ANY(applicable_days))
     ORDER BY start_time ASC`,
    [dayOfWeek]
  );
  successResponse(res, result.rows, 'Time slots retrieved');
}));

export default router;
