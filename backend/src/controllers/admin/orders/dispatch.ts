// Rider / OCP assignment, phone visibility, return to store — moved from orders.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../../utils/caughtError';
import { Request, Response } from 'express';
import { query, withTransaction } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../../utils/response';
import { emitOrderUpdate, emitOrderEventToAdmins } from '../../../config/socket';
import logger from '../../../utils/logger';
import { resolveCityScope, orderInScope } from '../../../utils/cityScope';
import { assignRiderToOrder } from '../../../utils/assignRiderToOrder';
import { syncRiderAvailability } from '../../../utils/riderAvailability';
import { notifyActiveRiderOfOrderChange } from '../../../utils/riderTaskEvents';

export const togglePhoneVisibility = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { show_customer_phone } = req.body;

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  const result = await query(
    `UPDATE orders SET show_customer_phone = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
    [show_customer_phone, id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  logger.info('Phone visibility toggled', { orderId: id, show: show_customer_phone, updatedBy: req.user?.id });
  notifyActiveRiderOfOrderChange(id, {
    message: show_customer_phone ? 'Customer phone is now visible to you' : 'Customer phone was hidden by the admin',
  }).catch(() => {});

  successResponse(res, result.rows[0], 'Phone visibility updated successfully');
});

/**
 * Bring a failed delivery back to the store.
 * POST /api/admin/orders/:id/return-to-store   Body: { reason? }
 *
 * An order cannot be cancelled while it is out for delivery (the rider is on
 * the road). When the rider reports a problem (customer unreachable, refused,
 * wrong address…) his task ends as `failed` but the order stays
 * out_for_delivery with him as rider — a dead end. This moves it back to
 * ready_for_pickup and detaches the rider, so the admin can re-dispatch it or
 * cancel it. Refused while any rider task on the order is still live.
 */
export const returnOrderToStore = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) return notFoundResponse(res, 'Order not found');

  let out: { order: any; previousRiderId: string | null } | null = null;
  try {
    out = await withTransaction(async (client) => {
      const o = await client.query(
        `SELECT id, order_number, status, rider_id, user_id FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      if (o.rows.length === 0) throw Object.assign(new Error('Order not found'), { http: 404 });
      const order = o.rows[0];
      if (order.status !== 'out_for_delivery') {
        throw Object.assign(new Error(`Only an out-for-delivery order can be returned (this one is ${order.status}).`), { http: 409 });
      }
      const live = await client.query(
        `SELECT COUNT(*)::int AS n FROM rider_tasks WHERE order_id = $1 AND status IN ('assigned', 'in_progress')`,
        [id]
      );
      if (Number(live.rows[0]?.n || 0) > 0) {
        throw Object.assign(
          new Error('A rider is still working on this order. Wait for the rider to report the problem, or reassign it.'),
          { http: 409 }
        );
      }
      const upd = await client.query(
        `UPDATE orders
            SET status = 'ready_for_pickup', rider_id = NULL, rider_delivery_charge = 0,
                admin_notes = CONCAT_WS(E'\n', NULLIF(admin_notes, ''), $2::text),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, `Returned to store${reason ? `: ${reason}` : ''} (${new Date().toISOString()})`]
      );
      await syncRiderAvailability(order.rider_id, client);
      return { order: upd.rows[0], previousRiderId: order.rider_id };
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 409) return errorResponse(res, err.message, 409);
    // admin_notes is optional on very old schemas — retry without it.
    if (err?.code === '42703') {
      return errorResponse(res, 'Database is missing orders.admin_notes — run migrations.', 500);
    }
    throw err;
  }

  const order = out!.order;
  emitOrderUpdate(id, { orderId: id, status: 'ready_for_pickup', message: `Order #${order.order_number} returned to store` });
  emitOrderEventToAdmins(id, 'order:status_updated', { orderId: id, orderNumber: order.order_number, status: 'ready_for_pickup', updatedBy: req.user?.id });
  logger.info('Order returned to store after failed delivery', { orderId: id, previousRiderId: out!.previousRiderId, by: req.user?.id });
  successResponse(res, order, 'Order returned to store — assign a new rider or cancel it');
});

/**
 * Assign rider to order
 * PUT /api/admin/orders/:id/assign-rider
 */

