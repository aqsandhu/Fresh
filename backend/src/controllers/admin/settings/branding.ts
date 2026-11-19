// Brand logo, favicon, hero image, app widget — moved from settings.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware';
import { successResponse, errorResponse } from '../../../utils/response';
import logger from '../../../utils/logger';
import { resolveCityScope } from '../../../utils/cityScope';
import {
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
  fetchAppWidgetSettings,
  APP_WIDGET_KEYS,
} from '../../../utils/siteSettings';

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
 * Get app widget settings (global)
 * GET /api/admin/site-settings/app-widget
 */

export const getAppWidgetSettings = asyncHandler(async (_req: Request, res: Response) => {
  const widget = await fetchAppWidgetSettings();
  successResponse(res, widget, 'App widget settings retrieved');
});

/**
 * Update app widget settings (global)
 * PUT /api/admin/site-settings/app-widget
 */

export const updateAppWidgetSettings = asyncHandler(async (req: Request, res: Response) => {
  // One widget for every city's app → super admin only (B28).
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only the super admin can change the app widget (it shows in every city).', 403);
  }
  const userId = req.user?.id;
  const { enabled, title, message, message_ur } = req.body;

  if (enabled !== undefined) {
    await upsertGlobalSiteSetting(APP_WIDGET_KEYS.enabled, String(enabled === true || enabled === 'true'), userId);
  }
  if (title !== undefined) {
    await upsertGlobalSiteSetting(APP_WIDGET_KEYS.title, String(title).trim().slice(0, 60), userId);
  }
  if (message !== undefined) {
    await upsertGlobalSiteSetting(APP_WIDGET_KEYS.message, String(message).trim().slice(0, 140), userId);
  }
  if (message_ur !== undefined) {
    await upsertGlobalSiteSetting(APP_WIDGET_KEYS.messageUr, String(message_ur).trim().slice(0, 140), userId);
  }

  logger.info('App widget settings updated', { updatedBy: userId });
  successResponse(res, await fetchAppWidgetSettings(), 'App widget settings updated successfully');
});

/**
 * Get banner settings
 * GET /api/admin/site-settings/banner
 */
