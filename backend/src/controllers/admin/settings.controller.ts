// ============================================================================
// ADMIN CONTROLLER — site settings, cities, delivery zones, time slots
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse } from '../../utils/response';
import logger from '../../utils/logger';
import { resolveCityScope } from '../../utils/cityScope';
import {
  fetchBannerSettings,
  upsertBannerSettings,
  fetchWhatsAppOrderSettings,
  fetchWhatsAppOrderSettingsAll,
  upsertWhatsAppOrderSettings,
  upsertWhatsAppOrderSettingsBulk,
  upsertGlobalSiteSetting,
  fetchBrandLogoSettings,
  deleteBrandLogoFromStorage,
  clearBrandLogoSettings,
  BRAND_LOGO_URL_KEY,
  BRAND_LOGO_STORAGE_PATH_KEY,
  fetchBrandFaviconSettings,
  deleteBrandFaviconFromStorage,
  clearBrandFaviconSettings,
  BRAND_FAVICON_URL_KEY,
  BRAND_FAVICON_STORAGE_PATH_KEY,
  fetchHeroImageSettings,
  upsertHeroImageSettings,
  deleteHeroImageFromStorage,
  clearHeroImageSettings,
  fetchGlobalSettings,
  ATTA_CHAKKI_ENABLED_KEY,
} from '../../utils/siteSettings';
import { hasRestaurantDeliveryColumns } from '../../config/restaurantSchema';

export const getBrandLogoSettings = asyncHandler(async (req: Request, res: Response) => {
  const brand = await fetchBrandLogoSettings();
  successResponse(res, brand, 'Brand logo settings retrieved');
});

/**
 * Update global brand logo (super admin only)
 * PUT /api/admin/site-settings/brand
 */

export const updateBrandLogoSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can change the brand logo', 403);
  }

  const file = req.file as Express.Multer.File | undefined;

  if (!file?.buffer?.length) {
    return errorResponse(res, 'Logo image file is required', 400);
  }

  if (!file.url) {
    return errorResponse(
      res,
      'Logo upload failed. Check Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) on Render.',
      500
    );
  }

  const previous = await fetchBrandLogoSettings();
  const newPath = file.storagePath?.trim() || '';
  const removedCount = await deleteBrandLogoFromStorage(previous, newPath);

  const userId = req.user?.id;
  await upsertGlobalSiteSetting(BRAND_LOGO_URL_KEY, file.url, userId);
  await upsertGlobalSiteSetting(BRAND_LOGO_STORAGE_PATH_KEY, newPath, userId);

  logger.info('Brand logo updated', {
    updatedBy: userId,
    url: file.url,
    previousFilesRemoved: removedCount,
  });

  const brand = await fetchBrandLogoSettings();
  const message =
    removedCount > 0
      ? 'Brand logo updated. Previous file removed from storage.'
      : 'Brand logo updated successfully';
  successResponse(res, { ...brand, previousFilesRemoved: removedCount }, message);
});

/**
 * Remove global brand logo (super admin only)
 * DELETE /api/admin/site-settings/brand
 */

export const deleteBrandLogoSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can remove the brand logo', 403);
  }

  const previous = await fetchBrandLogoSettings();
  const removedCount = await deleteBrandLogoFromStorage(previous);
  const userId = req.user?.id;
  const brand = await clearBrandLogoSettings(userId);

  logger.info('Brand logo removed', { updatedBy: userId, filesRemoved: removedCount });

  successResponse(
    res,
    { ...brand, filesRemoved: removedCount },
    removedCount > 0
      ? 'Brand logo removed from site and storage.'
      : 'Brand logo settings cleared.'
  );
});

/**
 * Get global brand favicon (view-only for city admins)
 * GET /api/admin/site-settings/favicon
 */

export const getBrandFaviconSettings = asyncHandler(async (req: Request, res: Response) => {
  const favicon = await fetchBrandFaviconSettings();
  successResponse(res, favicon, 'Brand favicon settings retrieved');
});

/**
 * Update global brand favicon (super admin only)
 * PUT /api/admin/site-settings/favicon
 */

