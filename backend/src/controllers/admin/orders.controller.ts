// ============================================================================
// ADMIN CONTROLLER — orders, whatsapp orders, atta requests
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse } from '../../utils/response';
import { emitOrderUpdate, emitToUser, emitOrderEventToAdmins } from '../../config/socket';
import logger from '../../utils/logger';
import { localDate } from '../../utils/businessTime';
import { notifyOrderStatus, pushToCustomers } from '../../utils/customerNotify';
import {
  resolveCityScope,
  orderCityClause,
  orderInScope,
} from '../../utils/cityScope';
import {
  isValidOrderTransition,
  restoreOrderInventory,
  ORDER_STATUS_TIMESTAMPS,
} from '../../utils/orderStatus';
import { evaluateMilestone } from '../../utils/autoCoupons';
import { assignRiderToOrder } from '../../utils/assignRiderToOrder';
import { hasRiderTaskArrivedColumn, hasAttaCashColumns } from '../../config/riderSchema';
import { getDeliverySettings } from '../../utils/deliverySettings';
import { syncRiderAvailability } from '../../utils/riderAvailability';
import {
  cancelActiveRiderTasks,
  notifyRiderTasksCancelled,
  completeActiveRiderTasks,
  notifyRiderTasksClosed,
  notifyActiveRiderOfOrderChange,
  createAttaRiderTask,
  notifyAttaAssignment,
  CancelledRiderTask,
  AttaTaskType,
} from '../../utils/riderTaskEvents';
import { commitOrderSaleOnDelivery, reserveProductStock, adjustStockForWeightDelta } from '../../utils/systemStock';
import { deductOcpStockOnDelivery } from '../../utils/ocpStock';
import { roundMoney } from '../../utils/money';
import {
  resolveUnitPrice,
  resolveConsumerUnitPrice,
  normalizeProductUnit,
  normalizeQuality,
  qualityStockColumn,
  consumerQualities,
  stockUnitsNeeded,
} from '../../utils/unitPricing';
import { normalizePhoneNumber, parsePagination } from '../../utils/validators';
import { hasVariableWeightColumns, hasQualityCatalogColumns } from '../../config/productSchema';
import { hasCatalogV2Columns } from '../../config/catalogV2Schema';
import { ensureTimeSlotBookings } from '../../config/timeSlotSchema';
import { ensureControlColumns } from '../../config/controlSchema';
import { validateAndClaimTimeSlot } from '../../utils/timeSlots';
import { approvalForValue } from '../../utils/adminApproval';
import { hasUrgentDeliveryColumns, hasRestaurantOrderColumns } from '../../config/orderSchema';
import { hasOcpTables } from '../../config/ocpSchema';

/**
 * Fire-and-forget: when an order reaches `delivered`, check whether the
 * customer has earned an order-milestone coupon (grants + notifies). Never
 * blocks or fails the request that triggered the delivery.
 */
function gradeMilestoneOnDelivery(order: { user_id?: string; city_id?: string | null }): void {
  if (!order?.user_id) return;
  evaluateMilestone(order.user_id, order.city_id ?? null).catch(() => undefined);
}

export const getAllOrders = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const {
    page = 1,
    limit = 20,
    status,
    payment_status,
    rider_id,
    date_from,
    date_to,
    search,
  } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit);

  // Restaurant (B2B) orders share this table. `?restaurant=true` shows ONLY
  // them (with the restaurant as the "customer"); the default shows only
  // consumer orders. The same rich Orders UI is reused for both.
  const restaurantReady = await hasRestaurantOrderColumns();
  const isRestaurantMode = restaurantReady && req.query.restaurant === 'true';
  const restJoin = restaurantReady ? 'LEFT JOIN restaurants rest ON o.restaurant_id = rest.id' : '';
  const userJoin = isRestaurantMode
    ? 'LEFT JOIN users u ON o.user_id = u.id'
    : 'JOIN users u ON o.user_id = u.id';
  const custName = restaurantReady ? 'COALESCE(u.full_name, rest.business_name)' : 'u.full_name';
  const custPhone = restaurantReady ? 'COALESCE(u.phone, rest.phone)' : 'u.phone';

  let whereSql = `WHERE o.deleted_at IS NULL`;
  if (restaurantReady) {
    whereSql += isRestaurantMode ? ` AND o.restaurant_id IS NOT NULL` : ` AND o.restaurant_id IS NULL`;
  }

  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    whereSql += ` AND o.status = $${paramIndex++}`;
    params.push(status);
  }

  if (payment_status) {
    whereSql += ` AND o.payment_status = $${paramIndex++}`;
    params.push(payment_status);
  }

  if (rider_id) {
    whereSql += ` AND o.rider_id = $${paramIndex++}`;
    params.push(rider_id);
  }

  if (date_from) {
    whereSql += ` AND ${localDate('o.placed_at')} >= $${paramIndex++}::date`;
    params.push(date_from);
  }

  if (date_to) {
    whereSql += ` AND ${localDate('o.placed_at')} <= $${paramIndex++}::date`;
    params.push(date_to);
  }

  if (search) {
    whereSql += ` AND (o.order_number ILIKE $${paramIndex} OR ${custName} ILIKE $${paramIndex} OR ${custPhone} ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const cityFilter = orderCityClause(scope, 'o', 'addr', params, paramIndex);
  whereSql += cityFilter.sql;
  paramIndex = cityFilter.nextIndex;

  // Count total
  const countResult = await query(
    `SELECT COUNT(*) FROM orders o ${userJoin} ${restJoin} LEFT JOIN riders r ON o.rider_id = r.id LEFT JOIN users ru ON r.user_id = ru.id LEFT JOIN addresses addr ON o.address_id = addr.id ${whereSql}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const urgentCol = (await hasUrgentDeliveryColumns())
    ? 'o.is_urgent_delivery, o.urgent_delivery_eta,'
    : '';
  const ocpReady = await hasOcpTables();
  const ocpCol = ocpReady ? 'o.ocp_id, o.phone_visible_to_ocp, ocp.name AS ocp_name,' : '';
  const ocpJoin = ocpReady ? 'LEFT JOIN order_collection_points ocp ON o.ocp_id = ocp.id' : '';

  // Get orders
  const ordersSql = `
    SELECT
      o.id, o.order_number, o.status, o.source,
      (o.status = 'pending') AS is_unread,
      ${urgentCol}
      ${ocpCol}
      o.subtotal, o.discount_amount, o.delivery_charge, o.tax_amount, o.total_amount,
      o.payment_method, o.payment_status, o.paid_amount,
      o.placed_at, o.delivered_at, o.show_customer_phone,
      o.address_id, o.delivery_address_snapshot,
      u.id as customer_id, ${custName} as customer_name, ${custPhone} as customer_phone,
      r.id as rider_id, ru.full_name as rider_name,
      -- Latest rider task: lets the list flag "rider reported a problem".
      lt.status AS rider_task_status, lt.notes AS rider_task_notes,
      ${(await hasRiderTaskArrivedColumn()) ? 'lt.arrived_at AS rider_arrived_at,' : 'NULL::timestamptz AS rider_arrived_at,'}
      ts.slot_name, o.requested_delivery_date,
      ST_Y(addr.location::geometry) as address_latitude,
      ST_X(addr.location::geometry) as address_longitude,
      COALESCE(
        NULLIF(addr.door_picture_url, ''),
        o.delivery_address_snapshot->>'door_picture_url'
      ) as address_door_picture_url
    FROM orders o
    ${userJoin}
    ${restJoin}
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    LEFT JOIN addresses addr ON o.address_id = addr.id
    LEFT JOIN LATERAL (
      SELECT t.* FROM rider_tasks t
       WHERE t.order_id = o.id
       ORDER BY t.assigned_at DESC NULLS LAST, t.created_at DESC
       LIMIT 1
    ) lt ON TRUE
    ${ocpJoin}
    ${whereSql}
    ORDER BY o.placed_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(safeLimit, offset);

  const result = await query(ordersSql, params);

  successResponse(res, {
    orders: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  }, 'Orders retrieved successfully');
});

/**
 * Get order details
 * GET /api/admin/orders/:id
 */

export const getOrderDetails = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // City isolation: scoped admins only see their own city's orders by ID too.
  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  // Restaurant orders carry no consumer user — LEFT JOIN users + JOIN restaurants
  // so the same detail query serves both, with the restaurant as the customer.
  const restaurantReady = await hasRestaurantOrderColumns();
  const restJoin = restaurantReady ? 'LEFT JOIN restaurants rest ON o.restaurant_id = rest.id' : '';
  const custName = restaurantReady ? 'COALESCE(u.full_name, rest.business_name)' : 'u.full_name';
  const custPhone = restaurantReady ? 'COALESCE(u.phone, rest.phone)' : 'u.phone';

  const orderResult = await query(
    `SELECT
      o.*,
      ${custName} as customer_name, ${custPhone} as customer_phone, u.email as customer_email,
      r.id as rider_id, ru.full_name as rider_name, ru.phone as rider_phone,
      ts.slot_name, ts.start_time, ts.end_time,
      dcr.rule_name as delivery_rule_applied,
      ST_Y(addr.location::geometry) as address_latitude,
      ST_X(addr.location::geometry) as address_longitude,
      COALESCE(
        NULLIF(addr.door_picture_url, ''),
        o.delivery_address_snapshot->>'door_picture_url'
      ) as address_door_picture_url
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    ${restJoin}
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    LEFT JOIN delivery_charges_config dcr ON o.delivery_charge_rule_id = dcr.id
    LEFT JOIN addresses addr ON o.address_id = addr.id
    WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [id]
  );

  if (orderResult.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  const order = orderResult.rows[0];

  // Get order items, flagged with whether the product is sold by variable
  // weight so the admin can show the weigh-and-adjust control.
  const varCol = (await hasVariableWeightColumns())
    ? 'COALESCE(p.is_variable_weight, FALSE)'
    : 'FALSE';
  const itemsResult = await query(
    `SELECT oi.*, ${varCol} AS is_variable_weight,
            COALESCE(p.unit_value, 1) AS product_unit_value
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC`,
    [id]
  );

  order.items = itemsResult.rows;

  // What the rider(s) actually did on this order — assigned / picked up /
  // arrived / delivered / failed (+ reason) / cancelled, with proof photos.
  const arrivedReady = await hasRiderTaskArrivedColumn();
  const tasksResult = await query(
    `SELECT rt.id, rt.task_type, rt.status, rt.notes,
            rt.assigned_at, rt.accepted_at, rt.started_at, rt.completed_at,
            ${arrivedReady ? 'rt.arrived_at,' : 'NULL::timestamptz AS arrived_at,'}
            rt.delivery_proof_image, rt.pickup_proof_image,
            r.id AS rider_id, ru.full_name AS rider_name, ru.phone AS rider_phone
       FROM rider_tasks rt
       JOIN riders r ON r.id = rt.rider_id
       JOIN users ru ON ru.id = r.user_id
      WHERE rt.order_id = $1
      ORDER BY rt.assigned_at ASC NULLS LAST, rt.created_at ASC`,
    [id]
  );
  order.rider_tasks = tasksResult.rows;

  successResponse(res, order, 'Order details retrieved successfully');
});

