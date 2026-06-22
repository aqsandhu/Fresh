// ============================================================================
// ADMIN CONTROLLER — map-based service areas (super-admin only)
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  createdResponse,
} from '../../utils/response';
import logger from '../../utils/logger';
import { isValidPolygonRing } from '../../utils/geo';
import {
  fetchServiceAreaMessages,
  upsertGlobalSiteSetting,
  SERVICE_AREA_KEYS,
} from '../../utils/siteSettings';

function requireSuperAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== 'super_admin') {
    errorResponse(res, 'Only super admin can manage service areas', 403);
    return false;
  }
  return true;
}

/**
 * List service-area polygons (optionally filtered by ?cityId).
 * GET /api/admin/service-areas
 */
export const getServiceAreas = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;

  const cityId = (req.query.cityId || req.query.city_id) as string | undefined;
  const result = cityId
    ? await query(
        `SELECT id, city_id, name, polygon, is_active, created_at, updated_at
           FROM service_areas WHERE city_id = $1 ORDER BY created_at DESC`,
        [cityId]
      )
    : await query(
        `SELECT id, city_id, name, polygon, is_active, created_at, updated_at
           FROM service_areas ORDER BY created_at DESC`
      );

  successResponse(res, result.rows, 'Service areas retrieved');
});

/**
 * Create a service-area polygon.
 * POST /api/admin/service-areas  { city_id, name?, polygon: [[lng,lat], ...] }
 */
export const createServiceArea = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;

  const cityId = req.body.city_id || req.body.cityId;
  const name = String(req.body.name || 'Service Area').trim().slice(0, 120) || 'Service Area';
  const polygon = req.body.polygon;

  if (!cityId) return errorResponse(res, 'city_id is required', 400);
  if (!isValidPolygonRing(polygon)) {
    return errorResponse(res, 'polygon must be an array of at least 3 [lng,lat] points', 400);
  }

  const city = await query('SELECT id FROM service_cities WHERE id = $1', [cityId]);
  if (city.rows.length === 0) return errorResponse(res, 'Invalid city', 400);

  const result = await query(
    `INSERT INTO service_areas (city_id, name, polygon, created_by)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, city_id, name, polygon, is_active, created_at, updated_at`,
    [cityId, name, JSON.stringify(polygon), req.user?.id || null]
  );

  logger.info('Service area created', { cityId, by: req.user?.id });
  createdResponse(res, result.rows[0], 'Service area created');
});

/**
 * Update a service-area polygon.
 * PUT /api/admin/service-areas/:id  { name?, polygon?, is_active? }
 */
export const updateServiceArea = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;

  const { id } = req.params;
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (req.body.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(String(req.body.name).trim().slice(0, 120) || 'Service Area');
  }
  if (req.body.polygon !== undefined) {
    if (!isValidPolygonRing(req.body.polygon)) {
      return errorResponse(res, 'polygon must be an array of at least 3 [lng,lat] points', 400);
    }
    sets.push(`polygon = $${idx++}::jsonb`);
    params.push(JSON.stringify(req.body.polygon));
  }
  if (req.body.is_active !== undefined) {
    sets.push(`is_active = $${idx++}`);
    params.push(req.body.is_active === true || req.body.is_active === 'true');
  }

  if (sets.length === 0) return successResponse(res, null, 'Nothing to update');

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE service_areas SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING id, city_id, name, polygon, is_active, created_at, updated_at`,
    params
  );

  if (result.rows.length === 0) return notFoundResponse(res, 'Service area not found');
  successResponse(res, result.rows[0], 'Service area updated');
});

/**
 * Delete a service-area polygon.
 * DELETE /api/admin/service-areas/:id
 */
export const deleteServiceArea = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;

  const { id } = req.params;
  const result = await query('DELETE FROM service_areas WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return notFoundResponse(res, 'Service area not found');
  successResponse(res, { id }, 'Service area deleted');
});

/**
 * Get the out-of-area popup copy (with defaults applied).
 * GET /api/admin/service-areas/messages
 */
export const getServiceAreaMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;
  const messages = await fetchServiceAreaMessages();
  successResponse(res, messages, 'Service area messages retrieved');
});

/**
 * Update the out-of-area popup copy.
 * PUT /api/admin/service-areas/messages
 */
export const updateServiceAreaMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;

  const userId = req.user?.id;
  const pairs: Array<[string, unknown]> = [
    [SERVICE_AREA_KEYS.title, req.body.title],
    [SERVICE_AREA_KEYS.messageEn, req.body.message_en],
    [SERVICE_AREA_KEYS.messageUr, req.body.message_ur],
    [SERVICE_AREA_KEYS.whatsapp, req.body.whatsapp],
  ];
  for (const [key, value] of pairs) {
    if (value !== undefined) {
      await upsertGlobalSiteSetting(key, String(value).trim().slice(0, 1000), userId);
    }
  }

  const messages = await fetchServiceAreaMessages();
  logger.info('Service area messages updated', { by: userId });
  successResponse(res, messages, 'Service area messages updated');
});