export const updateBrandFaviconSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can change the brand favicon', 403);
  }

  const file = req.file as Express.Multer.File | undefined;

  if (!file?.buffer?.length) {
    return errorResponse(res, 'Favicon image file is required', 400);
  }

  if (!file.url) {
    return errorResponse(
      res,
      'Favicon upload failed. Check Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) on Render.',
      500
    );
  }

  const previous = await fetchBrandFaviconSettings();
  const newPath = file.storagePath?.trim() || '';
  const removedCount = await deleteBrandFaviconFromStorage(previous, newPath);

  const userId = req.user?.id;
  await upsertGlobalSiteSetting(BRAND_FAVICON_URL_KEY, file.url, userId);
  await upsertGlobalSiteSetting(BRAND_FAVICON_STORAGE_PATH_KEY, newPath, userId);

  logger.info('Brand favicon updated', {
    updatedBy: userId,
    url: file.url,
    previousFilesRemoved: removedCount,
  });

  const favicon = await fetchBrandFaviconSettings();
  const message =
    removedCount > 0
      ? 'Brand favicon updated. Previous file removed from storage.'
      : 'Brand favicon updated successfully';
  successResponse(res, { ...favicon, previousFilesRemoved: removedCount }, message);
});

/**
 * Remove global brand favicon (super admin only)
 * DELETE /api/admin/site-settings/favicon
 */

export const deleteBrandFaviconSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can remove the brand favicon', 403);
  }

  const previous = await fetchBrandFaviconSettings();
  const removedCount = await deleteBrandFaviconFromStorage(previous);
  const userId = req.user?.id;
  const favicon = await clearBrandFaviconSettings(userId);

  logger.info('Brand favicon removed', { updatedBy: userId, filesRemoved: removedCount });

  successResponse(
    res,
    { ...favicon, filesRemoved: removedCount },
    removedCount > 0
      ? 'Brand favicon removed from site and storage.'
      : 'Brand favicon settings cleared.'
  );
});

// ============================================================================
// HERO SECTION IMAGE (per-city — website + customer app homepage)
// Every city admin manages their own city; super admin manages any city.
// ============================================================================

/**
 * Get the hero image for the current scope (city value, else global fallback).
 * GET /api/admin/site-settings/hero
 */
export const getHeroSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const hero = await fetchHeroImageSettings(scope.cityId);
  successResponse(res, hero, 'Hero image settings retrieved');
});

/**
 * Upload / replace the hero image for the scoped city.
 * PUT /api/admin/site-settings/hero  (multipart: field "hero")
 */
export const updateHeroSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (!scope.cityId) {
    return errorResponse(res, 'Select a city before updating the hero image', 400);
  }

  const file = req.file as Express.Multer.File | undefined;
  if (!file?.buffer?.length) {
    return errorResponse(res, 'Hero image file is required', 400);
  }
  if (!file.url) {
    return errorResponse(
      res,
      'Hero image upload failed. Check Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) on Render.',
      500
    );
  }

  const userId = req.user?.id;
  const newPath = file.storagePath?.trim() || '';

  // Remove the city's previous hero file (skip the one we just uploaded).
  const previous = await fetchHeroImageSettings(scope.cityId);
  const removedCount = await deleteHeroImageFromStorage(previous, newPath);

  const hero = await upsertHeroImageSettings(file.url, newPath, scope.cityId, userId);

  logger.info('Hero image updated', {
    updatedBy: userId,
    cityId: scope.cityId,
    url: file.url,
    previousFilesRemoved: removedCount,
  });

  successResponse(
    res,
    { ...hero, previousFilesRemoved: removedCount },
    removedCount > 0
      ? 'Hero image updated. Previous file removed from storage.'
      : 'Hero image updated successfully'
  );
});

/**
 * Remove the scoped city's hero image (falls back to the global hero, if any).
 * DELETE /api/admin/site-settings/hero
 */
export const deleteHeroSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (!scope.cityId) {
    return errorResponse(res, 'Select a city before removing the hero image', 400);
  }

  const previous = await fetchHeroImageSettings(scope.cityId);
  const removedCount = await deleteHeroImageFromStorage(previous);
  const hero = await clearHeroImageSettings(scope.cityId, req.user?.id);

  logger.info('Hero image removed', {
    removedBy: req.user?.id,
    cityId: scope.cityId,
    filesRemoved: removedCount,
  });

  successResponse(
    res,
    { ...hero, filesRemoved: removedCount },
    removedCount > 0
      ? 'Hero image removed from site and storage.'
      : 'Hero image cleared.'
  );
});