/**
 * Update order status
 * PUT /api/admin/orders/:id/status
 */

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  // Transaction + row lock: the transition check, the status flip and the
  // cancel side-effects (stock/slot restore) must be atomic — same contract
  // as the customer-cancel and webhook paths.
  let updatedRow: any = null;
  let cancelledRiderTasks: CancelledRiderTask[] = [];
  let closedRiderTasks: CancelledRiderTask[] = [];
  try {
    updatedRow = await withTransaction(async (client) => {
      const orderResult = await client.query(
        'SELECT id, status, time_slot_id, payment_status, paid_amount FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (orderResult.rows.length === 0) return null;

      const order = orderResult.rows[0];

      if (!isValidOrderTransition(order.status, status)) {
        throw Object.assign(
          new Error(`Invalid status transition: ${order.status} → ${status}`),
          { http: 409 }
        );
      }

      const timestampColumn = ORDER_STATUS_TIMESTAMPS[status];
      const timestampValue = timestampColumn ? `, ${timestampColumn} = NOW()` : '';

      // Admin-confirmed delivery of a COD order collects the cash exactly like
      // the rider's own "delivered" path does (OCP orders are collected by the
      // OCP, so they are left alone). Without this the order sat "delivered /
      // payment pending" forever and never counted in revenue.
      const codPaidSql =
        status === 'delivered'
          ? `, payment_status = CASE
                 WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN 'completed'::payment_status
                 ELSE payment_status END,
               paid_amount = CASE
                 WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN total_amount
                 ELSE paid_amount END`
          : '';

      const result = await client.query(
        `UPDATE orders
         SET status = $1${timestampValue}${codPaidSql},
             cancellation_reason = COALESCE($2, cancellation_reason),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [status, reason, id]
      );

      // delivered → refunded: money goes back. Record the refunds-ledger row
      // (same shape as cancellation) and flip the payment status so finance
      // and the customer's order page both reflect it.
      if (status === 'refunded' && order.status !== 'refunded') {
        const paidOut = parseFloat(String(order.paid_amount ?? '0')) || 0;
        if (paidOut > 0 && (await hasCatalogV2Columns())) {
          await client.query(
            `INSERT INTO refunds
               (order_id, complaint_id, amount, original_payment_source, note, reason)
             VALUES ($1, NULL, $2, 'admin', $3, $3)`,
            [id, roundMoney(paidOut), reason ? `Refunded by admin: ${reason}` : 'Refunded by admin']
          );
        }
        await client.query(
          `UPDATE orders SET payment_status = 'refunded'::payment_status, updated_at = NOW() WHERE id = $1`,
          [id]
        );
        result.rows[0].payment_status = 'refunded';
      }

      // Admin-confirmed delivery closes the rider's task too (same as the
      // payment-received fast path) so the rider app stops showing it active.
      if (status === 'delivered' && order.status !== 'delivered') {
        closedRiderTasks = await completeActiveRiderTasks(client, id);
      }

      // Cancelling releases what the order consumed at creation.
      if (status === 'cancelled' && order.status !== 'cancelled') {
        // The rider must not keep driving to a cancelled order.
        cancelledRiderTasks = await cancelActiveRiderTasks(client, id, {
          note: reason ? `Order cancelled: ${reason}` : 'Order cancelled by admin',
        });
        // Paid order cancelled → money is owed back. Record a refunds-ledger
        // row (same shape as the complaint refund insert) so finance can
        // reconcile; never blocks the cancellation. Runs exactly once thanks
        // to the FOR UPDATE lock + transition guard above.
        const paidOut = parseFloat(String(order.paid_amount ?? '0')) || 0;
        if (order.payment_status === 'completed' && paidOut > 0 && (await hasCatalogV2Columns())) {
          await client.query(
            `INSERT INTO refunds
               (order_id, complaint_id, amount, original_payment_source, note, reason)
             VALUES ($1, NULL, $2, 'admin', $3, $3)`,
            [id, roundMoney(paidOut), 'Auto-created on order cancellation — refund due']
          );
        }
        await restoreOrderInventory(client, order);
      }

      // Delivering commits the system-stock sale (reserved → permanent) and
      // deducts the OCP's own stock. Both idempotent + self-guarded.
      if (status === 'delivered' && order.status !== 'delivered') {
        await commitOrderSaleOnDelivery(client, id);
        await deductOcpStockOnDelivery(client, id);
      }

      return result.rows[0];
    });
  } catch (err: any) {
    if (err?.http === 409) {
      return errorResponse(res, err.message, 409);
    }
    throw err;
  }

  if (!updatedRow) {
    return notFoundResponse(res, 'Order not found');
  }
  const result = { rows: [updatedRow] };

  logger.info('Order status updated', { orderId: id, status, updatedBy: req.user?.id });

  // Emit real-time order status update
  emitOrderUpdate(id, {
    orderId: id,
    status,
    reason,
    updatedBy: req.user?.id,
    updatedAt: new Date().toISOString(),
  });

  // Notify the customer of status change
  const order = result.rows[0];
  if (status === 'delivered') gradeMilestoneOnDelivery(order);
  emitToUser(order.user_id, 'order:status_changed', {
    orderId: id,
    orderNumber: order.order_number,
    status,
    message: `Your order #${order.order_number} is now ${status}`,
  });
  // App closed / in background → push (honours the customer's switch).
  notifyOrderStatus(order, status, reason).catch(() => {});

  // Notify admins
  emitOrderEventToAdmins(id, 'order:status_updated', {
    orderId: id,
    orderNumber: order.order_number,
    status,
    updatedBy: req.user?.id,
  });

  // Tell the displaced rider (socket + push) — after commit.
  notifyRiderTasksCancelled(cancelledRiderTasks, { id, order_number: order.order_number }, reason);
  notifyRiderTasksClosed(closedRiderTasks, { id, order_number: order.order_number }, `Order #${order.order_number} was marked delivered by the admin`);

  successResponse(res, result.rows[0], 'Order status updated successfully');
});

/**
 * Mark payment as received — auto-sets order status to 'delivered'
 * PUT /api/admin/orders/:id/payment-received
 */

export const markPaymentReceived = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  // Deliberate COD fast-path OUTSIDE the strict state machine: collecting
  // cash implies the order reached the customer, so any live status may jump
  // straight to delivered+paid. The only hard guard is below — a
  // cancelled/refunded order must never flip to delivered (that resurrected
  // dead orders and inflated revenue).
  let closedRiderTasks: CancelledRiderTask[] = [];
  const result = await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE orders
       SET payment_status = 'completed', paid_amount = total_amount,
           status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL AND status NOT IN ('cancelled', 'refunded')
       RETURNING *`,
      [id]
    );
    if (updated.rows.length === 0) return updated;
    // Only live tasks — a cancelled/failed task must keep its real outcome
    // (the old `status != 'completed'` rewrote those to completed too).
    closedRiderTasks = await completeActiveRiderTasks(client, id);
    await commitOrderSaleOnDelivery(client, id);
    await deductOcpStockOnDelivery(client, id);
    return updated;
  });

  if (result.rows.length === 0) {
    const exists = await query(
      `SELECT status FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (exists.rows.length > 0) {
      return errorResponse(
        res,
        `Cannot mark a ${exists.rows[0].status} order as paid/delivered`,
        409
      );
    }
    return notFoundResponse(res, 'Order not found');
  }

  // Also complete any associated rider task
  /* Delivery, rider task and stock commits are completed atomically above.

  // The order is now delivered: commit the system-stock sale (reserved →
  // permanent) and deduct the OCP's own stock. Both idempotent + self-guarded.
  await withTransaction(async (client) => {
    await commitOrderSaleOnDelivery(client, id);
    await deductOcpStockOnDelivery(client, id);
  }); */

  logger.info('Payment received & order delivered', { orderId: id, updatedBy: req.user?.id });

  // Emit real-time events
  const updatedOrder = result.rows[0];
  gradeMilestoneOnDelivery(updatedOrder);
  emitOrderUpdate(id, {
    orderId: id,
    status: 'delivered',
    paymentStatus: 'completed',
    message: `Order #${updatedOrder.order_number} marked as delivered — payment received`,
  });

  emitToUser(updatedOrder.user_id, 'order:delivered', {
    orderId: id,
    orderNumber: updatedOrder.order_number,
    message: `Your order #${updatedOrder.order_number} has been delivered!`,
  });
  notifyOrderStatus(updatedOrder, 'delivered').catch(() => {});
  notifyRiderTasksClosed(closedRiderTasks, { id, order_number: updatedOrder.order_number }, `Order #${updatedOrder.order_number} was marked delivered by the admin`);

  successResponse(res, result.rows[0], 'Payment received and order marked as delivered');
});

