// ============================================================================
// ADMIN COUPON CONTROLLER — city-scoped CRUD for discount coupons.
// City admins manage their own city's coupons; the super admin manages any
// city (or a global coupon when no city is selected).
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
import { resolveCityScope, resolvePublicCityId } from '../utils/cityScope';
import { buildCouponSummary, CouponRow, DiscountType, TriggerType } from '../utils/coupons';
import { evaluateAutoCoupons, hasUserCouponsTable } from '../utils/autoCoupons';
import logger from '../utils/logger';

const DISCOUNT_TYPES: DiscountType[] = ['percentage', 'fixed', 'free_delivery'];
const TRIGGER_TYPES: TriggerType[] = ['manual', 'welcome_back', 'order_milestone'];

interface ParsedCoupon {
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_order_amount: number;
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  first_order_only: boolean;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  trigger_type: TriggerType;
  inactivity_days: number | null;
  milestone_orders: number | null;
  auto_reusable: boolean;
}

function toIntOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toDateOrNull(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Validate + normalise a coupon payload. Returns either the parsed value or an error string. */
function parseCouponBody(body: Record<string, unknown>): ParsedCoupon | string {
  const rawCode = String(body.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(rawCode)) {
    return 'Code must be 2–50 characters: letters, numbers, dashes or underscores.';
  }

  const discountType = String(body.discount_type ?? 'percentage') as DiscountType;
  if (!DISCOUNT_TYPES.includes(discountType)) {
    return 'Invalid discount type.';
  }

  let discountValue = toNumberOrNull(body.discount_value) ?? 0;
  if (discountType === 'percentage') {
    if (discountValue <= 0 || discountValue > 100) {
      return 'Percentage must be between 1 and 100.';
    }
  } else if (discountType === 'fixed') {
    if (discountValue <= 0) return 'Fixed discount amount must be greater than 0.';
  } else {
    discountValue = 0; // free_delivery carries no value
  }

  const maxDiscount =
    discountType === 'percentage' ? toNumberOrNull(body.max_discount_amount) : null;
  const minOrder = toNumberOrNull(body.min_order_amount) ?? 0;

  const validFrom = toDateOrNull(body.valid_from);
  const validUntil = toDateOrNull(body.valid_until);
  if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
    return 'Valid-from date must be before valid-until date.';
  }

  const triggerType = String(body.trigger_type ?? 'manual') as TriggerType;
  if (!TRIGGER_TYPES.includes(triggerType)) {
    return 'Invalid coupon trigger type.';
  }

  let inactivityDays: number | null = null;
  let milestoneOrders: number | null = null;
  if (triggerType === 'welcome_back') {
    inactivityDays = toIntOrNull(body.inactivity_days);
    if (inactivityDays == null || inactivityDays < 1) {
      return 'Welcome-back coupons need an inactivity period of at least 1 day.';
    }
  } else if (triggerType === 'order_milestone') {
    milestoneOrders = toIntOrNull(body.milestone_orders);
    if (milestoneOrders == null || milestoneOrders < 1) {
      return 'Milestone coupons need an order count of at least 1.';
    }
  }

  return {
    code: rawCode,
    description:
      body.description != null && String(body.description).trim() !== ''
        ? String(body.description).trim()
        : null,
    discount_type: discountType,
    discount_value: discountValue,
    max_discount_amount: maxDiscount,
    min_order_amount: minOrder,
    usage_limit: toIntOrNull(body.usage_limit),
    usage_limit_per_user: toIntOrNull(body.usage_limit_per_user),
    first_order_only: body.first_order_only === true || body.first_order_only === 'true',
    valid_from: validFrom,
    valid_until: validUntil,
    is_active: body.is_active === undefined ? true : body.is_active === true || body.is_active === 'true',
    trigger_type: triggerType,
    inactivity_days: inactivityDays,
    milestone_orders: milestoneOrders,
    auto_reusable: body.auto_reusable === true || body.auto_reusable === 'true',
  };
}

function withSummary(row: CouponRow): Record<string, unknown> {
  return { ...row, summary: buildCouponSummary(row) };
}

/**
 * GET /api/admin/coupons/redemptions
 * Used-coupon ledger for the "Coupons Used" report. Filters: date range,
 * discount_type, coupon_id. Returns the redemption rows + the total discount
 * given for the filtered set. City-scoped like the coupon list.
 */
