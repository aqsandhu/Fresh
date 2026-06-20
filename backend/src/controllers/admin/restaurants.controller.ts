// ============================================================================
// ADMIN CONTROLLER — restaurant accounts (review requests + manage approved).
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  createdResponse,
} from '../../utils/response';
import { resolveCityScope, cityIdClause, cityRowInScope, orderInScope } from '../../utils/cityScope';
import { emitOrderUpdate, emitToAdmins } from '../../config/socket';
import { isValidOrderTransition, ORDER_STATUS_TIMESTAMPS, restoreOrderInventory } from '../../utils/orderStatus';
import { upsertGlobalSiteSetting } from '../../utils/siteSettings';
import { placeRestaurantOrder } from '../../utils/restaurantOrders';
import { commitOrderSaleOnDelivery } from '../../utils/systemStock';
import { assignRiderToOrder } from '../../utils/assignRiderToOrder';
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

// ── Restaurant orders (admin) ───────────────────────────────────────────────

/** GET /api/admin/restaurants/orders — restaurant orders only, city-scoped. */
export const getRestaurantOrders = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, { orders: [], counts: {} }, 'Orders');

  const params: any[] = [];
  let where = 'WHERE o.restaurant_id IS NOT NULL AND o.deleted_at IS NULL';
  if (typeof req.query.status === 'string' && req.query.status) {
    params.push(req.query.status);
    where += ` AND o.status = $${params.length}`;
  }
  const cityFilter = cityIdClause(scope, 'o', params, params.length + 1);
  where += cityFilter.sql;

  const result = await query(
    `SELECT o.id, o.order_number, o.status, (o.status = 'pending') AS is_unread,
            o.subtotal, o.delivery_charge, o.total_amount,
            o.payment_status, o.created_at, o.placed_at, o.rider_id,
            rest.business_name AS restaurant_name, rest.phone AS restaurant_phone,
            o.delivery_address_snapshot,
            ru.full_name AS rider_name,
            COALESCE(json_agg(json_build_object(
              'product_name', oi.product_name, 'quantity', oi.quantity, 'unit', oi.unit,
              'quality', oi.quality, 'unit_price', oi.unit_price, 'total_price', oi.total_price
            )) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       JOIN restaurants rest ON rest.id = o.restaurant_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN riders r ON o.rider_id = r.id
       LEFT JOIN users ru ON r.user_id = ru.id
      ${where}
      GROUP BY o.id, rest.business_name, rest.phone, ru.full_name
      ORDER BY o.created_at DESC
      LIMIT 200`,
    params
  );

  // Status counts (same scope).
  const cParams: any[] = [];
  const cCity = cityIdClause(scope, 'o', cParams, 1);
  const counts = await query(
    `SELECT o.status, COUNT(*)::int AS n FROM orders o
      WHERE o.restaurant_id IS NOT NULL AND o.deleted_at IS NULL${cCity.sql}
      GROUP BY o.status`,
    cParams
  );
  const countMap: Record<string, number> = {};
  for (const r of counts.rows) countMap[r.status] = r.n;

  return successResponse(res, { orders: result.rows, counts: countMap }, 'Orders');
});

/** POST /api/admin/restaurants/orders — place a restaurant order on its behalf (WhatsApp entry). */
export const createAdminRestaurantOrder = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const { restaurant_id, items, customer_notes } = req.body;

  if (!restaurant_id) return errorResponse(res, 'Select a restaurant.', 400);

  // City isolation: only an approved restaurant in the admin's scope.
  const r = await query(
    `SELECT id, city_id, status FROM restaurants WHERE id = $1 AND deleted_at IS NULL`,
    [restaurant_id]
  );
  if (r.rows.length === 0) return errorResponse(res, 'Restaurant not found.', 400);
  if (!cityRowInScope(scope, r.rows[0].city_id)) return notFoundResponse(res, 'Restaurant not found');
  if (r.rows[0].status !== 'approved') return errorResponse(res, 'Restaurant is not approved.', 400);

  let order: any;
  let restaurant: any;
  try {
    ({ order, restaurant } = await placeRestaurantOrder(restaurant_id, items, { customerNotes: customer_notes }));
  } catch (err: any) {
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  logger.info('Admin placed restaurant order', { orderId: order.id, restaurantId: restaurant.id, by: req.user?.id });
  emitToAdmins('order:new', {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalAmount: parseFloat(order.total_amount),
    source: 'restaurant',
    message: `New restaurant order #${order.order_number} from ${restaurant.business_name}`,
  });

  return createdResponse(res, order, 'Restaurant order placed');
});