export const assignRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { rider_id } = req.body;

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  try {
    const { order, rider } = await assignRiderToOrder(id, rider_id, req.user?.id);
    // No per-order pay is set for this rider (no slot rate, no urgent rate, no
    // earlier rate to fall back on): the delivery is recorded at Rs 0. Say so —
    // it used to happen silently and showed up only at settlement time.
    const riderPay = parseFloat(String(order?.rider_delivery_charge ?? '0')) || 0;
    const payWarning = riderPay > 0
      ? null
      : `${rider?.name || 'This rider'} has no per-order pay set, so this delivery is recorded at Rs 0. Set it under Riders → Delivery pay.`;
    successResponse(res, { order, rider, rider_pay: riderPay, pay_warning: payWarning }, 'Rider assigned successfully');
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 404) return notFoundResponse(res, err.message || 'Order not found');
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }
});

/**
 * Assign an order to an Order Collection Point (alternative to a direct rider).
 * PATCH /api/admin/orders/:id/assign-ocp   Body: { ocp_id }
 * The OCP then assigns a rider + collects payment. Pass ocp_id = null to unassign.
 */
export const assignOrderToOcp = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { ocp_id } = req.body;

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  if (!ocp_id) {
    // Unassigning silently dropped cash the OCP had already collected (the
    // settlement query keys on ocp_id) and orphaned a rider the OCP assigned.
    // Refuse in those states; the order must be settled / reassigned first.
    const cur = await query(
      `SELECT ocp_id, rider_id, status, payment_status, paid_amount
         FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (cur.rows.length === 0) return notFoundResponse(res, 'Order not found');
    const o = cur.rows[0];
    if (!o.ocp_id) return successResponse(res, { id, ocp_id: null }, 'Order is not assigned to an OCP');
    if (['delivered', 'refunded'].includes(o.status)) {
      return errorResponse(res, `Cannot unassign a ${o.status} order from its OCP`, 409);
    }
    if (o.payment_status === 'completed' && (parseFloat(String(o.paid_amount ?? '0')) || 0) > 0) {
      return errorResponse(res, 'The OCP has already collected cash for this order; settle it instead of unassigning', 409);
    }
    if (o.rider_id) {
      return errorResponse(res, 'Unassign the rider first — this order is already out with an OCP rider', 409);
    }
    const cleared = await query(
      `UPDATE orders SET ocp_id = NULL, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (cleared.rows.length === 0) return notFoundResponse(res, 'Order not found');
    return successResponse(res, { id, ocp_id: null }, 'Order unassigned from OCP');
  }

  // The OCP must be active and in the SAME city as the order (city isolation).
  const result = await withTransaction(async (client) => {
    const ord = await client.query(
      `SELECT id, city_id, status FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (ord.rows.length === 0) throw Object.assign(new Error('Order not found'), { http: 404 });
    if (['delivered', 'cancelled', 'refunded'].includes(ord.rows[0].status)) {
      throw Object.assign(new Error('Cannot reassign a completed or cancelled order'), { http: 400 });
    }
    const ocp = await client.query(
      `SELECT id, city_id, status FROM order_collection_points WHERE id = $1 AND deleted_at IS NULL`,
      [ocp_id]
    );
    if (ocp.rows.length === 0) throw Object.assign(new Error('OCP not found'), { http: 404 });
    if (ocp.rows[0].status !== 'active') throw Object.assign(new Error('OCP is disabled'), { http: 400 });
    if (ord.rows[0].city_id && ocp.rows[0].city_id && ord.rows[0].city_id !== ocp.rows[0].city_id) {
      throw Object.assign(new Error('OCP is in a different city than the order'), { http: 400 });
    }
    const upd = await client.query(
      `UPDATE orders SET ocp_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, ocp_id`,
      [ocp_id, id]
    );
    return upd.rows[0];
  }).catch((err: any) => {
    if (err?.http) return { __error: err };
    throw err;
  });

  if ((result as any)?.__error) {
    const e = (result as any).__error;
    return errorResponse(res, e.message, e.http);
  }
  logger.info('Order assigned to OCP', { orderId: id, ocpId: ocp_id, by: req.user?.id });
  emitOrderEventToAdmins(id, 'order:status_updated', { orderId: id, message: 'Order assigned to a collection point' });
  return successResponse(res, result, 'Order assigned to OCP');
});

/**
 * Reveal/hide the customer phone to the assigned OCP for one order.
 * PATCH /api/admin/orders/:id/ocp-phone   Body: { visible: boolean }
 */
export const setOcpPhoneVisibility = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const visible = req.body?.visible === true || req.body?.visible === 'true';
  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }
  const result = await query(
    `UPDATE orders SET phone_visible_to_ocp = $1, updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL RETURNING id, phone_visible_to_ocp`,
    [visible, id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Order not found');
  return successResponse(res, result.rows[0], visible ? 'Phone revealed to OCP' : 'Phone hidden from OCP');
});

/**
 * Get all riders
 * GET /api/admin/riders
 */