/**
 * Get banner settings
 * GET /api/admin/site-settings/banner
 */

export const getBannerSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const banner = await fetchBannerSettings(scope.cityId);
  successResponse(res, banner, 'Banner settings retrieved');
});

/**
 * Update banner settings
 * PUT /api/admin/site-settings/banner
 */

export const updateBannerSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (!scope.cityId) {
    return errorResponse(res, 'Select a city before updating banner settings', 400);
  }

  const userId = req.user?.id;
  const {
    banner_left_text,
    banner_middle_text,
    banner_right_text_en,
    banner_right_text_ur,
  } = req.body;

  const banner = await upsertBannerSettings(
    {
      banner_left_text,
      banner_middle_text,
      banner_right_text_en,
      banner_right_text_ur,
    },
    scope.cityId,
    userId
  );

  logger.info('Banner settings updated', {
    updatedBy: userId,
    cityId: scope.cityId,
  });

  successResponse(res, banner, 'Banner settings updated successfully');
});

/**
 * Get WhatsApp order link for mobile app (per city)
 * GET /api/admin/site-settings/whatsapp-order
 */

export const getWhatsAppOrderSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const settings = await fetchWhatsAppOrderSettings(scope.cityId);
  successResponse(res, settings, 'WhatsApp order settings retrieved');
});

/**
 * Update WhatsApp order link for mobile app (per city)
 * PUT /api/admin/site-settings/whatsapp-order
 */

export const updateWhatsAppOrderSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (!scope.cityId) {
    return errorResponse(res, 'Select a city before updating WhatsApp order settings', 400);
  }

  const userId = req.user?.id;
  const raw =
    req.body.whatsapp_order_url ??
    req.body.whatsappOrderUrl ??
    '';

  const url = String(raw).trim();
  if (url && !/^https?:\/\//i.test(url) && !/^\+?\d[\d\s-]{8,}$/.test(url)) {
    return errorResponse(
      res,
      'Enter a valid WhatsApp link (https://wa.me/...) or phone number',
      400
    );
  }

  const settings = await upsertWhatsAppOrderSettings(url, scope.cityId, userId);

  logger.info('WhatsApp order settings updated', {
    updatedBy: userId,
    cityId: scope.cityId,
  });

  successResponse(res, settings, 'WhatsApp order settings updated successfully');
});

function normalizeWhatsappUrlInput(raw: unknown): string {
  return String(raw ?? '').trim();
}

function validateWhatsappUrlInput(url: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || /^\+?\d[\d\s-]{8,}$/.test(url)) return null;
  return 'Enter a valid WhatsApp link (https://wa.me/...) or phone number';
}

/**
 * All cities + global fallback WhatsApp links for admin settings UI.
 * GET /api/admin/site-settings/whatsapp-order/all
 */

export const getWhatsAppOrderSettingsAll = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const all = await fetchWhatsAppOrderSettingsAll();

  if (scope.cityId) {
    all.cities = all.cities.filter((c) => c.cityId === scope.cityId);
  }

  successResponse(res, all, 'WhatsApp order settings retrieved');
});

/**
 * Bulk save global + per-city WhatsApp order links.
 * PUT /api/admin/site-settings/whatsapp-order/bulk
 */