/**
 * Adjust the actual packed weight of a variable-weight order item, and
 * recompute that line + the whole order total — all atomically.
 * PUT /api/admin/orders/:id/items/:itemId/weight   Body: { weight_kg }
 */
export const updateOrderItemWeight = asyncHandler(async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const weight = parseFloat(String(req.body?.weight_kg));
  if (!Number.isFinite(weight) || weight < 0 || weight > 10000) {
    return errorResponse(res, 'Enter a valid weight in kilograms', 400);
  }

  if (!(await hasVariableWeightColumns())) {
    return errorResponse(res, 'Weight adjustment is not available yet.', 503);
  }
  await ensureControlColumns();

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  let updatedOrder: any = null;
  try {
    updatedOrder = await withTransaction(async (client) => {
      const orderRes = await client.query(
        `SELECT id, user_id, status, payment_status, delivery_charge, discount_amount, coupon_discount, tax_amount, city_id
           FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      if (orderRes.rows.length === 0) {
        throw Object.assign(new Error('Order not found'), { http: 404 });
      }
      const order = orderRes.rows[0];
      if (['cancelled', 'refunded'].includes(order.status)) {
        throw Object.assign(
          new Error('Cannot change weight on a cancelled or refunded order'),
          { http: 400 }
        );
      }
      // Once the cash is in (delivered / paid) the total is final — a weight
      // edit would silently desync total_amount from paid_amount.
      if (order.status === 'delivered' || order.payment_status === 'completed') {
        throw Object.assign(
          new Error('Cannot change weight after the order is delivered or paid'),
          { http: 400 }
        );
      }

      const qualityCol = (await hasQualityCatalogColumns()) ? ', oi.quality' : '';
      const itemRes = await client.query(
        `SELECT oi.id, oi.unit_price, oi.product_id, oi.product_name,
                oi.weight_kg AS prev_weight, oi.total_price AS prev_total,
                COALESCE(p.unit_value, 1) AS unit_value,
                COALESCE(p.is_variable_weight, FALSE) AS is_variable_weight
                ${qualityCol}
           FROM order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.id = $1 AND oi.order_id = $2
          FOR UPDATE OF oi`,
        [itemId, id]
      );
      if (itemRes.rows.length === 0) {
        throw Object.assign(new Error('Order item not found'), { http: 404 });
      }
      const item = itemRes.rows[0];
      if (!item.is_variable_weight) {
        throw Object.assign(
          new Error('This item is not sold by variable weight'),
          { http: 400 }
        );
      }

      // Price per kg = unit price ÷ the product's per-unit weight; the new line
      // total is that × the actual weighed amount. Never client-supplied.
      const unitValue = parseFloat(item.unit_value) || 1;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const pricePerKg = unitValue > 0 ? unitPrice / unitValue : unitPrice;
      const newTotal = roundMoney(pricePerKg * weight);

      await client.query(
        `UPDATE order_items
            SET final_weight_kg = $1, weight_kg = $1, total_price = $2, updated_at = NOW()
          WHERE id = $3`,
        [weight, newTotal, itemId]
      );

      // Physical stock must match COGS: the reservation/sale consumed the
      // ESTIMATED weight; reconcile the (actual − estimated) delta against
      // on-hand now. Incremental per edit (prev recorded weight → new), so
      // repeated weigh-ins never double-apply.
      const prevWeightNum = parseFloat(item.prev_weight);
      if (item.product_id && Number.isFinite(prevWeightNum) && unitValue > 0 && weight !== prevWeightNum) {
        await adjustStockForWeightDelta(client, {
          productId: item.product_id,
          quality: item.quality ?? 'A',
          deltaUnits: (weight - prevWeightNum) / unitValue,
          orderId: id,
          cityId: order.city_id ?? null,
          createdBy: req.user?.id ?? null,
        });
      }

      const sumRes = await client.query(
        `SELECT COALESCE(SUM(total_price), 0) AS subtotal FROM order_items WHERE order_id = $1`,
        [id]
      );
      const subtotal = roundMoney(parseFloat(sumRes.rows[0].subtotal) || 0);
      const delivery = parseFloat(order.delivery_charge) || 0;
      const discount = parseFloat(order.discount_amount) || 0;
      const coupon = parseFloat(order.coupon_discount) || 0;
      const tax = parseFloat(order.tax_amount) || 0;
      const total = roundMoney(Math.max(0, subtotal + delivery - discount - coupon + tax));

      const upd = await client.query(
        `UPDATE orders SET subtotal = $1, total_amount = $2, updated_at = NOW()
          WHERE id = $3 RETURNING *`,
        [subtotal, total, id]
      );

      // Audit EVERY weight edit (old→new + value delta). No single edit is
      // suspicious; the per-editor cumulative upward bias is what the owner's
      // daily reconciliation flags — this is the data it reads.
      const prevWeight = parseFloat(item.prev_weight);
      const prevTotal = parseFloat(item.prev_total) || 0;
      await client.query(
        `INSERT INTO order_item_weight_edits
           (order_id, order_item_id, product_id, edited_by, old_weight, new_weight, delta, old_total, new_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id, itemId, item.product_id ?? null, req.user?.id ?? null,
          Number.isFinite(prevWeight) ? prevWeight : null, weight,
          Number.isFinite(prevWeight) ? roundMoney(weight - prevWeight) : null,
          prevTotal, newTotal,
        ]
      );

      // Tell the customer their bill changed, with the exact packed weight — the
      // customer who receives the goods is the real-world check on the weight.
      // Persisted (bell) + realtime, so they see it even if offline at the time.
      const dirWord = newTotal > prevTotal ? 'barh kar' : newTotal < prevTotal ? 'kam ho kar' : 'update ho kar';
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, order_id)
         VALUES ($1, 'order_amount_updated', $2, $3, $4)`,
        [
          order.user_id,
          'Order total updated',
          `${item.product_name || 'Item'} ka weight ${weight} kg hua. Aapke order ka naya total Rs. ${total} ${dirWord} hai.`,
          id,
        ]
      );

      return { ...upd.rows[0], _prevTotal: prevTotal, _newTotal: newTotal };
    });
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  logger.info('Order item weight updated', {
    orderId: id, itemId, weight, updatedBy: req.user?.id,
    oldTotal: updatedOrder._prevTotal, newTotal: updatedOrder._newTotal,
  });
  emitOrderUpdate(id, {
    orderId: id,
    totalAmount: parseFloat(updatedOrder.total_amount),
    message: 'Order amount updated after weighing',
  });
  emitToUser(updatedOrder.user_id, 'order:amount_updated', {
    orderId: id,
    totalAmount: parseFloat(updatedOrder.total_amount),
    message: 'Your order amount was updated after weighing the items.',
  });
  // The inbox row was written inside the transaction; push it too so a
  // customer with the app closed learns the new COD amount before the rider.
  pushToCustomers([updatedOrder.user_id], {
    title: 'Order total updated',
    body: `Order #${updatedOrder.order_number}: new total Rs. ${parseFloat(updatedOrder.total_amount)} after weighing.`,
    data: { type: 'order_amount_updated', orderId: id, orderNumber: updatedOrder.order_number },
  }).catch(() => {});
  // The rider carrying it must collect the NEW amount.
  const newTotal = parseFloat(updatedOrder.total_amount);
  notifyActiveRiderOfOrderChange(id, {
    message: `Order #${updatedOrder.order_number} amount changed to Rs ${newTotal}`,
    push: {
      title: 'Order amount changed',
      body: `Order #${updatedOrder.order_number}: collect Rs ${newTotal} (items re-weighed).`,
    },
    data: { totalAmount: newTotal },
  }).catch(() => {});
  successResponse(res, updatedOrder, 'Weight and amount updated');
});