/** PUT /api/admin/restaurants/orders/:id/status — status / rider for a restaurant order. */
export const updateRestaurantOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const { id } = req.params;
  const { status, rider_id } = req.body;

  if (!(await orderInScope(scope, id))) return notFoundResponse(res, 'Order not found');

  // Confirm it's a restaurant order before any mutation.
  const exists = await query(
    `SELECT id FROM orders WHERE id = $1 AND restaurant_id IS NOT NULL AND deleted_at IS NULL`,
    [id]
  );
  if (exists.rows.length === 0) return notFoundResponse(res, 'Restaurant order not found');

  // Rider assignment goes through the SAME shared helper as consumer orders —
  // it validates the rider (verified / active / same city), enforces the status
  // transition, snapshots the per-slot delivery charge, flips the rider to busy
  // and swaps the rider_task, then emits events. Never a bare rider_id write.
  if (rider_id) {
    try {
      const { order } = await assignRiderToOrder(id, rider_id, req.user?.id);
      emitToAdmins('order:status_updated', {
        orderId: id, orderNumber: order.order_number, status: order.status,
        source: 'restaurant', updatedBy: req.user?.id,
      });
      return successResponse(
        res,
        { id: order.id, order_number: order.order_number, status: order.status, rider_id: order.rider_id },
        'Order updated'
      );
    } catch (err: any) {
      if (err?.http === 404) return notFoundResponse(res, err.message);
      if (err?.http === 400) return errorResponse(res, err.message, 400);
      throw err;
    }
  }

  if (!status) return errorResponse(res, 'Nothing to update', 400);

  let updated: any;
  try {
    updated = await withTransaction(async (client) => {
      const cur = await client.query(
        `SELECT id, status, time_slot_id, restaurant_id, stock_reserved, requested_delivery_date
           FROM orders
          WHERE id = $1 AND restaurant_id IS NOT NULL AND deleted_at IS NULL
          FOR UPDATE`,
        [id]
      );
      if (cur.rows.length === 0) {
        throw Object.assign(new Error('Restaurant order not found'), { http: 404 });
      }

      const current = cur.rows[0];
      if (!isValidOrderTransition(current.status, status)) {
        throw Object.assign(
          new Error(`Cannot change status from ${current.status} to ${status}`),
          { http: 400 }
        );
      }
      const sets: string[] = ['updated_at = NOW()', 'status = $1'];
      const params: any[] = [status];
      const tsCol = ORDER_STATUS_TIMESTAMPS[status as keyof typeof ORDER_STATUS_TIMESTAMPS];
      if (tsCol) sets.push(`${tsCol} = NOW()`);

      params.push(id);
      const result = await client.query(
        `UPDATE orders SET ${sets.join(', ')} WHERE id = $${params.length}
          RETURNING id, order_number, status, rider_id`,
        params
      );

      if (status === 'cancelled' && current.status !== 'cancelled') {
        await restoreOrderInventory(client, current);
      }
      if (status === 'delivered' && current.status !== 'delivered') {
        await commitOrderSaleOnDelivery(client, id);
      }

      return result.rows[0];
    });
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  if (!updated) {
    return notFoundResponse(res, 'Restaurant order not found');
  }

  logger.info('Restaurant order updated', { orderId: id, by: req.user?.id, status, rider_id });
  if (status) {
    emitOrderUpdate(id, {
      orderId: id,
      orderNumber: updated.order_number,
      status,
      updatedBy: req.user?.id,
      updatedAt: new Date().toISOString(),
    });
    emitToAdmins('order:status_updated', {
      orderId: id,
      orderNumber: updated.order_number,
      status,
      source: 'restaurant',
      updatedBy: req.user?.id,
    });
  }
  return successResponse(res, updated, 'Order updated');
});