export const updateWhatsAppOrderSettingsBulk = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const userId = req.user?.id;

  const globalRaw = normalizeWhatsappUrlInput(
    req.body.global_whatsapp_order_url ?? req.body.globalWhatsappOrderUrl
  );
  const globalErr = validateWhatsappUrlInput(globalRaw);
  if (globalErr) return errorResponse(res, globalErr, 400);

  let cityEntries: Array<{ cityId: string; whatsappOrderUrl: string }> = [];
  const rawCities = req.body.cities ?? req.body.city_settings;
  if (Array.isArray(rawCities)) {
    for (const row of rawCities) {
      const cityId = row.city_id ?? row.cityId;
      if (!cityId) continue;
      const url = normalizeWhatsappUrlInput(row.whatsapp_order_url ?? row.whatsappOrderUrl);
      const err = validateWhatsappUrlInput(url);
      if (err) return errorResponse(res, `${err} (city ${cityId})`, 400);
      cityEntries.push({ cityId: String(cityId), whatsappOrderUrl: url });
    }
  }

  if (scope.cityId) {
    cityEntries = cityEntries.filter((e) => e.cityId === scope.cityId);
    if (cityEntries.length === 0 && rawCities?.length) {
      return errorResponse(res, 'You can only update WhatsApp settings for your assigned city', 403);
    }
  }

  const bulkPayload: {
    globalWhatsappOrderUrl?: string;
    cities?: Array<{ cityId: string; whatsappOrderUrl: string }>;
  } = { cities: cityEntries };

  // City-scoped admins may not change the global default
  if (!scope.cityId) {
    bulkPayload.globalWhatsappOrderUrl = globalRaw;
  }

  const result = await upsertWhatsAppOrderSettingsBulk(bulkPayload, userId);

  if (scope.cityId) {
    result.cities = result.cities.filter((c) => c.cityId === scope.cityId);
  }

  logger.info('WhatsApp order settings bulk updated', {
    updatedBy: userId,
    cityCount: cityEntries.length,
    scopedCityId: scope.cityId,
  });

  successResponse(res, result, 'WhatsApp order settings saved');
});

// ============================================================================
// DELIVERY SETTINGS, TIME SLOTS, BUSINESS HOURS
// ============================================================================

/**
 * Get all settings (delivery config)
 * GET /api/admin/settings
 */

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  // Get delivery settings from site_settings table
  const result = await query(
    `SELECT key, value FROM site_settings WHERE key LIKE 'delivery_%'`
  );
  const map: Record<string, string> = {};
  for (const row of result.rows) map[row.key.replace('delivery_', '')] = row.value;
  const num = (k: string, d: number) => {
    const n = parseFloat(map[k]);
    return Number.isFinite(n) ? n : d;
  };

  const delivery = {
    base_charge: num('base_charge', 50),
    free_delivery_threshold: num('free_delivery_threshold', 500),
    express_charge: num('express_charge', 100),
    urgent_charge: num('urgent_charge', 0),
    urgent_eta: (map['urgent_eta'] || '').trim(),
    slot_cutoff_percent: num('slot_cutoff_percent', 60),
  };

  successResponse(res, { delivery }, 'Settings retrieved');
});

/**
 * Update delivery settings
 * PUT /api/admin/settings/delivery
 */

export const updateDeliverySettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { base_charge, free_delivery_threshold, express_charge, urgent_charge, urgent_eta, slot_cutoff_percent } = req.body;

  const updates = [
    { key: 'delivery_base_charge', value: String(base_charge ?? 50) },
    { key: 'delivery_free_delivery_threshold', value: String(free_delivery_threshold ?? 500) },
    { key: 'delivery_express_charge', value: String(express_charge ?? 100) },
  ];

  // Slot cutoff % (0–100): how much of a TODAY slot may elapse before it locks.
  if (slot_cutoff_percent !== undefined) {
    const n = parseFloat(String(slot_cutoff_percent));
    const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 60;
    updates.push({ key: 'delivery_slot_cutoff_percent', value: String(clamped) });
  }

  // Urgent (on-demand) delivery is a SUPER-ADMIN-only setting. Ignore these
  // fields for any other admin so a city admin can't change the urgent rate.
  const isSuperAdmin = req.user?.role === 'super_admin';
  if (isSuperAdmin) {
    if (urgent_charge !== undefined) {
      const n = parseFloat(String(urgent_charge));
      updates.push({ key: 'delivery_urgent_charge', value: String(Number.isFinite(n) && n >= 0 ? n : 0) });
    }
    if (urgent_eta !== undefined) {
      updates.push({ key: 'delivery_urgent_eta', value: String(urgent_eta ?? '').trim().slice(0, 100) });
    }
  }

  for (const { key, value } of updates) {
    await upsertGlobalSiteSetting(key, value, userId);
  }

  successResponse(res, {
    base_charge: parseFloat(String(base_charge)) || 50,
    free_delivery_threshold: parseFloat(String(free_delivery_threshold)) || 500,
    express_charge: parseFloat(String(express_charge)) || 100,
    ...(isSuperAdmin
      ? {
          urgent_charge: parseFloat(String(urgent_charge)) || 0,
          urgent_eta: String(urgent_eta ?? '').trim(),
        }
      : {}),
  }, 'Delivery settings updated');
});