/**
 * Toggle customer phone visibility on order
 * PUT /api/admin/orders/:id/toggle-phone
 */

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
          new Error('A rider is still working on this order. Wait for him to report the problem, or reassign it.'),
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
  } catch (err: any) {
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
    successResponse(res, { order, rider }, 'Rider assigned successfully');
  } catch (err: any) {
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

export const createWhatsappOrder = asyncHandler(async (req: Request, res: Response) => {
  const {
    items,
    admin_notes,
    user_id,
    address_id,
    urgent_delivery,
    time_slot_id,
    requested_delivery_date,
    whatsapp_number,
    customer_name,
    address_text,
    latitude,
    longitude,
    door_picture_url,
    // Complaint replacement (admin-only): link this new order to the complained
    // original; per-item `override_price` lets the admin send it free or partial.
    replacement_for_order_id,
    complaint_id,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse(res, 'Add at least one item.', 400);
  }
  // The order can be placed for a looked-up customer + saved address, OR by
  // typing the customer's number + a delivery address for an unregistered
  // customer (the account + address are created on the fly). Either way we
  // need an address to deliver to.
  if (!address_id && !(typeof address_text === 'string' && address_text.trim())) {
    return errorResponse(res, 'Select a saved address or enter a delivery address.', 400);
  }

  const scope = await resolveCityScope(req);
  const isUrgent = urgent_delivery === true || urgent_delivery === 'true';

  // Optional manual coordinates (typed lat/long).
  const latNum = latitude === '' || latitude == null ? NaN : Number(latitude);
  const lngNum = longitude === '' || longitude == null ? NaN : Number(longitude);
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const doorPic = typeof door_picture_url === 'string' && door_picture_url.trim() ? door_picture_url.trim() : null;

  await ensureTimeSlotBookings();
  await ensureControlColumns();

  let order: any;
  try {
    order = await withTransaction(async (client) => {
      // ── Resolve the customer: prefer the looked-up account, else find-or-
      //    create one from the phone so WhatsApp orders for unregistered
      //    customers still become real, trackable orders. ───────────────────
      let resolvedUserId: string | null = null;
      if (user_id) {
        const u = await client.query(
          `SELECT id FROM users WHERE id = $1 AND role = 'customer' AND deleted_at IS NULL`,
          [user_id]
        );
        if (u.rows[0]) resolvedUserId = u.rows[0].id;
      }
      if (!resolvedUserId) {
        let normPhone: string;
        try {
          normPhone = normalizePhoneNumber(String(whatsapp_number || ''));
        } catch {
          throw Object.assign(new Error('A valid WhatsApp/phone number is required.'), { http: 400 });
        }
        const existing = await client.query(
          'SELECT id, role, deleted_at FROM users WHERE phone = $1 LIMIT 1',
          [normPhone]
        );
        if (existing.rows[0]) {
          const ex = existing.rows[0];
          if (ex.role === 'customer' && !ex.deleted_at) {
            resolvedUserId = ex.id;
          } else {
            throw Object.assign(new Error('This number is registered to a non-customer or deleted account.'), { http: 400 });
          }
        } else {
          const name = typeof customer_name === 'string' && customer_name.trim() ? customer_name.trim() : 'WhatsApp Customer';
          const created = await client.query(
            `INSERT INTO users (phone, full_name, role, status, is_phone_verified)
             VALUES ($1, $2, 'customer', 'active', FALSE) RETURNING id`,
            [normPhone, name]
          );
          resolvedUserId = created.rows[0].id;
        }
      }

      // ── Resolve the address: a saved one (IDOR-checked), else create one
      //    from the typed address + coordinates. ────────────────────────────
      let addrRow: any = null;
      if (address_id) {
        const a = await client.query(
          `SELECT a.*, ST_X(a.location::geometry) AS lng, ST_Y(a.location::geometry) AS lat
             FROM addresses a WHERE a.id = $1 AND a.user_id = $2 AND a.deleted_at IS NULL`,
          [address_id, resolvedUserId]
        );
        if (a.rows[0]) addrRow = a.rows[0];
      }
      if (!addrRow) {
        const text = typeof address_text === 'string' ? address_text.trim() : '';
        if (!text) throw Object.assign(new Error('Enter a delivery address.'), { http: 400 });
        const created = hasCoords
          ? await client.query(
              `INSERT INTO addresses (user_id, written_address, location, city, door_picture_url, address_type)
               VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3::float, $4::float), 4326)::geography, $5, $6, 'home')
               RETURNING *, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat`,
              [resolvedUserId, text, lngNum, latNum, scope.cityName || 'Gujrat', doorPic]
            )
          : await client.query(
              `INSERT INTO addresses (user_id, written_address, city, door_picture_url, address_type)
               VALUES ($1, $2, $3, $4, 'home')
               RETURNING *, NULL::float AS lng, NULL::float AS lat`,
              [resolvedUserId, text, scope.cityName || 'Gujrat', doorPic]
            );
        addrRow = created.rows[0];
      }

      // Delivery city: from the address, else the admin's scope.
      let orderCityId: string | null = scope.cityId ?? null;
      if (addrRow.city) {
        const cityRow = await client.query(
          `SELECT id FROM service_cities WHERE LOWER(name) = LOWER($1) AND is_active = TRUE LIMIT 1`,
          [addrRow.city]
        );
        if (cityRow.rows[0]?.id) orderCityId = cityRow.rows[0].id;
      }

      // A custom/discounted price is ONLY allowed on a genuine complaint
      // replacement: the new order must point at a real, in-scope original order
      // AND a complaint that belongs to it. Otherwise a "manual order" could be
      // priced at 0 to walk stock out as a free sale. Validated up front so the
      // pricing loop can refuse override prices on a normal manual order.
      let isReplacement = false;
      if (replacement_for_order_id) {
        if (!(await orderInScope(scope, replacement_for_order_id))) {
          throw Object.assign(new Error('Original order not found.'), { http: 400 });
        }
        if (!complaint_id) {
          throw Object.assign(new Error('A linked complaint is required for a replacement order.'), { http: 400 });
        }
        const comp = await client.query(
          `SELECT id FROM complaints WHERE id = $1 AND order_id = $2`,
          [complaint_id, replacement_for_order_id]
        );
        if (comp.rows.length === 0) {
          throw Object.assign(new Error('The complaint does not match the original order.'), { http: 400 });
        }
        isReplacement = true;
      }
      let discountValueTotal = 0;

      // Price each line by its unit + quality; track the free-delivery subtotal.
      const qualityReady = await hasQualityCatalogColumns();
      const catalogV2Ready = await hasCatalogV2Columns();
      const v2Cols = catalogV2Ready
        ? ', p.consumer_enabled_a, p.consumer_enabled_b, p.consumer_enabled_c, p.half_kg_price_b, p.quarter_kg_price_b, p.half_dozen_price_b, p.half_kg_price_c, p.quarter_kg_price_c, p.half_dozen_price_c'
        : '';
      let subtotal = 0;
      let vegFruitSubtotal = 0;
      const lines: any[] = [];
      for (const item of items) {
        const pr = await client.query(
          `SELECT p.name_en, p.primary_image, p.sku, p.price, p.half_kg_price, p.quarter_kg_price,
                  p.half_dozen_price, p.city_id, cat.qualifies_for_free_delivery
                  ${qualityReady ? ', p.price_b, p.price_c, p.stock_quantity_b, p.stock_quantity_c' : ''}
                  ${v2Cols}
             FROM products p JOIN categories cat ON p.category_id = cat.id
            WHERE p.id = $1 AND p.is_active = TRUE FOR UPDATE`,
          [item.product_id]
        );
        if (pr.rows.length === 0) {
          throw Object.assign(new Error(`Product not found: ${item.product_id}`), { http: 400 });
        }
        const p = pr.rows[0];
        // Product city must match the order's city — an id alone must never let a
        // foreign-city product onto a city order (catalog is per-city).
        if (orderCityId && p.city_id && p.city_id !== orderCityId) {
          throw Object.assign(new Error(`${p.name_en} is not available in this city.`), { http: 400 });
        }
        const unit = normalizeProductUnit(item.unit);
        const quality = qualityReady ? normalizeQuality(item.quality) : 'A';
        if (qualityReady && !consumerQualities(p).includes(quality)) {
          throw Object.assign(new Error(`Quality ${quality} not available for ${p.name_en}.`), { http: 400 });
        }
        const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
        // The live (normal) price is always the baseline.
        const liveUnit = qualityReady
          ? (resolveConsumerUnitPrice(p, quality, unit) ?? resolveUnitPrice(p, unit))
          : resolveUnitPrice(p, unit);
        // An override (free/partial) price is honoured ONLY on a complaint
        // replacement, and can never exceed the live price. On a normal manual
        // order any override is rejected — no zero-priced stock walkout.
        const override = item.override_price;
        const hasOverride = override !== undefined && override !== null && override !== '' && Number.isFinite(parseFloat(String(override))) && parseFloat(String(override)) >= 0;
        if (hasOverride && !isReplacement) {
          throw Object.assign(new Error('Custom or discounted prices are only allowed on a complaint replacement order.'), { http: 400 });
        }
        let unitPrice = liveUnit;
        if (hasOverride) {
          const ov = roundMoney(parseFloat(String(override)));
          if (ov > liveUnit + 1e-6) {
            throw Object.assign(new Error(`A replacement line price can't exceed the normal price (Rs. ${liveUnit}).`), { http: 400 });
          }
          unitPrice = ov;
        }
        discountValueTotal += roundMoney(Math.max(0, liveUnit - unitPrice) * qty);
        const lineTotal = roundMoney(unitPrice * qty);
        subtotal += lineTotal;
        if (p.qualifies_for_free_delivery === true) vegFruitSubtotal += lineTotal;
        lines.push({ product_id: item.product_id, name: p.name_en, image: p.primary_image, sku: p.sku, unit, quality, unitPrice, qty, lineTotal });
      }
      subtotal = roundMoney(subtotal);

      // A free/discounted replacement above the value threshold needs a SECOND
      // admin to co-sign (anti-fraud) — one admin can't hand out big free stock.
      let discountApproval: { approvedBy: string | null; approvedAt: string | null } = { approvedBy: null, approvedAt: null };
      if (discountValueTotal > 0) {
        discountApproval = await approvalForValue(client, req, discountValueTotal, { label: 'a free/discounted order' });
      }

      // Delivery settings.
      // Delivery settings of the order's city (global default otherwise).
      const sset = await getDeliverySettings(orderCityId, client);
      const { baseCharge, freeThreshold, urgentCharge, urgentEta } = sset;

      // Delivery charge — same rules as the website (urgent flat rate; free
      // slot → free; else free only when the eligible subtotal meets the
      // threshold). Urgent ignores slots + the threshold.
      // effectiveSlotId is nulled out if the slot no longer exists, so the
      // orders.time_slot_id FK never fails on a stale id.
      let effectiveSlotId: string | null = isUrgent ? null : (time_slot_id || null);
      let deliveryCharge = 0;
      if (isUrgent) {
        if (urgentCharge <= 0) throw Object.assign(new Error('Urgent delivery is not available right now.'), { http: 400 });
        deliveryCharge = roundMoney(urgentCharge);
      } else if (effectiveSlotId) {
        const slot = await client.query(`SELECT is_free_delivery_slot FROM time_slots WHERE id = $1`, [effectiveSlotId]);
        if (slot.rows.length === 0) {
          effectiveSlotId = null;
          deliveryCharge = vegFruitSubtotal >= freeThreshold ? 0 : baseCharge;
        } else {
          deliveryCharge = slot.rows[0].is_free_delivery_slot === true
            ? 0
            : (vegFruitSubtotal >= freeThreshold ? 0 : baseCharge);
        }
      } else {
        deliveryCharge = vegFruitSubtotal >= freeThreshold ? 0 : baseCharge;
      }

      const totalAmount = roundMoney(subtotal + deliveryCharge);

      const snapshot = JSON.stringify({
        written_address: addrRow.written_address,
        landmark: addrRow.landmark,
        house_number: addrRow.house_number,
        area_name: addrRow.area_name,
        city: addrRow.city,
        province: addrRow.province,
        postal_code: addrRow.postal_code,
        door_picture_url: addrRow.door_picture_url || '',
        location: { latitude: addrRow.lat ?? null, longitude: addrRow.lng ?? null },
      });

      const orderRes = await client.query(
        `INSERT INTO orders (
          user_id, address_id, delivery_address_snapshot, time_slot_id, requested_delivery_date,
          subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
          payment_method, payment_status, status, source, customer_notes, city_id
        ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,0,$8,'cash_on_delivery','pending','pending','whatsapp',$9,$10)
        RETURNING *`,
        [
          resolvedUserId, addrRow.id, snapshot, effectiveSlotId,
          isUrgent ? null : (requested_delivery_date || null),
          subtotal, deliveryCharge, totalAmount, admin_notes || null, orderCityId,
        ]
      );
      const o = orderRes.rows[0];

      if (isUrgent && (await hasUrgentDeliveryColumns())) {
        await client.query(`UPDATE orders SET is_urgent_delivery = TRUE, urgent_delivery_eta = $1 WHERE id = $2`, [urgentEta || null, o.id]);
        o.is_urgent_delivery = true;
        o.urgent_delivery_eta = urgentEta || null;
      }

      // Link the (already-validated) complaint replacement to its original order
      // and stamp who co-approved any discount.
      if (isReplacement && catalogV2Ready) {
        await client.query(
          `UPDATE orders SET replacement_for_order_id = $1, complaint_id = $2,
                  discount_approved_by = $3, discount_approved_at = $4
            WHERE id = $5`,
          [replacement_for_order_id, complaint_id, discountApproval.approvedBy, discountApproval.approvedAt, o.id]
        );
      }

      for (const l of lines) {
        if (qualityReady) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, unit, quality)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [o.id, l.product_id, l.name, l.image, l.sku, l.unitPrice, l.qty, l.lineTotal, l.unit, l.quality]
          );
        } else {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, unit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [o.id, l.product_id, l.name, l.image, l.sku, l.unitPrice, l.qty, l.lineTotal, l.unit]
          );
        }
        // Reserve the SHARED per-quality bucket through the same path checkout
        // uses: an atomic guard (on_hand − reserved ≥ need) prevents oversell,
        // and delivery converts the reserve to a permanent sale (+ OCP deduct).
        const need = stockUnitsNeeded(l.qty, l.unit);
        if (catalogV2Ready) {
          const ok = await reserveProductStock(client, {
            productId: l.product_id, quality: l.quality, need,
            orderId: o.id, cityId: orderCityId, createdBy: req.user?.id ?? null,
          });
          if (!ok) throw Object.assign(new Error(`Not enough stock for ${l.name}.`), { http: 400 });
        } else {
          // Legacy (pre-reservation) fallback: still guard against oversell.
          const stockCol = qualityReady ? qualityStockColumn(l.quality) : 'stock_quantity';
          const statusSet =
            stockCol === 'stock_quantity'
              ? `, stock_status = CASE WHEN ${stockCol} - $1 <= 0 THEN 'out_of_stock'::product_status ELSE 'active'::product_status END`
              : '';
          const dec = await client.query(
            `UPDATE products SET ${stockCol} = ${stockCol} - $1${statusSet}, updated_at = NOW()
              WHERE id = $2 AND ${stockCol} >= $1 RETURNING id`,
            [need, l.product_id]
          );
          if (dec.rowCount === 0) throw Object.assign(new Error(`Not enough stock for ${l.name}.`), { http: 400 });
        }
      }

      // Reservation orders commit their sale (and OCP deduct) on delivery.
      if (catalogV2Ready) {
        await client.query(`UPDATE orders SET stock_reserved = TRUE WHERE id = $1`, [o.id]);
      }

      // Count this manual order against the slot's per-date capacity (trusted:
      // admins aren't blocked by the cutoff/cap but the seat is still counted).
      await validateAndClaimTimeSlot(client, {
        slotId: effectiveSlotId,
        deliveryDate: isUrgent ? null : (requested_delivery_date || null),
        isUrgent,
        trusted: true,
      });

      return o;
    });
  } catch (err: any) {
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  logger.info('WhatsApp order placed as real order', { orderId: order.id, by: req.user?.id });
  emitOrderEventToAdmins(order.id, 'order:new', {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalAmount: parseFloat(order.total_amount),
    isUrgent: order.is_urgent_delivery === true,
    source: 'whatsapp',
    message: `New WhatsApp order #${order.order_number} placed`,
  });

  createdResponse(res, order, 'WhatsApp order placed');
});

