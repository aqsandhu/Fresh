// ============================================================================
// TIPS CONTROLLER — admin-managed user guidance tips.
// Public: storefront/app fetch active tips for a page (global + city).
// Admin: city-scoped CRUD; global tips (city_id NULL) are super-admin only.
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  errorResponse,
} from '../utils/response';
import { ensureTipsTable } from '../config/tipsSchema';
import { resolveCityScope, resolvePublicCityId } from '../utils/cityScope';
import logger from '../utils/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

const VALID_PAGES = [
  'checkout', 'orders', 'order_detail', 'track', 'support',
  'complaint', 'reviews', 'product', 'home', 'cart',
  // Inline checkout auth + shop listing tips.
  'shop', 'login', 'signup',
];

interface TipRow {
  id: string;
  city_id: string | null;
  page: string;
  text_ur: string;
  priority: number;
  is_active: boolean;
  is_seed: boolean;
  created_at: string;
  city_name?: string | null;
}

function mapTip(r: TipRow) {
  return {
    id: r.id,
    cityId: r.city_id,
    cityName: r.city_name ?? null,
    page: r.page,
    textUr: r.text_ur,
    priority: r.priority,
    isActive: r.is_active,
    isSeed: r.is_seed,
    createdAt: r.created_at,
  };
}

// ============================================================================
// PUBLIC
// ============================================================================

/**
 * GET /api/tips?page=checkout&city_id=...
 * Active tips for a page: the city's tips + global tips, highest priority first.
 */
export const getPublicTips = asyncHandler(async (req: Request, res: Response) => {
  const page = String(req.query.page ?? '').trim();
  if (!page) return successResponse(res, [], 'No tips');
  if (!(await ensureTipsTable())) return successResponse(res, [], 'Tips unavailable');

  const cityId = await resolvePublicCityId(req).catch(() => null);

  const params: unknown[] = [page];
  let cityClause = 'city_id IS NULL';
  if (cityId) {
    params.push(cityId);
    cityClause = `(city_id IS NULL OR city_id = $${params.length})`;
  }

  const result = await query(
    `SELECT id, text_ur FROM user_tips
      WHERE page = $1 AND is_active = TRUE AND ${cityClause}
      ORDER BY priority DESC, created_at ASC
      LIMIT 20`,
    params
  );

  return successResponse(
    res,
    result.rows.map((r) => ({ id: r.id, text: r.text_ur })),
    'Tips'
  );
});

// ============================================================================
// ADMIN
// ============================================================================

/** GET /api/admin/tips — tips this admin can see (their city + global). */
export const listTips = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureTipsTable())) return successResponse(res, [], 'Tips unavailable');
  const scope = await resolveCityScope(req);

  const params: unknown[] = [];
  let where = '1=1';
  if (!scope.unrestricted && scope.cityId) {
    params.push(scope.cityId);
    where = `(t.city_id = $${params.length} OR t.city_id IS NULL)`;
  } else if (scope.cityId) {
    params.push(scope.cityId);
    where = `(t.city_id = $${params.length} OR t.city_id IS NULL)`;
  }

  const result = await query(
    `SELECT t.*, sc.name AS city_name
       FROM user_tips t
       LEFT JOIN service_cities sc ON sc.id = t.city_id
      WHERE ${where}
      ORDER BY t.page ASC, t.priority DESC, t.created_at ASC`,
    params
  );
  return successResponse(res, result.rows.map(mapTip), 'Tips retrieved');
});