/**
 * Get time slots
 * GET /api/admin/settings/time-slots
 */

export const getTimeSlots = asyncHandler(async (req: Request, res: Response) => {
  // audience = 'consumer' (default) | 'restaurant'. Restaurant slots are managed
  // from the admin Restaurants tab; consumer slots from Settings.
  const audienceReady = await hasRestaurantDeliveryColumns();
  const audience = req.query.audience === 'restaurant' ? 'restaurant' : 'consumer';
  const params = audienceReady ? [audience] : [];
  const result = await query(
    `SELECT id, slot_name, start_time, end_time, max_orders,
            booked_orders, status, is_free_delivery_slot, is_express_slot,
            CASE WHEN status = 'available' THEN true ELSE false END as is_active
     FROM time_slots
     ${audienceReady ? 'WHERE audience = $1' : ''}
     ORDER BY start_time ASC`,
    params
  );

  successResponse(res, result.rows, 'Time slots retrieved');
});

/**
 * Create time slot
 * POST /api/admin/settings/time-slots
 */

export const createTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { start_time, end_time, max_orders, is_active, is_free_delivery_slot } = req.body;
  const slotName = `${start_time} - ${end_time}`;
  const status = is_active !== false ? 'available' : 'unavailable';
  const audienceReady = await hasRestaurantDeliveryColumns();
  const audience = req.body.audience === 'restaurant' ? 'restaurant' : 'consumer';

  const cols = ['slot_name', 'start_time', 'end_time', 'max_orders', 'status', 'is_free_delivery_slot'];
  const vals: any[] = [slotName, start_time, end_time, max_orders || 50, status, is_free_delivery_slot === true];
  if (audienceReady) {
    cols.push('audience');
    vals.push(audience);
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

  const result = await query(
    `INSERT INTO time_slots (${cols.join(', ')})
     VALUES (${placeholders})
     RETURNING id, slot_name, start_time, end_time, max_orders, status, is_free_delivery_slot,
               CASE WHEN status = 'available' THEN true ELSE false END as is_active`,
    vals
  );

  createdResponse(res, result.rows[0], 'Time slot created');
});

/**
 * Update time slot
 * PUT /api/admin/settings/time-slots/:id
 */

export const updateTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { start_time, end_time, max_orders, is_active, is_free_delivery_slot } = req.body;
  const slotName = start_time && end_time ? `${start_time} - ${end_time}` : undefined;
  const status = is_active !== undefined ? (is_active ? 'available' : 'unavailable') : undefined;

  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (slotName) { sets.push(`slot_name = $${idx}`); params.push(slotName); idx++; }
  if (start_time) { sets.push(`start_time = $${idx}`); params.push(start_time); idx++; }
  if (end_time) { sets.push(`end_time = $${idx}`); params.push(end_time); idx++; }
  if (max_orders !== undefined) { sets.push(`max_orders = $${idx}`); params.push(max_orders); idx++; }
  if (status) { sets.push(`status = $${idx}`); params.push(status); idx++; }
  if (is_free_delivery_slot !== undefined) { sets.push(`is_free_delivery_slot = $${idx}`); params.push(is_free_delivery_slot === true); idx++; }

  if (sets.length === 0) {
    return successResponse(res, null, 'Nothing to update');
  }

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE time_slots SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING id, slot_name, start_time, end_time, max_orders, status, is_free_delivery_slot,
               CASE WHEN status = 'available' THEN true ELSE false END as is_active`,
    params
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Time slot not found');
  }

  successResponse(res, result.rows[0], 'Time slot updated');
});

/**
 * Delete time slot
 * DELETE /api/admin/settings/time-slots/:id
 */

export const deleteTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    'DELETE FROM time_slots WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Time slot not found');
  }

  successResponse(res, { id }, 'Time slot deleted');
});

/**
 * Get business hours
 * GET /api/admin/settings/business-hours
 */

export const getBusinessHours = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT key, value FROM site_settings WHERE key LIKE 'business_hours_%'`
  );

  if (result.rows.length === 0) {
    // Return default business hours
    const defaults = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => ({
      day,
      open: '09:00',
      close: '21:00',
      is_open: day !== 'Sunday',
    }));
    return successResponse(res, defaults, 'Business hours retrieved');
  }

  // Parse stored JSON
  const hoursRow = result.rows.find((r: any) => r.key === 'business_hours_data');
  const hours = hoursRow ? JSON.parse(hoursRow.value) : [];
  successResponse(res, hours, 'Business hours retrieved');
});