/** GET /api/admin/restaurants/dashboard — restaurant order stats, city-scoped. */
export const getRestaurantDashboard = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, {}, 'Dashboard');

  const params: any[] = [];
  const cCity = cityIdClause(scope, 'o', params, 1);
  const stats = await query(
    `SELECT
       COUNT(*)::int AS total_orders,
       COUNT(*) FILTER (WHERE o.status = 'pending')::int AS pending_orders,
       COUNT(*) FILTER (WHERE o.status = 'delivered')::int AS delivered_orders,
       COUNT(*) FILTER (WHERE DATE(o.created_at) = CURRENT_DATE)::int AS today_orders,
       COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0) AS revenue,
       COALESCE(SUM(o.total_amount) FILTER (WHERE DATE(o.created_at) = CURRENT_DATE), 0) AS today_revenue
     FROM orders o
     WHERE o.restaurant_id IS NOT NULL AND o.deleted_at IS NULL${cCity.sql}`,
    params
  );

  const rParams: any[] = [];
  const rCity = cityIdClause(scope, 'r', rParams, 1);
  const restCount = await query(
    `SELECT
       COUNT(*) FILTER (WHERE r.status = 'approved')::int AS approved_restaurants,
       COUNT(*) FILTER (WHERE r.status = 'pending')::int AS pending_restaurants
     FROM restaurants r WHERE r.deleted_at IS NULL${rCity.sql}`,
    rParams
  );

  return successResponse(res, { ...stats.rows[0], ...restCount.rows[0] }, 'Dashboard');
});

// ── Global restaurant delivery settings (admin Restaurants topbar) ───────────

/** GET /api/admin/restaurants/settings — global restaurant delivery config. */
export const getRestaurantSettings = asyncHandler(async (_req: Request, res: Response) => {
  const s = await query(
    `SELECT key, value FROM site_settings WHERE key IN (
       'restaurant_delivery_base_charge','restaurant_free_delivery_threshold',
       'restaurant_delivery_urgent_charge','restaurant_delivery_urgent_eta',
       'restaurant_slot_cutoff_percent'
     )`
  );
  let base = 100;
  let threshold = 2000;
  let urgentCharge = 0;
  let urgentEta = '';
  let slotCutoff = 60;
  for (const r of s.rows) {
    if (r.key === 'restaurant_delivery_base_charge') base = parseFloat(r.value) || base;
    if (r.key === 'restaurant_free_delivery_threshold') threshold = parseFloat(r.value) || threshold;
    if (r.key === 'restaurant_delivery_urgent_charge') urgentCharge = parseFloat(r.value) || 0;
    if (r.key === 'restaurant_delivery_urgent_eta') urgentEta = String(r.value || '').trim();
    if (r.key === 'restaurant_slot_cutoff_percent') { const n = parseFloat(r.value); if (Number.isFinite(n)) slotCutoff = n; }
  }
  return successResponse(
    res,
    { base_charge: base, free_delivery_threshold: threshold, urgent_charge: urgentCharge, urgent_eta: urgentEta, slot_cutoff_percent: slotCutoff },
    'Settings'
  );
});

/** PUT /api/admin/restaurants/settings — update global restaurant delivery config. */
export const updateRestaurantSettings = asyncHandler(async (req: Request, res: Response) => {
  const { base_charge, free_delivery_threshold, urgent_charge, urgent_eta, slot_cutoff_percent } = req.body;
  const num = (v: unknown, fb: number) => {
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  const entries: [string, string][] = [];
  if (base_charge !== undefined) entries.push(['restaurant_delivery_base_charge', String(num(base_charge, 100))]);
  if (free_delivery_threshold !== undefined) entries.push(['restaurant_free_delivery_threshold', String(num(free_delivery_threshold, 2000))]);
  if (urgent_charge !== undefined) entries.push(['restaurant_delivery_urgent_charge', String(num(urgent_charge, 0))]);
  if (urgent_eta !== undefined) entries.push(['restaurant_delivery_urgent_eta', String(urgent_eta ?? '').slice(0, 120)]);
  if (slot_cutoff_percent !== undefined) entries.push(['restaurant_slot_cutoff_percent', String(Math.min(100, Math.max(0, num(slot_cutoff_percent, 60))))]);

  for (const [key, value] of entries) {
    await upsertGlobalSiteSetting(key, value, req.user?.id);
  }
  logger.info('Restaurant delivery settings updated', { by: req.user?.id });
  return successResponse(res, { updated: entries.length }, 'Settings updated');
});