/** POST /api/admin/tips — body { page, textUr, priority?, cityId? } */
export const createTip = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureTipsTable())) return errorResponse(res, 'Tips are not available yet.', 503);
  const scope = await resolveCityScope(req);

  const page = String(req.body.page ?? '').trim();
  if (!VALID_PAGES.includes(page)) return errorResponse(res, 'Invalid page.', 400);

  const textUr = String(req.body.textUr ?? req.body.text_ur ?? '').trim();
  if (textUr.length < 3) return errorResponse(res, 'Tip text is too short.', 400);
  if (textUr.length > 1000) return errorResponse(res, 'Tip text is too long.', 400);

  const priority = Number.isFinite(Number(req.body.priority)) ? parseInt(String(req.body.priority), 10) : 0;

  // City resolution. Only super admins may create global (NULL) tips; they can
  // target the selected city or pass cityId explicitly ('' / null = global).
  // City admins are always pinned to their own assigned city.
  const isSuper = req.user?.role === 'super_admin';
  let cityId: string | null;
  if (isSuper) {
    const rawCity = req.body.cityId ?? req.body.city_id;
    if (rawCity !== undefined) {
      cityId = rawCity ? String(rawCity) : null;
    } else {
      cityId = scope.cityId ?? null;
    }
    if (cityId && !isUuid(cityId)) return errorResponse(res, 'Invalid city.', 400);
  } else {
    cityId = scope.cityId;
    if (!cityId) return errorResponse(res, 'Your admin account is not assigned to a city.', 403);
  }

  const result = await query(
    `INSERT INTO user_tips (city_id, page, text_ur, priority, is_active, is_seed, created_by)
     VALUES ($1, $2, $3, $4, TRUE, FALSE, $5) RETURNING *`,
    [cityId, page, textUr, priority, req.user?.id ?? null]
  );
  logger.info('Tip created', { tipId: result.rows[0].id, page, cityId, by: req.user?.id });
  return createdResponse(res, mapTip(result.rows[0]), 'Tip created');
});

/** Load a tip and verify the admin may manage it. Returns the row or null. */
async function loadManageableTip(req: Request, id: string) {
  const scope = await resolveCityScope(req);
  const existing = await query('SELECT * FROM user_tips WHERE id = $1', [id]);
  const tip = existing.rows[0] as TipRow | undefined;
  if (!tip) return { tip: null, error: 'not_found' as const };
  // Super admins manage everything (global + any city). City admins may only
  // manage their OWN city's tips — never global, never another city.
  const isSuper = req.user?.role === 'super_admin';
  if (!isSuper) {
    if (tip.city_id === null) return { tip: null, error: 'forbidden_global' as const };
    if (tip.city_id !== scope.cityId) return { tip: null, error: 'forbidden_city' as const };
  }
  return { tip, error: null };
}

/** PUT /api/admin/tips/:id — body { textUr?, priority?, isActive? } */
export const updateTip = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureTipsTable())) return notFoundResponse(res, 'Tip not found');
  const { id } = req.params;
  if (!isUuid(id)) return notFoundResponse(res, 'Tip not found');

  const { tip, error } = await loadManageableTip(req, id);
  if (error === 'not_found') return notFoundResponse(res, 'Tip not found');
  if (error) return errorResponse(res, 'You cannot manage this tip.', 403);

  const sets: string[] = [];
  const params: unknown[] = [];

  if (req.body.textUr !== undefined || req.body.text_ur !== undefined) {
    const t = String(req.body.textUr ?? req.body.text_ur ?? '').trim();
    if (t.length < 3 || t.length > 1000) return errorResponse(res, 'Invalid tip text.', 400);
    params.push(t);
    sets.push(`text_ur = $${params.length}`);
  }
  if (req.body.priority !== undefined) {
    const p = parseInt(String(req.body.priority), 10);
    if (!Number.isFinite(p)) return errorResponse(res, 'Invalid priority.', 400);
    params.push(p);
    sets.push(`priority = $${params.length}`);
  }
  if (req.body.isActive !== undefined || req.body.is_active !== undefined) {
    const v = req.body.isActive ?? req.body.is_active;
    params.push(v === true || v === 'true');
    sets.push(`is_active = $${params.length}`);
  }
  if (sets.length === 0) return errorResponse(res, 'Nothing to update.', 400);

  sets.push('updated_at = NOW()');
  params.push(tip!.id);
  const result = await query(
    `UPDATE user_tips SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  logger.info('Tip updated', { tipId: id, by: req.user?.id });
  return successResponse(res, mapTip(result.rows[0]), 'Tip updated');
});

/** DELETE /api/admin/tips/:id */
export const deleteTip = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureTipsTable())) return notFoundResponse(res, 'Tip not found');
  const { id } = req.params;
  if (!isUuid(id)) return notFoundResponse(res, 'Tip not found');

  const { tip, error } = await loadManageableTip(req, id);
  if (error === 'not_found') return notFoundResponse(res, 'Tip not found');
  if (error) return errorResponse(res, 'You cannot manage this tip.', 403);

  await query('DELETE FROM user_tips WHERE id = $1', [tip!.id]);
  logger.info('Tip deleted', { tipId: id, by: req.user?.id });
  return successResponse(res, { id }, 'Tip deleted');
});