export const listCouponRedemptions = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);

  const where: string[] = ['1=1'];
  const params: unknown[] = [];

  if (!scope.unrestricted && scope.cityId) {
    params.push(scope.cityId);
    where.push(`(c.city_id = $${params.length} OR c.city_id IS NULL)`);
  } else if (scope.cityId) {
    params.push(scope.cityId);
    where.push(`(c.city_id = $${params.length} OR c.city_id IS NULL)`);
  }

  const { date_from, date_to, discount_type, coupon_id } = req.query;

  if (typeof date_from === 'string' && date_from) {
    params.push(date_from);
    where.push(`cr.created_at >= $${params.length}::date`);
  }
  if (typeof date_to === 'string' && date_to) {
    params.push(date_to);
    // inclusive of the whole end day
    where.push(`cr.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  if (
    typeof discount_type === 'string' &&
    ['percentage', 'fixed', 'free_delivery'].includes(discount_type)
  ) {
    params.push(discount_type);
    where.push(`c.discount_type = $${params.length}`);
  }
  if (typeof coupon_id === 'string' && coupon_id) {
    params.push(coupon_id);
    where.push(`cr.coupon_id = $${params.length}::uuid`);
  }

  const whereSql = where.join(' AND ');

  const [rowsResult, totalResult] = await Promise.all([
    query(
      `SELECT cr.id, cr.discount_amount, cr.created_at,
              c.id AS coupon_id, c.code AS coupon_code, c.discount_type,
              sc.name AS city_name,
              u.full_name AS customer_name, u.phone AS customer_phone,
              o.id AS order_id, o.order_number
         FROM coupon_redemptions cr
         JOIN coupons c ON c.id = cr.coupon_id
         LEFT JOIN service_cities sc ON sc.id = c.city_id
         LEFT JOIN users u ON u.id = cr.user_id
         LEFT JOIN orders o ON o.id = cr.order_id
        WHERE ${whereSql}
        ORDER BY cr.created_at DESC
        LIMIT 1000`,
      params
    ),
    query(
      `SELECT COALESCE(SUM(cr.discount_amount), 0) AS total_discount, COUNT(*) AS count
         FROM coupon_redemptions cr
         JOIN coupons c ON c.id = cr.coupon_id
        WHERE ${whereSql}`,
      params
    ),
  ]);

  successResponse(
    res,
    {
      redemptions: rowsResult.rows,
      total_discount: parseFloat(totalResult.rows[0]?.total_discount || '0'),
      count: parseInt(totalResult.rows[0]?.count || '0', 10),
    },
    'Coupon redemptions retrieved'
  );
});

/**
 * GET /api/admin/coupons
 * Scoped admins see their city + global coupons; super admin sees all (or the
 * selected city + global when a city is chosen in the header).
 */
export const listCoupons = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);

  let whereSql = '';
  const params: unknown[] = [];
  if (!scope.unrestricted && scope.cityId) {
    whereSql = 'WHERE (c.city_id = $1 OR c.city_id IS NULL)';
    params.push(scope.cityId);
  } else if (scope.cityId) {
    // Super admin with a city selected.
    whereSql = 'WHERE (c.city_id = $1 OR c.city_id IS NULL)';
    params.push(scope.cityId);
  }

  const result = await query(
    `SELECT c.*, sc.name AS city_name,
            (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS redemption_count
       FROM coupons c
       LEFT JOIN service_cities sc ON sc.id = c.city_id
       ${whereSql}
      ORDER BY c.created_at DESC`,
    params
  );

  successResponse(
    res,
    result.rows.map((r) => withSummary(r as CouponRow)),
    'Coupons retrieved'
  );
});

/**
 * POST /api/admin/coupons
 * city_id is taken from the admin's scope: scoped admin → their city; super
 * admin → the selected city, or a global coupon when no city is selected.
 */
export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  const parsed = parseCouponBody(req.body as Record<string, unknown>);
  if (typeof parsed === 'string') return errorResponse(res, parsed, 400);

  const scope = await resolveCityScope(req);
  // Scoped (non-super) admins MUST have a city; super admins may create a
  // global coupon (city_id NULL) when no city is selected.
  const cityId = scope.unrestricted ? scope.cityId ?? null : scope.cityId;
  if (!scope.unrestricted && !cityId) {
    return errorResponse(res, 'Your admin account is not assigned to a city.', 403);
  }

  // Auto-coupon columns only exist after migration 22. Gate so manual coupons
  // still work pre-migration; reject auto types until it's applied.
  const autoReady = await hasUserCouponsTable();
  if (!autoReady && parsed.trigger_type !== 'manual') {
    return errorResponse(
      res,
      'Automatic coupons are not available yet — database migration pending.',
      503
    );
  }

  try {
    const result = autoReady
      ? await query(
          `INSERT INTO coupons (
            code, description, discount_type, discount_value, max_discount_amount,
            min_order_amount, usage_limit, usage_limit_per_user, first_order_only,
            valid_from, valid_until, is_active, city_id, created_by,
            trigger_type, inactivity_days, milestone_orders, auto_reusable
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          RETURNING *`,
          [
            parsed.code, parsed.description, parsed.discount_type, parsed.discount_value,
            parsed.max_discount_amount, parsed.min_order_amount, parsed.usage_limit,
            parsed.usage_limit_per_user, parsed.first_order_only, parsed.valid_from,
            parsed.valid_until, parsed.is_active, cityId, req.user?.id ?? null,
            parsed.trigger_type, parsed.inactivity_days, parsed.milestone_orders, parsed.auto_reusable,
          ]
        )
      : await query(
          `INSERT INTO coupons (
            code, description, discount_type, discount_value, max_discount_amount,
            min_order_amount, usage_limit, usage_limit_per_user, first_order_only,
            valid_from, valid_until, is_active, city_id, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          RETURNING *`,
          [
            parsed.code, parsed.description, parsed.discount_type, parsed.discount_value,
            parsed.max_discount_amount, parsed.min_order_amount, parsed.usage_limit,
            parsed.usage_limit_per_user, parsed.first_order_only, parsed.valid_from,
            parsed.valid_until, parsed.is_active, cityId, req.user?.id ?? null,
          ]
        );

    logger.info('Coupon created', {
      couponId: result.rows[0].id,
      code: parsed.code,
      cityId,
      createdBy: req.user?.id,
    });
    return createdResponse(res, withSummary(result.rows[0] as CouponRow), 'Coupon created');
  } catch (err: any) {
    if (err?.code === '23505') {
      return errorResponse(res, 'A coupon with this code already exists for this city.', 409);
    }
    throw err;
  }
});

/** PUT /api/admin/coupons/:id */
export const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);

  const existing = await query('SELECT * FROM coupons WHERE id = $1', [id]);
  if (existing.rows.length === 0) return notFoundResponse(res, 'Coupon not found');

  // A scoped admin can only edit coupons in their own city (not global ones).
  const row = existing.rows[0];
  if (!scope.unrestricted && row.city_id !== scope.cityId) {
    return errorResponse(res, 'You can only edit coupons for your assigned city.', 403);
  }

  const parsed = parseCouponBody(req.body as Record<string, unknown>);
  if (typeof parsed === 'string') return errorResponse(res, parsed, 400);

  const autoReady = await hasUserCouponsTable();
  if (!autoReady && parsed.trigger_type !== 'manual') {
    return errorResponse(
      res,
      'Automatic coupons are not available yet — database migration pending.',
      503
    );
  }

  try {
    const result = autoReady
      ? await query(
          `UPDATE coupons SET
             code = $1, description = $2, discount_type = $3, discount_value = $4,
             max_discount_amount = $5, min_order_amount = $6, usage_limit = $7,
             usage_limit_per_user = $8, first_order_only = $9, valid_from = $10,
             valid_until = $11, is_active = $12,
             trigger_type = $14, inactivity_days = $15, milestone_orders = $16,
             auto_reusable = $17, updated_at = NOW()
           WHERE id = $13
           RETURNING *`,
          [
            parsed.code, parsed.description, parsed.discount_type, parsed.discount_value,
            parsed.max_discount_amount, parsed.min_order_amount, parsed.usage_limit,
            parsed.usage_limit_per_user, parsed.first_order_only, parsed.valid_from,
            parsed.valid_until, parsed.is_active, id,
            parsed.trigger_type, parsed.inactivity_days, parsed.milestone_orders, parsed.auto_reusable,
          ]
        )
      : await query(
          `UPDATE coupons SET
             code = $1, description = $2, discount_type = $3, discount_value = $4,
             max_discount_amount = $5, min_order_amount = $6, usage_limit = $7,
             usage_limit_per_user = $8, first_order_only = $9, valid_from = $10,
             valid_until = $11, is_active = $12, updated_at = NOW()
           WHERE id = $13
           RETURNING *`,
          [
            parsed.code, parsed.description, parsed.discount_type, parsed.discount_value,
            parsed.max_discount_amount, parsed.min_order_amount, parsed.usage_limit,
            parsed.usage_limit_per_user, parsed.first_order_only, parsed.valid_from,
            parsed.valid_until, parsed.is_active, id,
          ]
        );
    logger.info('Coupon updated', { couponId: id, updatedBy: req.user?.id });
    return successResponse(res, withSummary(result.rows[0] as CouponRow), 'Coupon updated');
  } catch (err: any) {
    if (err?.code === '23505') {
      return errorResponse(res, 'A coupon with this code already exists for this city.', 409);
    }
    throw err;
  }
});

/** PATCH /api/admin/coupons/:id/toggle */
export const toggleCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);

  const existing = await query('SELECT city_id FROM coupons WHERE id = $1', [id]);
  if (existing.rows.length === 0) return notFoundResponse(res, 'Coupon not found');
  if (!scope.unrestricted && existing.rows[0].city_id !== scope.cityId) {
    return errorResponse(res, 'You can only manage coupons for your assigned city.', 403);
  }

  const result = await query(
    `UPDATE coupons SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
    [id]
  );
  return successResponse(res, withSummary(result.rows[0] as CouponRow), 'Coupon updated');
});

/** DELETE /api/admin/coupons/:id */
export const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);

  const existing = await query('SELECT city_id FROM coupons WHERE id = $1', [id]);
  if (existing.rows.length === 0) return notFoundResponse(res, 'Coupon not found');
  if (!scope.unrestricted && existing.rows[0].city_id !== scope.cityId) {
    return errorResponse(res, 'You can only delete coupons for your assigned city.', 403);
  }

  await query('DELETE FROM coupons WHERE id = $1', [id]);
  logger.info('Coupon deleted', { couponId: id, deletedBy: req.user?.id });
  return successResponse(res, { id }, 'Coupon deleted');
});

