// Top banner and WhatsApp order links — moved from settings.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware';
import { successResponse, errorResponse } from '../../../utils/response';
import logger from '../../../utils/logger';
import { resolveCityScope } from '../../../utils/cityScope';
import {
  fetchBannerSettings,
  upsertBannerSettings,
  fetchWhatsAppOrderSettings,
  fetchWhatsAppOrderSettingsAll,
  upsertWhatsAppOrderSettings,
  upsertWhatsAppOrderSettingsBulk,
  normalizeTickerItems,
} from '../../../utils/siteSettings';

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
    banner_ticker_items,
  } = req.body;

  const banner = await upsertBannerSettings(
    {
      banner_left_text,
      banner_middle_text,
      banner_right_text_en,
      banner_right_text_ur,
      banner_ticker_items: normalizeTickerItems(banner_ticker_items),
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
