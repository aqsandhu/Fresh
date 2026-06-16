// ============================================================================
// ADMIN CONTROLLER — orders, whatsapp orders, atta requests
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse } from '../../utils/response';
import { emitOrderUpdate, emitToUser, emitToAdmins } from '../../config/socket';
import logger from '../../utils/logger';
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
import { roundMoney } from '../../utils/money';
import { resolveUnitPrice, normalizeProductUnit, stockUnitsNeeded } from '../../utils/unitPricing';
import { hasVariableWeightColumns } from '../../config/productSchema';
import { hasWhatsappLinkColumns } from '../../config/whatsappOrderSchema';
import { hasUrgentDeliveryColumns } from '../../config/orderSchema';

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

  let whereSql = `WHERE o.deleted_at IS NULL`;

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
    whereSql += ` AND DATE(o.placed_at) >= $${paramIndex++}`;
    params.push(date_from);
  }

  if (date_to) {
    whereSql += ` AND DATE(o.placed_at) <= $${paramIndex++}`;
    params.push(date_to);
  }

  if (search) {
    whereSql += ` AND (o.order_number ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const cityFilter = orderCityClause(scope, 'o', 'addr', params, paramIndex);
  whereSql += cityFilter.sql;
  paramIndex = cityFilter.nextIndex;

  // Count total
  const countResult = await query(
    `SELECT COUNT(*) FROM orders o JOIN users u ON o.user_id = u.id LEFT JOIN riders r ON o.rider_id = r.id LEFT JOIN users ru ON r.user_id = ru.id LEFT JOIN addresses addr ON o.address_id = addr.id ${whereSql}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const urgentCol = (await hasUrgentDeliveryColumns())
    ? 'o.is_urgent_delivery, o.urgent_delivery_eta,'
    : '';

  // Get orders
  const ordersSql = `
    SELECT
      o.id, o.order_number, o.status, o.source,
      ${urgentCol}
      o.subtotal, o.discount_amount, o.delivery_charge, o.tax_amount, o.total_amount,
      o.payment_method, o.payment_status, o.paid_amount,
      o.placed_at, o.delivered_at, o.show_customer_phone,
      o.address_id, o.delivery_address_snapshot,
      u.id as customer_id, u.full_name as customer_name, u.phone as customer_phone,
      r.id as rider_id, ru.full_name as rider_name,
      ts.slot_name, o.requested_delivery_date,
      ST_Y(addr.location::geometry) as address_latitude,
      ST_X(addr.location::geometry) as address_longitude,
      COALESCE(
        NULLIF(addr.door_picture_url, ''),
        o.delivery_address_snapshot->>'door_picture_url'
      ) as address_door_picture_url
    FROM orders o
    JOIN users u ON o.user_id = u.id
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    LEFT JOIN addresses addr ON o.address_id = addr.id
    ${whereSql}
    ORDER BY o.placed_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(ordersSql, params);

  successResponse(res, {
    orders: result.rows,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
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

  const orderResult = await query(
    `SELECT 
      o.*,
      u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email,
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
    JOIN users u ON o.user_id = u.id
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
  try {
    updatedRow = await withTransaction(async (client) => {
      const orderResult = await client.query(
        'SELECT id, status, time_slot_id FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
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

      const result = await client.query(
        `UPDATE orders
         SET status = $1${timestampValue},
             cancellation_reason = COALESCE($2, cancellation_reason),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [status, reason, id]
      );

      // Cancelling releases what the order consumed at creation.
      if (status === 'cancelled' && order.status !== 'cancelled') {
        await restoreOrderInventory(client, order);
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

  // Notify admins
  emitToAdmins('order:status_updated', {
    orderId: id,
    orderNumber: order.order_number,
    status,
    updatedBy: req.user?.id,
  });

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
  const result = await query(
    `UPDATE orders
     SET payment_status = 'completed',
         paid_amount = total_amount,
         status = 'delivered',
         delivered_at = COALESCE(delivered_at, NOW()),
         updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
       AND status NOT IN ('cancelled', 'refunded')
     RETURNING *`,
    [id]
  );

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
  await query(
    `UPDATE rider_tasks 
     SET status = 'completed', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
     WHERE order_id = $1 AND status != 'completed'`,
    [id]
  );

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

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  let updatedOrder: any = null;
  try {
    updatedOrder = await withTransaction(async (client) => {
      const orderRes = await client.query(
        `SELECT id, status, delivery_charge, discount_amount, coupon_discount, tax_amount
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

      const itemRes = await client.query(
        `SELECT oi.id, oi.unit_price,
                COALESCE(p.unit_value, 1) AS unit_value,
                COALESCE(p.is_variable_weight, FALSE) AS is_variable_weight
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
      return upd.rows[0];
    });
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  logger.info('Order item weight updated', { orderId: id, itemId, weight, updatedBy: req.user?.id });
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

  successResponse(res, result.rows[0], 'Phone visibility updated successfully');
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

  // Check if rider exists and is verified (allow busy riders for multiple orders)
  const riderResult = await query(
    `SELECT r.id, r.status, u.full_name 
     FROM riders r
     JOIN users u ON r.user_id = u.id
     WHERE r.id = $1 AND r.verification_status = 'verified' AND r.deleted_at IS NULL`,
    [rider_id]
  );

  if (riderResult.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found or not verified');
  }

  const rider = riderResult.rows[0];

  // Only reject offline/on_leave riders — allow available and busy (multiple orders per rider)
  if (rider.status === 'offline' || rider.status === 'on_leave') {
    return errorResponse(res, `Rider is ${rider.status}. Cannot assign orders.`, 400);
  }

  // All writes (order update + rider status + task swap) must be atomic — a
  // partial failure previously left the order marked out_for_delivery while
  // the rider/task rows said otherwise. The row lock also serialises two
  // admins assigning the same order at once.
  let result: { rows: any[] };
  try {
    result = await withTransaction(async (client) => {
      const orderCheck = await client.query(
        'SELECT time_slot_id, status FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (orderCheck.rows.length === 0) {
        throw Object.assign(new Error('Order not found'), { http: 404 });
      }
      if (['delivered', 'cancelled', 'refunded'].includes(orderCheck.rows[0].status)) {
        throw Object.assign(
          new Error('Cannot assign rider to a completed or cancelled order'),
          { http: 400 }
        );
      }

      const timeSlotId = orderCheck.rows[0].time_slot_id;

      // Snapshot rider delivery charge at assignment time (only successful orders count later)
      let riderCharge = 0;
      if (timeSlotId) {
        const chargeResult = await client.query(
          'SELECT charge_per_order FROM rider_delivery_charges WHERE rider_id = $1 AND time_slot_id = $2',
          [rider_id, timeSlotId]
        );
        if (chargeResult.rows.length > 0) {
          riderCharge = parseFloat(chargeResult.rows[0].charge_per_order) || 0;
        }
      }

      // Deliberate fast-path outside the strict state machine: assigning a rider
      // implies the order is on its way, so any live status (pending/confirmed/
      // preparing/ready) jumps straight to out_for_delivery. Dead orders are
      // rejected above.
      const updated = await client.query(
        `UPDATE orders
         SET rider_id = $1,
             assigned_at = NOW(),
             rider_delivery_charge = $3,
             status = 'out_for_delivery',
             out_for_delivery_at = COALESCE(out_for_delivery_at, NOW()),
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [rider_id, id, riderCharge]
      );

      // Update rider status to busy
      await client.query(
        "UPDATE riders SET status = 'busy', updated_at = NOW() WHERE id = $1",
        [rider_id]
      );

      // Cancel any previous rider task for this order, then create new one
      await client.query(
        `UPDATE rider_tasks SET status = 'cancelled', completed_at = NOW()
         WHERE order_id = $1 AND status IN ('assigned', 'in_progress')`,
        [id]
      );
      await client.query(
        `INSERT INTO rider_tasks (rider_id, task_type, order_id, status, assigned_at)
         VALUES ($1, 'delivery', $2, 'assigned', NOW())`,
        [rider_id, id]
      );

      return updated;
    });
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, 'Order not found');
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  logger.info('Rider assigned to order', { orderId: id, riderId: rider_id, assignedBy: req.user?.id });

  // Emit real-time events
  const assignedOrder = result.rows[0];
  emitOrderUpdate(id, {
    orderId: id,
    status: 'out_for_delivery',
    riderId: rider_id,
    riderName: rider.full_name,
    message: `Rider ${rider.full_name} assigned to order #${assignedOrder.order_number}`,
  });

  // Notify customer
  emitToUser(assignedOrder.user_id, 'order:rider_assigned', {
    orderId: id,
    orderNumber: assignedOrder.order_number,
    riderName: rider.full_name,
    status: 'out_for_delivery',
    message: `Rider ${rider.full_name} is on the way with your order #${assignedOrder.order_number}!`,
  });

  // Notify rider
  const riderUserResult = await query(
    'SELECT user_id FROM riders WHERE id = $1',
    [rider_id]
  );
  if (riderUserResult.rows.length > 0) {
    emitToUser(riderUserResult.rows[0].user_id, 'rider:new_assignment', {
      orderId: id,
      orderNumber: assignedOrder.order_number,
      message: `New delivery assignment: Order #${assignedOrder.order_number}`,
    });
  }

  successResponse(res, {
    order: result.rows[0],
    rider: {
      id: rider.id,
      name: rider.full_name,
    },
  }, 'Rider assigned successfully');
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
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse(res, 'Add at least one item.', 400);
  }
  // A WhatsApp order is placed as a REAL order, so it needs a registered
  // customer + one of their saved addresses (use the phone lookup to pick them).
  if (!user_id || !address_id) {
    return errorResponse(res, 'Select an existing customer and one of their saved addresses.', 400);
  }

  const scope = await resolveCityScope(req);
  const isUrgent = urgent_delivery === true || urgent_delivery === 'true';

  // Validate customer + address (IDOR-safe: the address must belong to the user).
  const userRes = await query(
    `SELECT id, full_name, phone FROM users WHERE id = $1 AND role = 'customer' AND deleted_at IS NULL`,
    [user_id]
  );
  if (userRes.rows.length === 0) return errorResponse(res, 'Customer not found.', 400);
  const customer = userRes.rows[0];

  const addrRes = await query(
    `SELECT a.*, ST_X(a.location::geometry) AS lng, ST_Y(a.location::geometry) AS lat
       FROM addresses a WHERE a.id = $1 AND a.user_id = $2 AND a.deleted_at IS NULL`,
    [address_id, user_id]
  );
  if (addrRes.rows.length === 0) return errorResponse(res, 'Address not found for this customer.', 400);
  const address = addrRes.rows[0];

  // Resolve the delivery city from the address (mirrors the customer flow),
  // falling back to the admin's scoped city so the order is visible to them.
  let orderCityId: string | null = scope.cityId ?? null;
  if (address.city) {
    const cityRow = await query(
      `SELECT id FROM service_cities WHERE LOWER(name) = LOWER($1) AND is_active = TRUE LIMIT 1`,
      [address.city]
    );
    if (cityRow.rows[0]?.id) orderCityId = cityRow.rows[0].id;
  }

  let order: any;
  try {
    order = await withTransaction(async (client) => {
      // Price each line by its unit; track the free-delivery-eligible subtotal.
      let subtotal = 0;
      let vegFruitSubtotal = 0;
      const lines: any[] = [];
      for (const item of items) {
        const pr = await client.query(
          `SELECT p.name_en, p.primary_image, p.sku, p.price, p.half_kg_price, p.quarter_kg_price,
                  p.half_dozen_price, cat.qualifies_for_free_delivery
             FROM products p JOIN categories cat ON p.category_id = cat.id
            WHERE p.id = $1 AND p.is_active = TRUE FOR UPDATE`,
          [item.product_id]
        );
        if (pr.rows.length === 0) {
          throw Object.assign(new Error(`Product not found: ${item.product_id}`), { http: 400 });
        }
        const p = pr.rows[0];
        const unit = normalizeProductUnit(item.unit);
        const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
        const unitPrice = resolveUnitPrice(p, unit);
        const lineTotal = roundMoney(unitPrice * qty);
        subtotal += lineTotal;
        if (p.qualifies_for_free_delivery === true) vegFruitSubtotal += lineTotal;
        lines.push({ product_id: item.product_id, name: p.name_en, image: p.primary_image, sku: p.sku, unit, unitPrice, qty, lineTotal });
      }
      subtotal = roundMoney(subtotal);

      // Delivery settings.
      const sset = await client.query(
        `SELECT key, value FROM site_settings WHERE key IN ('delivery_base_charge','delivery_free_delivery_threshold','delivery_urgent_charge','delivery_urgent_eta')`
      );
      let baseCharge = 100, freeThreshold = 500, urgentCharge = 0, urgentEta = '';
      for (const r of sset.rows) {
        if (r.key === 'delivery_base_charge') baseCharge = parseFloat(r.value) || baseCharge;
        if (r.key === 'delivery_free_delivery_threshold') freeThreshold = parseFloat(r.value) || freeThreshold;
        if (r.key === 'delivery_urgent_charge') urgentCharge = parseFloat(r.value) || 0;
        if (r.key === 'delivery_urgent_eta') urgentEta = String(r.value || '').trim();
      }

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
        written_address: address.written_address,
        landmark: address.landmark,
        house_number: address.house_number,
        area_name: address.area_name,
        city: address.city,
        province: address.province,
        postal_code: address.postal_code,
        door_picture_url: address.door_picture_url || '',
        location: { latitude: address.lat ?? null, longitude: address.lng ?? null },
      });

      const orderRes = await client.query(
        `INSERT INTO orders (
          user_id, address_id, delivery_address_snapshot, time_slot_id,
          subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
          payment_method, payment_status, status, source, customer_notes, city_id
        ) VALUES ($1,$2,$3,$4,$5,0,$6,0,$7,'cash_on_delivery','pending','pending','whatsapp',$8,$9)
        RETURNING *`,
        [
          customer.id, address.id, snapshot, effectiveSlotId,
          subtotal, deliveryCharge, totalAmount, admin_notes || null, orderCityId,
        ]
      );
      const o = orderRes.rows[0];

      if (isUrgent && (await hasUrgentDeliveryColumns())) {
        await client.query(`UPDATE orders SET is_urgent_delivery = TRUE, urgent_delivery_eta = $1 WHERE id = $2`, [urgentEta || null, o.id]);
        o.is_urgent_delivery = true;
        o.urgent_delivery_eta = urgentEta || null;
      }

      for (const l of lines) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, unit)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [o.id, l.product_id, l.name, l.image, l.sku, l.unitPrice, l.qty, l.lineTotal, l.unit]
        );
        const need = stockUnitsNeeded(l.qty, l.unit);
        await client.query(
          `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2`,
          [need, l.product_id]
        );
      }

      return o;
    });
  } catch (err: any) {
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  logger.info('WhatsApp order placed as real order', { orderId: order.id, by: req.user?.id });
  emitToAdmins('order:new', {
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

    const result = await client.query(
      `UPDATE orders
       SET status = $1${timestampValue},
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
        }
      }
    }

    return { updatedRows: result.rows, skipped: skippedLocal };
  });

  const result = { rows: updatedRows };

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

    emitToAdmins('order:status_updated', {
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

  const result = await query(
    `UPDATE orders SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, order_number`,
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
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

  let sql = `
    FROM atta_requests ar
    JOIN users u ON ar.user_id = u.id
    LEFT JOIN addresses a ON ar.address_id = a.id
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    sql += ` AND ar.status = $${paramIndex++}`;
    params.push(status);
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get requests
  const requestsSql = `
    SELECT 
      ar.id, ar.request_number, ar.status,
      ar.wheat_quality, ar.wheat_quantity_kg,
      ar.flour_type, ar.actual_flour_quantity_kg,
      ar.service_charge, ar.milling_charge, ar.delivery_charge, ar.total_amount,
      ar.payment_status,
      u.full_name as customer_name, u.phone as customer_phone,
      a.written_address as pickup_address,
      ar.created_at
    ${sql}
    ORDER BY ar.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(requestsSql, params);

  successResponse(res, {
    requests: result.rows,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
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

  let sql = `UPDATE atta_requests SET status = $1, ${update.column} = NOW()`;
  const params: any[] = [status];
  let paramIndex = 2;

  if (update.riderColumn && rider_id) {
    sql += `, ${update.riderColumn} = $${paramIndex++}`;
    params.push(rider_id);
  }

  sql += `, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;
  params.push(id);

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Atta request not found');
  }

  successResponse(res, result.rows[0], 'Atta request status updated successfully');
});

// ============================================================================
// CATEGORY MANAGEMENT
// ============================================================================

/**
 * Get all categories (admin - includes inactive)
 * GET /api/admin/categories
 */