// ============================================================================
// CUSTOMER-FACING — "My Coupons" (granted auto coupons)
// ============================================================================

/**
 * GET /api/coupons/mine
 * Evaluates welcome-back + milestone eligibility (granting any newly earned
 * coupon), then returns the customer's available coupons. `unseen` powers the
 * one-time login popup.
 */
export const getMyCoupons = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  if (!(await hasUserCouponsTable())) {
    return successResponse(res, { coupons: [], unseen: [] }, 'No coupons');
  }

  const cityId = await resolvePublicCityId(req);
  await evaluateAutoCoupons(req.user.id, cityId);

  const result = await query(
    `SELECT uc.id AS grant_id, uc.status, uc.seen_at, uc.source AS grant_source, c.*
       FROM user_coupons uc
       JOIN coupons c ON c.id = uc.coupon_id
      WHERE uc.user_id = $1
        AND uc.status = 'available'
        AND c.is_active = TRUE
        AND (c.valid_until IS NULL OR c.valid_until >= NOW())
      ORDER BY uc.granted_at DESC`,
    [req.user.id]
  );

  const coupons = result.rows.map((r) => ({
    code: r.code,
    description: r.description,
    discount_type: r.discount_type,
    min_order_amount: Number(r.min_order_amount),
    trigger_type: r.trigger_type,
    source: r.grant_source,
    seen: r.seen_at != null,
    summary: buildCouponSummary(r as CouponRow),
  }));

  return successResponse(
    res,
    { coupons, unseen: coupons.filter((c) => !c.seen) },
    'My coupons'
  );
});

/**
 * PATCH /api/coupons/mine/seen
 * Marks the customer's available coupons as seen so the login popup shows once.
 */
export const markMyCouponsSeen = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  if (!(await hasUserCouponsTable())) return successResponse(res, null, 'OK');

  await query(
    `UPDATE user_coupons SET seen_at = NOW()
      WHERE user_id = $1 AND status = 'available' AND seen_at IS NULL`,
    [req.user.id]
  );
  return successResponse(res, null, 'Marked seen');
});