/**
 * Update business hours
 * PUT /api/admin/settings/business-hours
 */

export const updateBusinessHours = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { hours } = req.body;

  await upsertGlobalSiteSetting('business_hours_data', JSON.stringify(hours), userId);

  successResponse(res, hours, 'Business hours updated');
});

// ============================================================================
// PLATFORM FEATURE FLAGS (super-admin only, global)
// ============================================================================

/** Serialize the global feature flags from a key→value map. */
function serializePlatformFlags(map: Record<string, string>) {
  return {
    atta_chakki_enabled: map[ATTA_CHAKKI_ENABLED_KEY] === 'true',
  };
}

/**
 * Get global platform feature flags.
 * GET /api/admin/settings/platform
 */
export const getPlatformSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can view platform settings', 403);
  }
  const map = await fetchGlobalSettings([ATTA_CHAKKI_ENABLED_KEY]);
  successResponse(res, serializePlatformFlags(map), 'Platform settings retrieved');
});

/**
 * Update global platform feature flags (whitelist only).
 * PUT /api/admin/settings/platform
 */
export const updatePlatformSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can change platform settings', 403);
  }
  const userId = req.user?.id;
  const toBool = (v: unknown) => v === true || v === 'true';

  if (req.body.atta_chakki_enabled !== undefined) {
    await upsertGlobalSiteSetting(
      ATTA_CHAKKI_ENABLED_KEY,
      toBool(req.body.atta_chakki_enabled) ? 'true' : 'false',
      userId
    );
  }

  const map = await fetchGlobalSettings([ATTA_CHAKKI_ENABLED_KEY]);
  logger.info('Platform settings updated', { updatedBy: userId });
  successResponse(res, serializePlatformFlags(map), 'Platform settings updated');
});

// ============================================================================
// SERVICE CITIES MANAGEMENT
// ============================================================================

/**
 * Get all service cities
 * GET /api/admin/cities
 */

export const getCities = asyncHandler(async (req: Request, res: Response) => {
  const scope = req.cityScope;

  // Super admins must always get the FULL list so the city switcher keeps
  // working even while a single city is selected — the X-City-Id header would
  // otherwise scope this list down to just the one selected city.
  if (req.user?.role !== 'super_admin' && scope) {
    if (scope.forbidden) {
      return successResponse(res, [], 'Cities retrieved');
    }
    if (!scope.unrestricted && scope.cityId) {
      const result = await query(
        `SELECT id, name, province, is_active, created_at
           FROM service_cities
          WHERE id = $1
          ORDER BY name`,
        [scope.cityId]
      );
      return successResponse(res, result.rows, 'Cities retrieved');
    }
  }

  const result = await query(
    `SELECT id, name, province, is_active, created_at FROM service_cities ORDER BY name`
  );
  successResponse(res, result.rows, 'Cities retrieved');
});

/**
 * Add a service city
 * POST /api/admin/cities
 */

export const addCity = asyncHandler(async (req: Request, res: Response) => {
  const { name, province } = req.body;

  const existing = await query(
    `SELECT id FROM service_cities WHERE LOWER(name) = LOWER($1)`,
    [name]
  );
  if (existing.rows.length > 0) {
    return errorResponse(res, 'City already exists', 400);
  }

  const result = await query(
    `INSERT INTO service_cities (name, province) VALUES ($1, $2) RETURNING *`,
    [name, province]
  );
  createdResponse(res, result.rows[0], 'City added');
});

/**
 * Toggle city active status
 * PUT /api/admin/cities/:id/toggle
 */

export const toggleCity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `UPDATE service_cities SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'City not found');
  }
  successResponse(res, result.rows[0], 'City updated');
});

/**
 * Delete a service city
 * DELETE /api/admin/cities/:id
 */

export const deleteCity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `DELETE FROM service_cities WHERE id = $1 RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'City not found');
  }
  successResponse(res, null, 'City deleted');
});