/**
 * List customer addresses (admin)
 * GET /api/admin/addresses
 */

export const bulkUpdateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { order_ids, status, reason } = req.body as {
    order_ids: string[];
    status: string;
    reason?: string;
  };

  if (!Array.isArray(order_ids) || order_ids.length === 0) {
    return errorResponse(res, 'At least one order ID is required', 400);
  }

  const timestampColumn = ORDER_STATUS_TIMESTAMPS[status];
  const timestampValue = timestampColumn ? `, ${timestampColumn} = NOW()` : '';

  // City isolation: scoped admins can only bulk-update their city's orders.
  const scope = await resolveCityScope(req);
  const lockParams: unknown[] = [order_ids];
  let scopeSql = '';
  if (!scope.unrestricted && scope.cityId && scope.cityName && scope.dbReady) {
    lockParams.push(scope.cityId, scope.cityName);
    scopeSql = ` AND (
      o.city_id = $2
      OR LOWER(COALESCE(addr.city, '')) = LOWER($3)
      OR LOWER(COALESCE(o.delivery_address_snapshot->>'city', '')) = LOWER($3)
    )`;
  }

  // Per-order transition validation + cancel side-effects, atomically.
  // Orders whose current status can't legally move to the target are skipped
  // (and reported back) instead of being force-jumped.
  const cancelledRiderTasksByOrder: { order: any; tasks: CancelledRiderTask[] }[] = [];
  const closedRiderTasksByOrder: { order: any; tasks: CancelledRiderTask[] }[] = [];
  const { updatedRows, skipped } = await withTransaction(async (client) => {
    const lockResult = await client.query(
      `SELECT o.id, o.status, o.time_slot_id FROM orders o
        LEFT JOIN addresses addr ON o.address_id = addr.id
        WHERE o.id = ANY($1::uuid[]) AND o.deleted_at IS NULL${scopeSql}
        FOR UPDATE OF o`,
      lockParams
    );

    const allowed: any[] = [];
    const skippedLocal: { id: string; status: string }[] = [];
    for (const order of lockResult.rows) {
      if (isValidOrderTransition(order.status, status)) {
        allowed.push(order);
      } else {
        skippedLocal.push({ id: order.id, status: order.status });
      }
    }

    if (allowed.length === 0) {
      return { updatedRows: [] as any[], skipped: skippedLocal };
    }

    // Same COD rule as the single-order path: an admin "delivered" collects
    // the cash for direct COD orders (otherwise they stay "payment pending"
    // forever and never reach revenue or the rider's cash-to-hand-over).
    const bulkCodPaidSql =
      status === 'delivered'
        ? `, payment_status = CASE
               WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN 'completed'::payment_status
               ELSE payment_status END,
             paid_amount = CASE
               WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN total_amount
               ELSE paid_amount END`
        : '';
    const result = await client.query(
      `UPDATE orders
       SET status = $1${timestampValue}${bulkCodPaidSql},
           cancellation_reason = COALESCE($2, cancellation_reason),
           updated_at = NOW()
       WHERE id = ANY($3::uuid[])
       RETURNING *`,
      [status, reason || null, allowed.map((o) => o.id)]
    );

    if (status === 'cancelled') {
      for (const order of allowed) {
        if (order.status !== 'cancelled') {
          await restoreOrderInventory(client, order);
          const tasks = await cancelActiveRiderTasks(client, order.id, {
            note: reason ? `Order cancelled: ${reason}` : 'Order cancelled by admin',
          });
          if (tasks.length) cancelledRiderTasksByOrder.push({ order, tasks });
        }
      }
    }
    if (status === 'delivered') {
      for (const order of allowed) {
        if (order.status !== 'delivered') {
          await commitOrderSaleOnDelivery(client, order.id);
          await deductOcpStockOnDelivery(client, order.id);
          const closed = await completeActiveRiderTasks(client, order.id);
          if (closed.length) closedRiderTasksByOrder.push({ order, tasks: closed });
        }
      }
    }

    return { updatedRows: result.rows, skipped: skippedLocal };
  });

  const result = { rows: updatedRows };

  for (const { order, tasks } of cancelledRiderTasksByOrder) {
    const row = result.rows.find((r: any) => r.id === order.id) ?? order;
    notifyRiderTasksCancelled(tasks, { id: order.id, order_number: row.order_number }, reason);
  }
  for (const { order, tasks } of closedRiderTasksByOrder) {
    const row = result.rows.find((r: any) => r.id === order.id) ?? order;
    notifyRiderTasksClosed(tasks, { id: order.id, order_number: row.order_number }, `Order #${row.order_number} was marked delivered by the admin`);
  }

  for (const order of result.rows) {
    emitOrderUpdate(order.id, {
      orderId: order.id,
      status,
      reason,
      updatedBy: req.user?.id,
      updatedAt: new Date().toISOString(),
    });

    emitToUser(order.user_id, 'order:status_changed', {
      orderId: order.id,
      orderNumber: order.order_number,
      status,
      message: `Your order #${order.order_number} is now ${status}`,
    });
    notifyOrderStatus(order, status, reason).catch(() => {});

    emitOrderEventToAdmins(order.id, 'order:status_updated', {
      orderId: order.id,
      orderNumber: order.order_number,
      status,
      updatedBy: req.user?.id,
    });
  }

  logger.info('Bulk order status updated', {
    count: result.rows.length,
    skipped: skipped.length,
    status,
    updatedBy: req.user?.id,
  });

  successResponse(res, {
    updated: result.rows.length,
    skipped,
    orders: result.rows,
  }, skipped.length > 0
    ? `${result.rows.length} order(s) updated, ${skipped.length} skipped (invalid status transition)`
    : `${result.rows.length} order(s) updated successfully`);
});

