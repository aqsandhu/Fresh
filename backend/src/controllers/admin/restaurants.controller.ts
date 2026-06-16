// ============================================================================
// ADMIN CONTROLLER — restaurant accounts (review requests + manage approved).
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
} from '../../utils/response';
import { resolveCityScope, cityIdClause, cityRowInScope } from '../../utils/cityScope';
import { emitToAdmins } from '../../config/socket';
import logger from '../../utils/logger';

const RESTAURANT_PUBLIC_COLUMNS = `
  r.id, r.business_name, r.owner_name, r.phone, r.email, r.address,
  r.city, r.city_id, r.status, r.free_delivery_threshold, r.delivery_base_charge,
  r.admin_notes, r.approved_at, r.last_login_at, r.login_count,
  r.created_at, r.updated_at
`;

/**
 * GET /api/admin/restaurants?status=pending|approved|disabled|banned|all
 * City-scoped list of restaurant accounts.
 */
export const getRestaurants = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, { restaurants: [], counts: {} }, 'Restaurants');

  const status = String(req.query.status || 'all');
  const params: any[] = [];
  let where = 'WHERE r.deleted_at IS NULL';

  if (['pending', 'approved', 'disabled', 'banned'].includes(status)) {
    params.push(status);
    where += ` AND r.status = $${params.length}`;
  }

  const cityFilter = cityIdClause(scope, 'r', params, params.length + 1);
  where += cityFilter.sql;

  const result = await query(
    `SELECT ${RESTAURANT_PUBLIC_COLUMNS},
            sc.name AS city_name
       FROM restaurants r
       LEFT JOIN service_cities sc ON sc.id = r.city_id
       ${where}
      ORDER BY r.created_at DESC`,
    params
  );

  // Tab counts (pending vs approved) within the same city scope.
  const countParams: any[] = [];
  const countCity = cityIdClause(scope, 'r', countParams, 1);
  const counts = await query(
    `SELECT r.status, COUNT(*)::int AS n
       FROM restaurants r
      WHERE r.deleted_at IS NULL${countCity.sql}
      GROUP BY r.status`,
    countParams
  );
  const countMap: Record<string, number> = {};
  for (const row of counts.rows) countMap[row.status] = row.n;

  return successResponse(res, { restaurants: result.rows, counts: countMap }, 'Restaurants');
});

/** Load + city-scope-check a restaurant by id. Returns the row or null. */
async function loadInScope(req: Request, id: string) {
  const scope = await resolveCityScope(req);
  const r = await query(`SELECT * FROM restaurants WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!r.rows[0]) return { row: null, ok: false };
  if (!cityRowInScope(scope, r.rows[0].city_id)) return { row: r.rows[0], ok: false };
  return { row: r.rows[0], ok: true };
}

/** Shared status transition (approve / disable / ban). */
async function setStatus(
  req: Request,
  res: Response,
  id: string,
  next: 'approved' | 'disabled' | 'banned'
) {
  const { row, ok } = await loadInScope(req, id);
  if (!row || !ok) return notFoundResponse(res, 'Restaurant not found');

  const approving = next === 'approved';
  const result = await query(
    `UPDATE restaurants
        SET status = $1,
            approved_by = CASE WHEN $2 THEN $3 ELSE approved_by END,
            approved_at = CASE WHEN $2 AND approved_at IS NULL THEN NOW() ELSE approved_at END,
            updated_at = NOW()
      WHERE id = $4
      RETURNING id, business_name, status`,
    [next, approving, req.user?.id ?? null, id]
  );

  logger.info('Restaurant status changed', { restaurantId: id, status: next, by: req.user?.id });
  if (approving) {
    emitToAdmins('restaurant:approved', { restaurantId: id, businessName: row.business_name });
  }
  return successResponse(res, result.rows[0], `Restaurant ${next}`);
}

export const approveRestaurant = asyncHandler((req, res) => setStatus(req, res, req.params.id, 'approved'));
export const disableRestaurant = asyncHandler((req, res) => setStatus(req, res, req.params.id, 'disabled'));
export const banRestaurant = asyncHandler((req, res) => setStatus(req, res, req.params.id, 'banned'));

/** DELETE /api/admin/restaurants/:id — soft remove. */
export const removeRestaurant = asyncHandler(async (req: Request, res: Response) => {
  const { row, ok } = await loadInScope(req, req.params.id);
  if (!row || !ok) return notFoundResponse(res, 'Restaurant not found');

  await query(`UPDATE restaurants SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.id]);
  logger.info('Restaurant removed', { restaurantId: req.params.id, by: req.user?.id });
  return successResponse(res, { id: req.params.id }, 'Restaurant removed');
});

/**
 * PUT /api/admin/restaurants/:id — edit notes + per-restaurant delivery overrides.
 */
export const updateRestaurant = asyncHandler(async (req: Request, res: Response) => {
  const { row, ok } = await loadInScope(req, req.params.id);
  if (!row || !ok) return notFoundResponse(res, 'Restaurant not found');

  const { admin_notes, free_delivery_threshold, delivery_base_charge } = req.body;

  const num = (v: unknown): number | null => {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const result = await query(
    `UPDATE restaurants
        SET admin_notes = COALESCE($1, admin_notes),
            free_delivery_threshold = $2,
            delivery_base_charge = $3,
            updated_at = NOW()
      WHERE id = $4
      RETURNING ${RESTAURANT_PUBLIC_COLUMNS.replace(/r\./g, '')}`,
    [
      admin_notes === undefined ? null : admin_notes,
      num(free_delivery_threshold),
      num(delivery_base_charge),
      req.params.id,
    ]
  );

  logger.info('Restaurant updated', { restaurantId: req.params.id, by: req.user?.id });
  return successResponse(res, result.rows[0], 'Restaurant updated');
});