/**
 * Copy categories + products from one city to another (super-admin only).
 * POST /api/admin/cities/import-catalog
 */

export const importCityCatalog = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can import catalog between cities', 403);
  }

  const sourceCityId = req.body.source_city_id || req.body.sourceCityId;
  const targetCityId = req.body.target_city_id || req.body.targetCityId;

  if (!sourceCityId || !targetCityId) {
    return errorResponse(res, 'source_city_id and target_city_id are required', 400);
  }
  if (sourceCityId === targetCityId) {
    return errorResponse(res, 'Source and target city must be different', 400);
  }

  const cities = await query(
    `SELECT id, name FROM service_cities WHERE id = ANY($1::uuid[])`,
    [[sourceCityId, targetCityId]]
  );
  if (cities.rows.length !== 2) {
    return errorResponse(res, 'Invalid source or target city', 400);
  }

  const summary = await withTransaction(async (client) => {
    const categories = await client.query(
      `SELECT * FROM categories WHERE city_id = $1 ORDER BY display_order, name_en`,
      [sourceCityId]
    );

    const categoryMap = new Map<string, string>();
    let categoriesCopied = 0;
    let productsCopied = 0;

    for (const cat of categories.rows) {
      let slug = cat.slug;
      const slugCheck = await client.query(
        'SELECT id FROM categories WHERE slug = $1 AND city_id = $2',
        [slug, targetCityId]
      );
      if (slugCheck.rows.length > 0) {
        slug = `${slug}-${Date.now()}`;
      }

      const inserted = await client.query(
        `INSERT INTO categories (
          name_ur, name_en, slug, icon_url, image_url,
          parent_id, display_order, is_active,
          qualifies_for_free_delivery, minimum_order_for_free_delivery,
          city_id, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id`,
        [
          cat.name_ur, cat.name_en, slug, cat.icon_url, cat.image_url,
          null, cat.display_order, cat.is_active,
          cat.qualifies_for_free_delivery, cat.minimum_order_for_free_delivery,
          targetCityId, req.user?.id || null,
        ]
      );
      categoryMap.set(cat.id, inserted.rows[0].id);
      categoriesCopied++;
    }

    const products = await client.query(
      `SELECT * FROM products WHERE city_id = $1`,
      [sourceCityId]
    );

    for (const prod of products.rows) {
      const newCategoryId = categoryMap.get(prod.category_id);
      if (!newCategoryId) continue;

      let slug = prod.slug;
      const slugCheck = await client.query(
        'SELECT id FROM products WHERE slug = $1 AND city_id = $2',
        [slug, targetCityId]
      );
      if (slugCheck.rows.length > 0) {
        slug = `${slug}-${Date.now()}`;
      }

      await client.query(
        `INSERT INTO products (
          name_ur, name_en, slug, sku, barcode, category_id, subcategory_id,
          price, compare_at_price, cost_price,
          half_kg_price, quarter_kg_price, half_dozen_price,
          unit_type, unit_value, stock_quantity, low_stock_threshold,
          stock_status, track_inventory, primary_image, images,
          short_description, description_ur, description_en,
          attributes, meta_title, meta_description, tags,
          is_active, is_featured, is_new_arrival, city_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
        )`,
        [
          prod.name_ur, prod.name_en, slug, prod.sku, prod.barcode,
          newCategoryId, null,
          prod.price, prod.compare_at_price, prod.cost_price,
          prod.half_kg_price, prod.quarter_kg_price, prod.half_dozen_price,
          prod.unit_type, prod.unit_value, prod.stock_quantity, prod.low_stock_threshold,
          prod.stock_status, prod.track_inventory, prod.primary_image, prod.images,
          prod.short_description, prod.description_ur, prod.description_en,
          prod.attributes, prod.meta_title, prod.meta_description, prod.tags,
          prod.is_active, prod.is_featured, prod.is_new_arrival, targetCityId,
        ]
      );
      productsCopied++;
    }

    return { categoriesCopied, productsCopied };
  });

  logger.info('City catalog imported', {
    sourceCityId,
    targetCityId,
    ...summary,
    importedBy: req.user?.id,
  });

  successResponse(res, summary, 'Catalog imported successfully');
});