/**
 * Permanently delete an order (soft delete) — super admin only
 * DELETE /api/admin/orders/:id
 */

export const deleteOrder = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admins can delete orders', 403);
  }

  const { id } = req.params;

  // Soft-deleting a live order must release what it holds: reserved stock,
  // the slot seat and any rider task — otherwise the stock stays locked and the
  // rider keeps driving to an order nobody can see any more.
  let deletedRow: any = null;
  let cancelledRiderTasks: CancelledRiderTask[] = [];
  await withTransaction(async (client) => {
    const cur = await client.query(
      `SELECT id, order_number, status, time_slot_id, requested_delivery_date
         FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (cur.rows.length === 0) return;
    const order = cur.rows[0];
    if (!['delivered', 'cancelled', 'refunded'].includes(order.status)) {
      cancelledRiderTasks = await cancelActiveRiderTasks(client, id, { note: 'Order deleted by admin' });
      await restoreOrderInventory(client, order);
    }
    const result = await client.query(
      `UPDATE orders SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, order_number`,
      [id]
    );
    deletedRow = result.rows[0] ?? null;
  });

  if (!deletedRow) {
    return notFoundResponse(res, 'Order not found');
  }
  const result = { rows: [deletedRow] };
  if (cancelledRiderTasks.length > 0) {
    notifyRiderTasksCancelled(
      cancelledRiderTasks,
      { id, order_number: deletedRow.order_number },
      'Order deleted by admin'
    );
  }

  logger.info('Order deleted', {
    orderId: id,
    orderNumber: result.rows[0].order_number,
    deletedBy: req.user?.id,
  });

  successResponse(res, { id }, 'Order deleted successfully');
});

/**
 * Delete a customer address (soft delete) — super admin only
 * DELETE /api/admin/addresses/:id
 */

export const getAttaRequests = asyncHandler(async (req: Request, res: Response) => {
  const { status, page = 1, limit = 20 } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit);

  let sql = `
    FROM atta_requests ar
    JOIN users u ON ar.user_id = u.id
    LEFT JOIN addresses a ON ar.address_id = a.id
    LEFT JOIN riders pr ON pr.id = ar.pickup_rider_id
    LEFT JOIN users pru ON pru.id = pr.user_id
    LEFT JOIN riders dr ON dr.id = ar.delivery_rider_id
    LEFT JOIN users dru ON dru.id = dr.user_id
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    sql += ` AND ar.status = $${paramIndex++}`;
    params.push(status);
  }

  // City scoping via the pickup address — same rule as updateAttaStatus, so a
  // scoped admin can't list another city's requests (customer PII included).
  const attaScope = await resolveCityScope(req);
  if (!attaScope.unrestricted && attaScope.cityName && attaScope.dbReady) {
    sql += ` AND LOWER(COALESCE(a.city, '')) = LOWER($${paramIndex++})`;
    params.push(attaScope.cityName);
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get requests — with who is (or was) carrying the wheat / flour and the
  // live task state, so the admin can dispatch from this page.
  const attaCashReady = await hasAttaCashColumns();
  const requestsSql = `
    SELECT 
      ar.id, ar.request_number, ar.status,
      ar.wheat_quality, ar.wheat_quantity_kg,
      ar.flour_type, ar.actual_flour_quantity_kg, ar.special_instructions,
      ar.service_charge, ar.milling_charge, ar.delivery_charge, ar.total_amount,
      ar.payment_status, ar.payment_method,
      ${attaCashReady ? 'ar.paid_amount,' : '0 AS paid_amount,'}
      u.full_name as customer_name, u.phone as customer_phone,
      a.written_address as pickup_address, a.house_number, a.area_name, a.city,
      ar.pickup_rider_id, pru.full_name AS pickup_rider_name,
      ar.delivery_rider_id, dru.full_name AS delivery_rider_name,
      (SELECT t.status FROM rider_tasks t WHERE t.atta_request_id = ar.id AND t.task_type = 'atta_pickup'
        ORDER BY t.assigned_at DESC LIMIT 1) AS pickup_task_status,
      (SELECT t.notes FROM rider_tasks t WHERE t.atta_request_id = ar.id AND t.task_type = 'atta_pickup'
        ORDER BY t.assigned_at DESC LIMIT 1) AS pickup_task_notes,
      (SELECT t.status FROM rider_tasks t WHERE t.atta_request_id = ar.id AND t.task_type = 'atta_delivery'
        ORDER BY t.assigned_at DESC LIMIT 1) AS delivery_task_status,
      (SELECT t.notes FROM rider_tasks t WHERE t.atta_request_id = ar.id AND t.task_type = 'atta_delivery'
        ORDER BY t.assigned_at DESC LIMIT 1) AS delivery_task_notes,
      ar.pickup_proof_image, ar.delivery_proof_image,
      ar.created_at
    ${sql}
    ORDER BY ar.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(safeLimit, offset);

  const result = await query(requestsSql, params);

  successResponse(res, {
    requests: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  }, 'Atta requests retrieved successfully');
});

/**
 * Update atta request status
 * PUT /api/admin/atta-requests/:id/status
 */

export const updateAttaStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, rider_id } = req.body;

  // City-scoped via the pickup address: a scoped admin can't act on another
  // city's atta request by guessing the id.
  const attaScope = await resolveCityScope(req);
  if (!attaScope.unrestricted && attaScope.cityName && attaScope.dbReady) {
    const chk = await query(
      `SELECT 1 FROM atta_requests ar
         LEFT JOIN addresses a ON a.id = ar.address_id
        WHERE ar.id = $1 AND LOWER(COALESCE(a.city, '')) = LOWER($2)`,
      [id, attaScope.cityName]
    );
    if (chk.rows.length === 0) return notFoundResponse(res, 'Atta request not found');
  }

  const statusUpdates: Record<string, { column: string; riderColumn?: string }> = {
    picked_up: { column: 'picked_up_at', riderColumn: 'pickup_rider_id' },
    at_mill: { column: 'milling_started_at' },
    milling: { column: 'milling_started_at' },
    ready_for_delivery: { column: 'milling_completed_at' },
    out_for_delivery: { column: 'delivery_scheduled_at', riderColumn: 'delivery_rider_id' },
    delivered: { column: 'delivered_at' },
  };

  const update = statusUpdates[status];
  if (!update) {
    return errorResponse(res, 'Invalid status', 400);
  }

  const allowedFrom: Record<string, string[]> = {
    picked_up: ['pending_pickup'],
    at_mill: ['picked_up'],
    milling: ['picked_up', 'at_mill'],
    ready_for_delivery: ['at_mill', 'milling'],
    out_for_delivery: ['ready_for_delivery'],
    delivered: ['out_for_delivery'],
  };
  if (update.riderColumn && rider_id) {
    // riders.status is available/busy/offline/on_leave — the old `= 'active'`
    // check matched nothing, so every rider assignment on an atta request
    // failed with "Active rider not found".
    const rider = await query(
      `SELECT id FROM riders
        WHERE id = $1 AND deleted_at IS NULL AND verification_status = 'verified'
          AND status NOT IN ('offline', 'on_leave')`,
      [rider_id]
    );
    if (rider.rows.length === 0) return errorResponse(res, 'Rider not found, not verified, or off duty', 400);
  }

  let sql = `UPDATE atta_requests SET status = $1, ${update.column} = COALESCE(${update.column}, NOW())`;
  const params: any[] = [status, allowedFrom[status]];
  let paramIndex = 3;

  if (update.riderColumn && rider_id) {
    sql += `, ${update.riderColumn} = $${paramIndex++}`;
    params.push(rider_id);
  }

  sql += `, updated_at = NOW() WHERE id = $${paramIndex} AND status = ANY($2::text[]) RETURNING *`;
  params.push(id);

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    const exists = await query('SELECT status FROM atta_requests WHERE id = $1', [id]);
    if (exists.rows.length > 0) {
      return errorResponse(res, `Invalid atta status transition: ${exists.rows[0].status} → ${status}`, 409);
    }
    return notFoundResponse(res, 'Atta request not found');
  }

  // A manual status move past a rider's step closes that rider task, so the
  // rider app does not keep showing work the office already finished.
  const closePickup = ['at_mill', 'milling', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes(status);
  const closeDelivery = status === 'delivered';
  if (closePickup || closeDelivery) {
    const types = [closePickup ? 'atta_pickup' : null, closeDelivery ? 'atta_delivery' : null].filter(Boolean);
    const closed = await query(
      `UPDATE rider_tasks rt
          SET status = 'completed', completed_at = COALESCE(rt.completed_at, NOW()),
              notes = COALESCE(rt.notes, 'Closed by admin'), updated_at = NOW()
         FROM riders r
        WHERE rt.rider_id = r.id AND rt.atta_request_id = $1
          AND rt.task_type = ANY($2::task_type[]) AND rt.status IN ('assigned', 'in_progress')
        RETURNING rt.id AS task_id, rt.rider_id, r.user_id AS rider_user_id`,
      [id, types]
    );
    for (const row of closed.rows) {
      await syncRiderAvailability(row.rider_id);
      emitToUser(row.rider_user_id, 'rider:task_updated', {
        taskId: row.task_id, attaRequestId: id, orderNumber: result.rows[0].request_number,
        status: 'completed', message: 'The office updated this atta request',
      });
    }
  }

  // A rider assignment creates the rider_tasks row the rider app works from
  // (previously the rider column was set but no task ever reached the app).
  if (update.riderColumn && rider_id) {
    const taskType: AttaTaskType = update.riderColumn === 'pickup_rider_id' ? 'atta_pickup' : 'atta_delivery';
    try {
      const created = await withTransaction((client) => createAttaRiderTask(client, id, rider_id, taskType));
      notifyAttaAssignment(created.riderUserId, { id, request_number: result.rows[0].request_number }, taskType, created.taskId);
      notifyRiderTasksCancelled(created.displaced, { id, order_number: result.rows[0].request_number }, 'Reassigned to another rider');
    } catch (err) {
      logger.error('Failed to create atta rider task', { attaRequestId: id, riderId: rider_id, err });
    }
  }

  successResponse(res, result.rows[0], 'Atta request status updated successfully');
});

/**
 * Assign the rider who collects the wheat (atta_pickup) or brings the flour
 * back (atta_delivery) WITHOUT moving the request's status — the rider's own
 * "Wheat collected" / "Flour collected" / "Delivered" taps move it, exactly
 * like an order. (The old way only assigned a rider as a side-effect of the
 * admin claiming the wheat was already picked up.)
 * PUT /api/admin/atta-requests/:id/assign-rider   Body: { rider_id, task_type }
 */
export const assignAttaRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { rider_id } = req.body;
  const taskType = req.body?.task_type as AttaTaskType;
  if (!rider_id) return errorResponse(res, 'Select a rider.', 400);
  if (!['atta_pickup', 'atta_delivery'].includes(taskType)) {
    return errorResponse(res, "task_type must be 'atta_pickup' or 'atta_delivery'", 400);
  }

  const attaScope = await resolveCityScope(req);
  if (!attaScope.unrestricted && attaScope.cityName && attaScope.dbReady) {
    const chk = await query(
      `SELECT 1 FROM atta_requests ar
         LEFT JOIN addresses a ON a.id = ar.address_id
        WHERE ar.id = $1 AND LOWER(COALESCE(a.city, '')) = LOWER($2)`,
      [id, attaScope.cityName]
    );
    if (chk.rows.length === 0) return notFoundResponse(res, 'Atta request not found');
  }

  const rider = await query(
    `SELECT r.id, r.city_id FROM riders r
      WHERE r.id = $1 AND r.deleted_at IS NULL AND r.verification_status = 'verified'
        AND r.status NOT IN ('offline', 'on_leave')`,
    [rider_id]
  );
  if (rider.rows.length === 0) return errorResponse(res, 'Rider not found, not verified, or off duty', 400);
  if (attaScope.cityId && rider.rows[0].city_id && rider.rows[0].city_id !== attaScope.cityId && !attaScope.unrestricted) {
    return errorResponse(res, 'Rider belongs to a different service city', 400);
  }

  const allowed = taskType === 'atta_pickup'
    ? ['pending_pickup']
    : ['at_mill', 'milling', 'ready_for_delivery'];
  const column = taskType === 'atta_pickup' ? 'pickup_rider_id' : 'delivery_rider_id';

  let out: { created: { taskId: string; riderUserId: string | null; displaced: CancelledRiderTask[] }; request: any };
  try {
    out = await withTransaction(async (client) => {
      const reqRow = await client.query(
        `SELECT id, request_number, status FROM atta_requests WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (reqRow.rows.length === 0) throw Object.assign(new Error('Atta request not found'), { http: 404 });
      const request = reqRow.rows[0];
      if (!allowed.includes(request.status)) {
        throw Object.assign(
          new Error(
            taskType === 'atta_pickup'
              ? `A pickup rider can only be assigned while the request is pending pickup (it is ${request.status}).`
              : `A delivery rider can be assigned once the wheat is at the mill (it is ${request.status}).`
          ),
          { http: 409 }
        );
      }
      await client.query(`UPDATE atta_requests SET ${column} = $1, updated_at = NOW() WHERE id = $2`, [rider_id, id]);
      const created = await createAttaRiderTask(client, id, rider_id, taskType);
      return { created, request };
    });
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 409) return errorResponse(res, err.message, 409);
    throw err;
  }

  notifyAttaAssignment(out.created.riderUserId, { id, request_number: out.request.request_number }, taskType, out.created.taskId);
  notifyRiderTasksCancelled(out.created.displaced, { id, order_number: out.request.request_number }, 'Reassigned to another rider');
  logger.info('Atta rider assigned', { attaRequestId: id, riderId: rider_id, taskType, by: req.user?.id });
  successResponse(res, { task_id: out.created.taskId, request_id: id, task_type: taskType }, 'Rider assigned');
});

// ============================================================================
// CATEGORY MANAGEMENT
// ============================================================================

/**
 * Get all categories (admin - includes inactive)
 * GET /api/admin/categories
 */
