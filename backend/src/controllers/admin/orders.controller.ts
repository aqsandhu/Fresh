// ============================================================================
// ADMIN CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse, paginatedResponse } from '../../utils/response';
import { generateSlug, normalizePhoneNumber } from '../../utils/validators';
import { emitOrderUpdate, emitToUser, emitToAdmins } from '../../config/socket';
import { deleteFileFromStorage } from '../../config/storage';
import logger from '../../utils/logger';
import {
  resolveCityScope,
  cityIdClause,
  orderCityClause,
  customerCityExistsClause,
  orderCityMatchSql,
  addressCityMatchSql,
  addressCityWhereClause,
  requireCityScope,
} from '../../utils/cityScope';
import { parseTagsInput, tagSearchSql } from '../../utils/productTags';
import {
  fetchBannerSettings,
  upsertBannerSettings,
  fetchWhatsAppOrderSettings,
  fetchWhatsAppOrderSettingsAll,
  upsertWhatsAppOrderSettings,
  upsertWhatsAppOrderSettingsBulk,
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
} from '../../utils/siteSettings';
import { loadAdminSession } from '../../utils/adminSession';

const SALT_ROUNDS = 12;

/**
 * Current admin session (fresh permissions from DB)
 * GET /api/admin/me
 */

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

  // Get orders
  const ordersSql = `
    SELECT 
      o.id, o.order_number, o.status, o.source,
      o.subtotal, o.discount_amount, o.delivery_charge, o.tax_amount, o.total_amount,
      o.payment_method, o.payment_status, o.paid_amount,
      o.placed_at, o.delivered_at, o.show_customer_phone,
      o.address_id, o.delivery_address_snapshot,
      u.id as customer_id, u.full_name as customer_name, u.phone as customer_phone,
      r.id as rider_id, ru.full_name as rider_name,
      ts.slot_name, o.requested_delivery_date,
      ST_Y(addr.location::geometry) as address_latitude,
      ST_X(addr.location::geometry) as address_longitude,
      addr.door_picture_url as address_door_picture_url
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

  const orderResult = await query(
    `SELECT 
      o.*,
      u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email,
      r.id as rider_id, ru.full_name as rider_name, ru.phone as rider_phone,
      ts.slot_name, ts.start_time, ts.end_time,
      dcr.rule_name as delivery_rule_applied,
      ST_Y(addr.location::geometry) as address_latitude,
      ST_X(addr.location::geometry) as address_longitude,
      addr.door_picture_url as address_door_picture_url
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

  // Get order items
  const itemsResult = await query(
    `SELECT * FROM order_items WHERE order_id = $1`,
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

  const statusTimestamps: Record<string, string> = {
    confirmed: 'confirmed_at',
    preparing: 'preparing_at',
    ready_for_pickup: 'ready_at',
    out_for_delivery: 'out_for_delivery_at',
    delivered: 'delivered_at',
    cancelled: 'cancelled_at',
  };

  const timestampColumn = statusTimestamps[status];
  const timestampValue = timestampColumn ? `, ${timestampColumn} = NOW()` : '';

  const result = await query(
    `UPDATE orders 
     SET status = $1${timestampValue}, 
         cancellation_reason = COALESCE($2, cancellation_reason),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, reason, id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

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

  const result = await query(
    `UPDATE orders 
     SET payment_status = 'completed',
         paid_amount = total_amount,
         status = 'delivered',
         delivered_at = COALESCE(delivered_at, NOW()),
         updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
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
 * Toggle customer phone visibility on order
 * PUT /api/admin/orders/:id/toggle-phone
 */

export const togglePhoneVisibility = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { show_customer_phone } = req.body;

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

  // Get the order details
  const orderCheck = await query('SELECT time_slot_id, status FROM orders WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (orderCheck.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  if (['delivered', 'cancelled', 'refunded'].includes(orderCheck.rows[0].status)) {
    return errorResponse(res, 'Cannot assign rider to a completed or cancelled order', 400);
  }

  const timeSlotId = orderCheck.rows[0].time_slot_id;

  // Snapshot rider delivery charge at assignment time (only successful orders count later)
  let riderCharge = 0;
  if (timeSlotId) {
    const chargeResult = await query(
      'SELECT charge_per_order FROM rider_delivery_charges WHERE rider_id = $1 AND time_slot_id = $2',
      [rider_id, timeSlotId]
    );
    if (chargeResult.rows.length > 0) {
      riderCharge = parseFloat(chargeResult.rows[0].charge_per_order) || 0;
    }
  }

  // Update order: assign rider and set status to out_for_delivery
  const result = await query(
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

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  // Update rider status to busy
  await query(
    "UPDATE riders SET status = 'busy', updated_at = NOW() WHERE id = $1",
    [rider_id]
  );

  // Cancel any previous rider task for this order, then create new one
  await query(
    `UPDATE rider_tasks SET status = 'cancelled', completed_at = NOW() 
     WHERE order_id = $1 AND status IN ('assigned', 'in_progress')`,
    [id]
  );
  await query(
    `INSERT INTO rider_tasks (rider_id, task_type, order_id, status, assigned_at)
     VALUES ($1, 'delivery', $2, 'assigned', NOW())`,
    [rider_id, id]
  );

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
    whatsapp_number,
    customer_name,
    items,
    address_text,
    latitude,
    longitude,
    delivery_charge = 0,
    admin_notes,
  } = req.body;

  // Calculate totals
  let subtotal = 0;
  for (const item of items) {
    const productResult = await query(
      'SELECT price FROM products WHERE id = $1 AND is_active = TRUE',
      [item.product_id]
    );
    if (productResult.rows.length === 0) {
      return errorResponse(res, `Product not found: ${item.product_id}`, 400);
    }
    subtotal += parseFloat(productResult.rows[0].price) * item.quantity;
  }

  const totalAmount = subtotal + delivery_charge;

  // Build location value
  let locationSql = 'NULL';
  const baseParams: any[] = [
    whatsapp_number, customer_name, JSON.stringify(items),
    subtotal, delivery_charge, totalAmount,
    address_text,
  ];
  let paramIndex = 8;

  if (longitude != null && latitude != null) {
    locationSql = `ST_SetSRID(ST_MakePoint($${paramIndex}::float, $${paramIndex + 1}::float), 4326)::geography`;
    baseParams.push(longitude, latitude);
    paramIndex += 2;
  }

  baseParams.push(req.user?.id, admin_notes);

  const result = await query(
    `INSERT INTO whatsapp_orders (
      whatsapp_number, customer_name, items,
      subtotal, delivery_charge, total_amount,
      address_text, location,
      entered_by, admin_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 
      ${locationSql},
      $${paramIndex}, $${paramIndex + 1}
    ) RETURNING *`,
    baseParams
  );

  logger.info('WhatsApp order created', { orderId: result.rows[0].id, createdBy: req.user?.id });

  createdResponse(res, result.rows[0], 'WhatsApp order created successfully');
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

  const statusTimestamps: Record<string, string> = {
    confirmed: 'confirmed_at',
    preparing: 'preparing_at',
    ready_for_pickup: 'ready_at',
    out_for_delivery: 'out_for_delivery_at',
    delivered: 'delivered_at',
    cancelled: 'cancelled_at',
  };

  const timestampColumn = statusTimestamps[status];
  const timestampValue = timestampColumn ? `, ${timestampColumn} = NOW()` : '';

  const result = await query(
    `UPDATE orders 
     SET status = $1${timestampValue}, 
         cancellation_reason = COALESCE($2, cancellation_reason),
         updated_at = NOW()
     WHERE id = ANY($3::uuid[]) AND deleted_at IS NULL
     RETURNING *`,
    [status, reason || null, order_ids]
  );

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
    status,
    updatedBy: req.user?.id,
  });

  successResponse(res, {
    updated: result.rows.length,
    orders: result.rows,
  }, `${result.rows.length} order(s) updated successfully`);
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