// ============================================================================
// DELIVERY ZONES MANAGEMENT
// ============================================================================

/**
 * List all delivery zones
 * GET /api/admin/delivery-zones
 */

export const getDeliveryZones = asyncHandler(async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT id, name, code, cities, areas, postal_codes,
            standard_delivery_charge, express_delivery_charge,
            minimum_order_value, is_active, created_at, updated_at
       FROM delivery_zones
      ORDER BY is_active DESC, name`
  );
  successResponse(res, result.rows, 'Delivery zones retrieved');
});

/**
 * Create a delivery zone
 * POST /api/admin/delivery-zones
 *
 * Body: { name, code, cities[], areas[], postal_codes?[],
 *         standard_delivery_charge, express_delivery_charge?,
 *         minimum_order_value? }
 */

export const createDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    code,
    cities,
    areas,
    postal_codes,
    standard_delivery_charge,
    express_delivery_charge,
    minimum_order_value,
  } = req.body;

  if (!name || !code) {
    return errorResponse(res, 'name and code are required', 400);
  }

  const dup = await query(
    `SELECT id FROM delivery_zones WHERE LOWER(code) = LOWER($1)`,
    [code]
  );
  if (dup.rows.length > 0) {
    return errorResponse(res, `Zone code '${code}' is already in use`, 400);
  }

  const result = await query(
    `INSERT INTO delivery_zones
       (name, code, cities, areas, postal_codes,
        standard_delivery_charge, express_delivery_charge, minimum_order_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      name,
      code,
      Array.isArray(cities) ? cities : [],
      Array.isArray(areas) ? areas : [],
      Array.isArray(postal_codes) ? postal_codes : null,
      standard_delivery_charge ?? 100,
      express_delivery_charge ?? 200,
      minimum_order_value ?? 500,
    ]
  );
  createdResponse(res, result.rows[0], 'Delivery zone created');
});

/**
 * Update a delivery zone
 * PUT /api/admin/delivery-zones/:id
 *
 * Body may contain any subset of the editable fields. Only provided
 * fields are updated; unspecified ones stay as-is.
 */

export const updateDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    code,
    cities,
    areas,
    postal_codes,
    standard_delivery_charge,
    express_delivery_charge,
    minimum_order_value,
    is_active,
  } = req.body;

  // If code is changing, make sure the new code isn't taken by another zone.
  if (code !== undefined) {
    const dup = await query(
      `SELECT id FROM delivery_zones WHERE LOWER(code) = LOWER($1) AND id <> $2`,
      [code, id]
    );
    if (dup.rows.length > 0) {
      return errorResponse(res, `Zone code '${code}' is already in use`, 400);
    }
  }

  const result = await query(
    `UPDATE delivery_zones SET
        name                     = COALESCE($2, name),
        code                     = COALESCE($3, code),
        cities                   = COALESCE($4, cities),
        areas                    = COALESCE($5, areas),
        postal_codes             = COALESCE($6, postal_codes),
        standard_delivery_charge = COALESCE($7, standard_delivery_charge),
        express_delivery_charge  = COALESCE($8, express_delivery_charge),
        minimum_order_value      = COALESCE($9, minimum_order_value),
        is_active                = COALESCE($10, is_active),
        updated_at               = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      name ?? null,
      code ?? null,
      Array.isArray(cities) ? cities : null,
      Array.isArray(areas) ? areas : null,
      Array.isArray(postal_codes) ? postal_codes : null,
      standard_delivery_charge ?? null,
      express_delivery_charge ?? null,
      minimum_order_value ?? null,
      typeof is_active === 'boolean' ? is_active : null,
    ]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, result.rows[0], 'Delivery zone updated');
});

/**
 * Toggle delivery zone active status
 * PUT /api/admin/delivery-zones/:id/toggle
 */

export const toggleDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `UPDATE delivery_zones SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, result.rows[0], 'Delivery zone updated');
});

/**
 * Delete a delivery zone
 * DELETE /api/admin/delivery-zones/:id
 *
 * Riders / addresses pointing at this zone have their zone_id set to NULL
 * (declared in the FK).
 */

export const deleteDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `DELETE FROM delivery_zones WHERE id = $1 RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, null, 'Delivery zone deleted');
});
