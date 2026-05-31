// ============================================================================
// ADMIN CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse, paginatedResponse } from '../utils/response';
import { generateSlug, normalizePhoneNumber } from '../utils/validators';
import { emitOrderUpdate, emitToUser, emitToAdmins } from '../config/socket';
import { deleteFileFromStorage } from '../config/storage';
import logger from '../utils/logger';
import {
  resolveCityScope,
  cityIdClause,
  orderCityClause,
  customerCityExistsClause,
  requireCityScope,
} from '../utils/cityScope';
import { parseTagsInput, tagSearchSql } from '../utils/productTags';
import { fetchBannerSettings, upsertBannerSettings, upsertGlobalSiteSetting } from '../utils/siteSettings';
import { loadAdminSession } from '../utils/adminSession';

const SALT_ROUNDS = 12;

/**
 * Current admin session (fresh permissions from DB)
 * GET /api/admin/me
 */
export const getAdminMe = asyncHandler(async (req: Request, res: Response) => {
  const session = await loadAdminSession(req.user!.id);
  if (!session) {
    return notFoundResponse(res, 'Admin user not found');
  }
  successResponse(res, { user: session }, 'Admin session retrieved');
});

/**
 * Get dashboard statistics
 * GET /api/admin/dashboard
 */
export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const orderParams: unknown[] = [];
  let orderFilter = '';
  if (!scope.unrestricted && scope.cityId && scope.cityName) {
    orderParams.push(scope.cityId, scope.cityName);
    orderFilter = ` AND (
      city_id = $1
      OR LOWER(COALESCE(delivery_address_snapshot->>'city', '')) = LOWER($2)
    )`;
  }

  // Today's stats
  const todayStats = await query(
    `SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_sales,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
      COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
      COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_orders,
      COUNT(CASE WHEN status = 'out_for_delivery' THEN 1 END) as out_for_delivery_orders,
      COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders
    FROM orders
    WHERE DATE(placed_at) = CURRENT_DATE
    AND deleted_at IS NULL${orderFilter}`,
    orderParams
  );

  // Weekly stats
  const weeklyStats = await query(
    `SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_sales
    FROM orders
    WHERE placed_at >= CURRENT_DATE - INTERVAL '7 days'
    AND deleted_at IS NULL${orderFilter}`,
    orderParams
  );

  // Monthly stats
  const monthlyStats = await query(
    `SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_sales
    FROM orders
    WHERE placed_at >= CURRENT_DATE - INTERVAL '30 days'
    AND deleted_at IS NULL${orderFilter}`,
    orderParams
  );

  let productFilter = '';
  const productParams: unknown[] = [];
  if (!scope.unrestricted && scope.cityId) {
    productParams.push(scope.cityId);
    productFilter = ' AND city_id = $1';
  }

  // Low stock products
  const lowStockProducts = await query(
    `SELECT 
      id, name_en, name_ur, stock_quantity, low_stock_threshold
    FROM products
    WHERE stock_quantity <= low_stock_threshold
    AND is_active = TRUE${productFilter}
    LIMIT 10`,
    productParams
  );

  let recentOrderJoin = '';
  let recentOrderFilter = '';
  const recentParams: unknown[] = [];
  if (!scope.unrestricted && scope.cityId && scope.cityName) {
    recentOrderJoin = ' LEFT JOIN addresses addr ON o.address_id = addr.id';
    recentParams.push(scope.cityId, scope.cityName);
    recentOrderFilter = ` AND (
      o.city_id = $1
      OR LOWER(COALESCE(addr.city, '')) = LOWER($2)
      OR LOWER(COALESCE(o.delivery_address_snapshot->>'city', '')) = LOWER($2)
    )`;
  }

  // Recent orders
  const recentOrders = await query(
    `SELECT 
      o.id, o.order_number, o.status, o.total_amount,
      u.full_name as customer_name, u.phone as customer_phone,
      o.placed_at
    FROM orders o
    JOIN users u ON o.user_id = u.id${recentOrderJoin}
    WHERE o.deleted_at IS NULL${recentOrderFilter}
    ORDER BY o.placed_at DESC
    LIMIT 10`,
    recentParams
  );

  let riderFilter = '';
  const riderParams: unknown[] = [];
  if (!scope.unrestricted && scope.cityId) {
    riderParams.push(scope.cityId);
    riderFilter = ' AND city_id = $1';
  }

  // Rider stats
  const riderStats = await query(
    `SELECT 
      COUNT(*) as total_riders,
      COUNT(CASE WHEN status = 'available' THEN 1 END) as available_riders,
      COUNT(CASE WHEN status = 'busy' THEN 1 END) as busy_riders,
      COUNT(CASE WHEN verification_status = 'pending' THEN 1 END) as pending_verification
    FROM riders
    WHERE deleted_at IS NULL${riderFilter}`,
    riderParams
  );

  // Atta requests stats
  const attaStats = await query(
    `SELECT 
      COUNT(*) as total_requests,
      COUNT(CASE WHEN status = 'pending_pickup' THEN 1 END) as pending_pickup,
      COUNT(CASE WHEN status = 'at_mill' OR status = 'milling' THEN 1 END) at_mill
    FROM atta_requests
    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`
  );

  successResponse(res, {
    today: todayStats.rows[0],
    weekly: weeklyStats.rows[0],
    monthly: monthlyStats.rows[0],
    lowStockProducts: lowStockProducts.rows,
    recentOrders: recentOrders.rows,
    riders: riderStats.rows[0],
    attaRequests: attaStats.rows[0],
  }, 'Dashboard statistics retrieved successfully');
});

/**
 * Get all orders with filters
 * GET /api/admin/orders
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
export const getRiders = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const { status, verification_status, page = 1, limit = 20 } = req.query;

  let sql = `
    FROM riders r
    JOIN users u ON r.user_id = u.id
    WHERE r.deleted_at IS NULL
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    sql += ` AND r.status = $${paramIndex++}`;
    params.push(status);
  }

  if (verification_status) {
    sql += ` AND r.verification_status = $${paramIndex++}`;
    params.push(verification_status);
  }

  const riderCity = cityIdClause(scope, 'r', params, paramIndex);
  sql += riderCity.sql;
  paramIndex = riderCity.nextIndex;

  // Count total
  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get riders
  const ridersSql = `
    SELECT 
      r.id, r.cnic, r.vehicle_type, r.vehicle_number,
      r.status, r.verification_status,
      r.rating, r.total_deliveries, r.total_earnings,
      ST_X(r.current_location::geometry) as longitude,
      ST_Y(r.current_location::geometry) as latitude,
      r.location_updated_at,
      u.full_name, u.phone, u.email, u.avatar_url
    ${sql}
    ORDER BY r.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(ridersSql, params);

  successResponse(res, {
    riders: result.rows,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  }, 'Riders retrieved successfully');
});

/**
 * Create a rider
 * POST /api/admin/riders
 */
export const createRider = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const scopeErr = requireCityScope(scope);
  if (scopeErr) {
    return errorResponse(res, scopeErr, 400);
  }

  const {
    full_name, phone, email, password, cnic,
    vehicle_type, vehicle_number,
    emergency_contact_name, emergency_contact_phone,
    bank_account_title, bank_account_number, bank_name,
    driving_license_number,
  } = req.body;

  if (!full_name || !phone || !password || !cnic || !vehicle_type || !vehicle_number) {
    return errorResponse(res, 'full_name, phone, password, cnic, vehicle_type, vehicle_number are required', 400);
  }

  const normalizedPhone = normalizePhoneNumber(phone);

  // Check duplicate phone
  const existing = await query('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
  if (existing.rows.length > 0) {
    return errorResponse(res, 'A user with this phone number already exists', 409);
  }

  // Check duplicate CNIC
  const existCnic = await query('SELECT id FROM riders WHERE cnic = $1 AND deleted_at IS NULL', [cnic]);
  if (existCnic.rows.length > 0) {
    return errorResponse(res, 'A rider with this CNIC already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  // req.file.url is the Supabase public URL set by the upload middleware.
  const avatarUrl = req.file?.url || null;

  let result;
  try {
    result = await withTransaction(async (client) => {
      // Create user
      const userRes = await client.query(
        `INSERT INTO users (phone, full_name, email, password_hash, role, is_phone_verified, avatar_url)
         VALUES ($1, $2, $3, $4, 'rider', true, $5)
         RETURNING id, phone, full_name, email, avatar_url`,
        [normalizedPhone, full_name, email || null, passwordHash, avatarUrl]
      );
      const user = userRes.rows[0];

      // Create rider
      const riderRes = await client.query(
        `INSERT INTO riders (
          user_id, cnic, vehicle_type, vehicle_number,
          driving_license_number,
          emergency_contact_name, emergency_contact_phone,
          bank_account_title, bank_account_number, bank_name,
          cnic_front_image, cnic_back_image,
          verification_status, created_by, city_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending','pending','verified',$11,$12)
         RETURNING *`,
        [
          user.id, cnic, vehicle_type, vehicle_number,
          driving_license_number || null,
          emergency_contact_name || null, emergency_contact_phone || null,
          bank_account_title || null, bank_account_number || null, bank_name || null,
          req.user?.id,
          scope.cityId,
        ]
      );

      return { user, rider: riderRes.rows[0] };
    });
  } catch (err: any) {
    if (err.code === '23505') {
      const detail = err.detail || '';
      if (detail.includes('cnic')) {
        return errorResponse(res, 'A rider with this CNIC already exists', 409);
      }
      if (detail.includes('phone')) {
        return errorResponse(res, 'A user with this phone number already exists', 409);
      }
      return errorResponse(res, 'Duplicate entry detected', 409);
    }
    throw err;
  }

  logger.info('Rider created', { riderId: result.rider.id, createdBy: req.user?.id });

  createdResponse(res, {
    ...result.rider,
    full_name: result.user.full_name,
    phone: result.user.phone,
    email: result.user.email,
    avatar_url: result.user.avatar_url,
  }, 'Rider created successfully');
});

/**
 * Update a rider
 * PUT /api/admin/riders/:id
 */
export const updateRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    full_name, phone, email, password, cnic,
    vehicle_type, vehicle_number,
    emergency_contact_name, emergency_contact_phone,
    bank_account_title, bank_account_number, bank_name,
    driving_license_number,
  } = req.body;

  // Get rider + user_id
  const riderCheck = await query(
    'SELECT r.id, r.user_id FROM riders r WHERE r.id = $1 AND r.deleted_at IS NULL', [id]
  );
  if (riderCheck.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  const userId = riderCheck.rows[0].user_id;
  const avatarUrl = req.file?.url || undefined;

  await withTransaction(async (client) => {
    // Update user
    const userFields: string[] = [];
    const userParams: any[] = [];
    let idx = 1;

    if (full_name) { userFields.push(`full_name = $${idx++}`); userParams.push(full_name); }
    if (phone) {
      const np = normalizePhoneNumber(phone);
      userFields.push(`phone = $${idx++}`); userParams.push(np);
    }
    if (email !== undefined) { userFields.push(`email = $${idx++}`); userParams.push(email || null); }
    if (password) {
      const ph = await bcrypt.hash(password, SALT_ROUNDS);
      userFields.push(`password_hash = $${idx++}`); userParams.push(ph);
    }
    if (avatarUrl) { userFields.push(`avatar_url = $${idx++}`); userParams.push(avatarUrl); }

    if (userFields.length > 0) {
      userFields.push(`updated_at = NOW()`);
      userParams.push(userId);
      await client.query(
        `UPDATE users SET ${userFields.join(', ')} WHERE id = $${idx}`,
        userParams
      );
    }

    // Update rider
    const riderFields: string[] = [];
    const riderParams: any[] = [];
    let ri = 1;

    if (cnic) { riderFields.push(`cnic = $${ri++}`); riderParams.push(cnic); }
    if (vehicle_type) { riderFields.push(`vehicle_type = $${ri++}`); riderParams.push(vehicle_type); }
    if (vehicle_number) { riderFields.push(`vehicle_number = $${ri++}`); riderParams.push(vehicle_number); }
    if (driving_license_number !== undefined) { riderFields.push(`driving_license_number = $${ri++}`); riderParams.push(driving_license_number || null); }
    if (emergency_contact_name !== undefined) { riderFields.push(`emergency_contact_name = $${ri++}`); riderParams.push(emergency_contact_name || null); }
    if (emergency_contact_phone !== undefined) { riderFields.push(`emergency_contact_phone = $${ri++}`); riderParams.push(emergency_contact_phone || null); }
    if (bank_account_title !== undefined) { riderFields.push(`bank_account_title = $${ri++}`); riderParams.push(bank_account_title || null); }
    if (bank_account_number !== undefined) { riderFields.push(`bank_account_number = $${ri++}`); riderParams.push(bank_account_number || null); }
    if (bank_name !== undefined) { riderFields.push(`bank_name = $${ri++}`); riderParams.push(bank_name || null); }

    if (riderFields.length > 0) {
      riderFields.push(`updated_at = NOW()`);
      riderFields.push(`updated_by = $${ri++}`); riderParams.push(req.user?.id);
      riderParams.push(id);
      await client.query(
        `UPDATE riders SET ${riderFields.join(', ')} WHERE id = $${ri}`,
        riderParams
      );
    }
  });

  // Fetch updated rider
  const updated = await query(
    `SELECT r.*, u.full_name, u.phone, u.email, u.avatar_url
     FROM riders r JOIN users u ON r.user_id = u.id
     WHERE r.id = $1`, [id]
  );

  successResponse(res, updated.rows[0], 'Rider updated successfully');
});

/**
 * Delete a rider (soft delete)
 * DELETE /api/admin/riders/:id
 */
export const deleteRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    "UPDATE riders SET deleted_at = NOW(), status = 'offline' WHERE id = $1 AND deleted_at IS NULL RETURNING id",
    [id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  successResponse(res, null, 'Rider deleted successfully');
});

/**
 * Verify a rider
 * PATCH /api/admin/riders/:id/verify
 */
export const verifyRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { verification_status } = req.body;

  if (!['verified', 'rejected', 'pending'].includes(verification_status)) {
    return errorResponse(res, 'Invalid verification status', 400);
  }

  const result = await query(
    `UPDATE riders SET verification_status = $1, updated_at = NOW(), updated_by = $2
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [verification_status, req.user?.id, id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  successResponse(res, result.rows[0], 'Rider verification updated');
});

/**
 * Update rider status
 * PATCH /api/admin/riders/:id/status  
 */
export const updateRiderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['available', 'busy', 'offline', 'on_leave'].includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }

  const result = await query(
    'UPDATE riders SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *',
    [status, id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  successResponse(res, result.rows[0], 'Status updated');
});

/**
 * Get rider live location
 * GET /api/admin/riders/:id/location
 */
export const getRiderLocation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await query(
    `SELECT r.id, r.status,
      ST_X(r.current_location::geometry) as longitude,
      ST_Y(r.current_location::geometry) as latitude,
      r.location_accuracy,
      r.location_updated_at,
      u.full_name, u.phone
     FROM riders r
     JOIN users u ON r.user_id = u.id
     WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  const rider = result.rows[0];
  successResponse(res, {
    id: rider.id,
    fullName: rider.full_name,
    phone: rider.phone,
    status: rider.status,
    latitude: rider.latitude,
    longitude: rider.longitude,
    accuracy: rider.location_accuracy != null ? parseFloat(rider.location_accuracy) : null,
    locationUpdatedAt: rider.location_updated_at,
  }, 'Rider location retrieved');
});

/**
 * Get rider stats (daily, weekly, monthly orders + payment tracking)
 * GET /api/admin/riders/:id/stats
 */
export const getRiderStats = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Verify rider exists
  const riderCheck = await query(
    `SELECT r.id, r.total_deliveries, r.total_earnings, u.full_name
     FROM riders r JOIN users u ON r.user_id = u.id
     WHERE r.id = $1 AND r.deleted_at IS NULL`, [id]
  );
  if (riderCheck.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Monday of current week
  const dayOfWeek = now.getDay() || 7; // Sunday=7
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - dayOfWeek + 1);
  thisWeekStart.setHours(0, 0, 0, 0);

  // Monday of last week
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);

  // 1st of current month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 1st of last month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const statsQuery = `
    SELECT
      -- Today
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $2) as today_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $2), 0) as today_earnings,
      -- This week
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $3) as this_week_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $3), 0) as this_week_earnings,
      -- Last week
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $4 AND o.placed_at < $5) as last_week_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $4 AND o.placed_at < $5), 0) as last_week_earnings,
      -- This month
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $6) as this_month_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $6), 0) as this_month_earnings,
      -- Last month
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $7 AND o.placed_at < $8) as last_month_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $7 AND o.placed_at < $8), 0) as last_month_earnings,
      -- Total delivered (all time)
      COUNT(*) FILTER (WHERE o.status = 'delivered') as total_delivered,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered'), 0) as total_earned,
      -- Total collected from customers (COD)  
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0) as total_collected
    FROM orders o
    WHERE o.rider_id = $1
  `;

  const statsResult = await query(statsQuery, [
    id, todayStart,
    thisWeekStart.toISOString(),
    lastWeekStart.toISOString(), lastWeekEnd.toISOString(),
    thisMonthStart,
    lastMonthStart, lastMonthEnd,
  ]);

  const stats = statsResult.rows[0];

  // Payment: total_collected = all COD money rider holds
  // total_earned = rider's delivery charges earned
  // payment_pending = total_collected - total_earned (money rider owes to company)
  const totalCollected = parseFloat(stats.total_collected) || 0;
  const totalEarned = parseFloat(stats.total_earned) || 0;
  const paymentPending = totalCollected - totalEarned; // money rider must return

  // Get delivery charges config
  const chargesResult = await query(
    `SELECT rdc.id, rdc.charge_per_order, rdc.effective_from,
            ts.slot_name, ts.start_time, ts.end_time
     FROM rider_delivery_charges rdc
     JOIN time_slots ts ON rdc.time_slot_id = ts.id
     WHERE rdc.rider_id = $1
     ORDER BY ts.start_time`,
    [id]
  );

  successResponse(res, {
    rider: riderCheck.rows[0],
    stats: {
      today: { orders: parseInt(stats.today_orders), earnings: parseFloat(stats.today_earnings) },
      thisWeek: { orders: parseInt(stats.this_week_orders), earnings: parseFloat(stats.this_week_earnings) },
      lastWeek: { orders: parseInt(stats.last_week_orders), earnings: parseFloat(stats.last_week_earnings) },
      thisMonth: { orders: parseInt(stats.this_month_orders), earnings: parseFloat(stats.this_month_earnings) },
      lastMonth: { orders: parseInt(stats.last_month_orders), earnings: parseFloat(stats.last_month_earnings) },
    },
    payment: {
      totalCollected,
      totalEarned,
      paymentPending,
    },
    deliveryCharges: chargesResult.rows,
  }, 'Rider stats retrieved');
});

/**
 * Set/update rider delivery charges per time slot
 * PUT /api/admin/riders/:id/delivery-charges
 */
export const setRiderDeliveryCharges = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { charges } = req.body; // Array of { time_slot_id, charge_per_order }

  if (!Array.isArray(charges)) {
    return errorResponse(res, 'charges must be an array of { time_slot_id, charge_per_order }', 400);
  }

  // Verify rider exists
  const riderCheck = await query('SELECT id FROM riders WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (riderCheck.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  await withTransaction(async (client) => {
    for (const item of charges) {
      if (!item.time_slot_id || item.charge_per_order === undefined) continue;
      await client.query(
        `INSERT INTO rider_delivery_charges (rider_id, time_slot_id, charge_per_order, effective_from, created_by)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (rider_id, time_slot_id)
         DO UPDATE SET charge_per_order = $3, effective_from = NOW(), updated_at = NOW()`,
        [id, item.time_slot_id, item.charge_per_order, req.user?.id]
      );
    }
  });

  // Return updated charges
  const result = await query(
    `SELECT rdc.*, ts.slot_name, ts.start_time, ts.end_time
     FROM rider_delivery_charges rdc
     JOIN time_slots ts ON rdc.time_slot_id = ts.id
     WHERE rdc.rider_id = $1
     ORDER BY ts.start_time`,
    [id]
  );

  successResponse(res, result.rows, 'Rider delivery charges updated');
});

/**
 * Get all products (admin - no rate limit, includes inactive)
 * GET /api/admin/products
 */
export const getAdminProducts = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const {
    category, search, page = 1, limit = 20,
    sortBy = 'created_at', sortOrder = 'desc',
  } = req.query;

  let sql = `FROM products p JOIN categories c ON p.category_id = c.id WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  if (category) {
    sql += ` AND p.category_id = $${paramIndex}`;
    params.push(category); paramIndex++;
  }
  if (search && typeof search === 'string') {
    const sanitizedSearch = search.replace(/[%_\\]/g, '\\$&').trim().substring(0, 100);
    if (sanitizedSearch.length > 0) {
      sql += ` AND (
        p.name_en ILIKE $${paramIndex}
        OR p.name_ur ILIKE $${paramIndex}
        OR ${tagSearchSql(paramIndex)}
      )`;
      params.push(`%${sanitizedSearch}%`); paramIndex++;
    }
  }
  if (req.query.is_active !== undefined) {
    const raw = req.query.is_active;
    const active = raw === 'true' || raw === '1';
    sql += ` AND p.is_active = $${paramIndex}`;
    params.push(active); paramIndex++;
  }

  const productCity = cityIdClause(scope, 'p', params, paramIndex);
  sql += productCity.sql;
  paramIndex = productCity.nextIndex;

  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  const allowedSortFields = ['created_at', 'price', 'name_en', 'stock_quantity'];
  const allowedSortOrders = ['asc', 'desc'];
  const sortField = allowedSortFields.includes(sortBy as string) ? sortBy : 'created_at';
  const order = allowedSortOrders.includes((sortOrder as string)?.toLowerCase()) ? (sortOrder as string).toUpperCase() : 'DESC';

  const productsSql = `SELECT p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode, p.category_id, c.name_en as category_name, c.slug as category_slug, p.subcategory_id, p.price, p.compare_at_price, p.cost_price, p.half_kg_price, p.quarter_kg_price, p.half_dozen_price, p.unit_type, p.unit_value, p.stock_quantity, p.stock_status, p.primary_image, p.images, p.short_description, p.description_ur, p.description_en, p.is_active, p.is_featured, p.is_new_arrival, p.view_count, p.order_count, p.created_at, p.updated_at ${sql} ORDER BY p.${sortField} ${order} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(productsSql, params);
  paginatedResponse(res, result.rows, parseInt(page as string), parseInt(limit as string), total, 'Products retrieved successfully');
});

/**
 * Get product by ID (admin)
 * GET /api/admin/products/:id
 */
export const getAdminProductById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `SELECT p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.slug as category_slug,
      p.subcategory_id, p.price, p.compare_at_price, p.cost_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.low_stock_threshold,
      p.stock_status, p.track_inventory, p.primary_image, p.images,
      p.short_description, p.description_ur, p.description_en,
      p.attributes, p.meta_title, p.meta_description, p.tags,
      p.is_active, p.is_featured, p.is_new_arrival,
      p.view_count, p.order_count, p.created_at, p.updated_at
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.id = $1`, [id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Product not found');
  successResponse(res, result.rows[0], 'Product retrieved successfully');
});

/**
 * Create product
 * POST /api/admin/products
 */
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const scopeErr = requireCityScope(scope);
  if (scopeErr) {
    return errorResponse(res, scopeErr, 400);
  }

  const {
    name_ur,
    name_en,
    category_id,
    subcategory_id,
    price,
    compare_at_price,
    half_kg_price,
    quarter_kg_price,
    half_dozen_price,
    unit_type,
    unit_value,
    stock_quantity,
    description_ur,
    description_en,
    is_featured,
    is_new_arrival,
    tags,
  } = req.body;

  // Empty-string values come through multipart forms — coerce them to null
  // so the DB column stores NULL ("derive from price") instead of 0.
  const normPrice = (v: any) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const halfKg = normPrice(half_kg_price);
  const quarterKg = normPrice(quarter_kg_price);
  const halfDozen = normPrice(half_dozen_price);
  const productTags = parseTagsInput(tags);

  const slug = generateSlug(name_en);

  // Check if slug exists in this city
  const existingResult = await query(
    'SELECT id FROM products WHERE slug = $1 AND city_id = $2',
    [slug, scope.cityId]
  );
  if (existingResult.rows.length > 0) {
    return errorResponse(res, 'Product with similar name already exists', 409);
  }

  // Handle uploaded images. The upload middleware has already pushed each
  // file to Supabase Storage and attached the public URL on `f.url`.
  const uploadedFiles = req.files as Express.Multer.File[] | undefined;
  let primaryImage: string | null = null;
  let images: string[] = [];

  if (uploadedFiles && uploadedFiles.length > 0) {
    images = uploadedFiles.map(f => f.url || '').filter(Boolean);
    primaryImage = images[0] || null;
  }

  const result = await query(
    `INSERT INTO products (
      name_ur, name_en, slug, category_id, subcategory_id,
      price, compare_at_price,
      half_kg_price, quarter_kg_price, half_dozen_price,
      unit_type, unit_value, stock_quantity,
      description_ur, description_en, is_featured, is_new_arrival,
      primary_image, images, city_id, tags
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    RETURNING *`,
    [
      name_ur || name_en, name_en, slug, category_id, subcategory_id,
      price, compare_at_price,
      halfKg, quarterKg, halfDozen,
      unit_type, unit_value, stock_quantity || 0,
      description_ur || null, description_en || null, is_featured || false, is_new_arrival || false,
      primaryImage, images.length > 0 ? images : null,
      scope.cityId,
      productTags.length > 0 ? productTags : null,
    ]
  );

  logger.info('Product created', { productId: result.rows[0].id, createdBy: req.user?.id });

  createdResponse(res, result.rows[0], 'Product created successfully');
});

/**
 * Update product
 * PUT /api/admin/products/:id
 */
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  // Build update query
  const allowedFields = [
    'name_ur', 'name_en', 'category_id', 'subcategory_id',
    'price', 'compare_at_price',
    'half_kg_price', 'quarter_kg_price', 'half_dozen_price',
    'unit_type', 'unit_value',
    'stock_quantity', 'description_ur', 'description_en',
    'is_active', 'is_featured', 'is_new_arrival', 'tags',
  ];
  // These columns must always serialize as NULL when the admin clears them.
  const nullableNumberFields = new Set([
    'compare_at_price', 'half_kg_price', 'quarter_kg_price', 'half_dozen_price',
  ]);

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      let normalised: any = value;
      if (key === 'tags') {
        normalised = parseTagsInput(value);
        normalised = normalised.length > 0 ? normalised : null;
      } else if (nullableNumberFields.has(key)) {
        if (value === '' || value === null || value === undefined) {
          normalised = null;
        } else {
          const n = parseFloat(String(value));
          normalised = Number.isFinite(n) && n > 0 ? n : null;
        }
      }
      setClauses.push(`${key} = $${paramIndex++}`);
      values.push(normalised);
    }
  }

  // Handle uploaded images — Supabase URLs already attached to f.url.
  const uploadedFiles = req.files as Express.Multer.File[] | undefined;

  if (uploadedFiles && uploadedFiles.length > 0) {
    const images = uploadedFiles.map(f => f.url || '').filter(Boolean);
    if (images.length > 0) {
      setClauses.push(`primary_image = $${paramIndex++}`);
      values.push(images[0]);
      setClauses.push(`images = $${paramIndex++}`);
      values.push(images);
    }
  }

  if (setClauses.length === 0) {
    return errorResponse(res, 'No valid fields to update', 400);
  }

  // If name_en is being updated, update slug too
  if (updates.name_en) {
    const newSlug = generateSlug(updates.name_en);
    setClauses.push(`slug = $${paramIndex++}`);
    values.push(newSlug);
  }

  values.push(id);

  const result = await query(
    `UPDATE products SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Product not found');
  }

  logger.info('Product updated', { productId: id, updatedBy: req.user?.id });

  successResponse(res, result.rows[0], 'Product updated successfully');
});

/**
 * Delete product
 * DELETE /api/admin/products/:id              -> permanent delete (default)
 * DELETE /api/admin/products/:id?soft=true    -> soft delete (is_active = FALSE)
 * DELETE /api/admin/products/:id?hard=true    -> permanent delete (explicit)
 *
 * Soft is the default so an accidental click doesn't lose the product
 * permanently. Hard delete also removes referenced images from Supabase
 * Storage and is blocked if the product is referenced by any order_items
 * (would orphan order history).
 */
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const soft = req.query.soft === 'true' || req.query.soft === '1';
  const hard = !soft || req.query.hard === 'true' || req.query.hard === '1';

  if (!hard) {
    const result = await query(
      'UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return errorResponse(res, 'Product not found', 404);
    logger.info('Product soft-deleted', { productId: id, deletedBy: req.user?.id });
    return successResponse(res, null, 'Product deactivated');
  }

  // Permanent delete — blocked only when the product appears in past orders.
  const orderUse = await query(
    'SELECT COUNT(*)::int AS cnt FROM order_items WHERE product_id = $1',
    [id]
  );
  if (orderUse.rows[0].cnt > 0) {
    return errorResponse(
      res,
      'This product is in past orders. Deactivate it instead — permanent delete would break order history.',
      400
    );
  }

  const imgRows = await query<{ primary_image: string | null; images: string[] | null }>(
    'SELECT primary_image, images FROM products WHERE id = $1',
    [id]
  );
  if (imgRows.rows.length === 0) return errorResponse(res, 'Product not found', 404);

  // cart_items also reference products — remove those rows first or the
  // DELETE fails with an FK error that looked like "delete didn't work".
  await withTransaction(async (client) => {
    await client.query('DELETE FROM cart_items WHERE product_id = $1', [id]);
    await client.query('DELETE FROM products WHERE id = $1', [id]);
  });

  const allUrls = [
    ...(imgRows.rows[0].primary_image ? [imgRows.rows[0].primary_image] : []),
    ...(imgRows.rows[0].images ?? []),
  ];
  for (const url of allUrls) {
    const m = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    if (m) await deleteFileFromStorage(m[1]);
  }

  logger.info('Product hard-deleted', { productId: id, deletedBy: req.user?.id });
  successResponse(res, null, 'Product permanently deleted');
});

/**
 * Toggle product active/inactive (without losing the row).
 * PATCH /api/admin/products/:id/toggle-active
 */
export const toggleProductActive = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    'UPDATE products SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active',
    [id]
  );
  if (result.rows.length === 0) return errorResponse(res, 'Product not found', 404);
  successResponse(res, result.rows[0], `Product ${result.rows[0].is_active ? 'activated' : 'deactivated'}`);
});

/**
 * Move one or more products to a different category in a single transaction.
 * PATCH /api/admin/products/move-category
 * Body: { product_ids: string[], category_id: string }
 *
 * Lets the admin reorganise the catalog without editing every product
 * individually. Verifies the target category exists and is active so we
 * don't move products into a hidden bucket by mistake.
 */
export const moveProductsCategory = asyncHandler(async (req: Request, res: Response) => {
  const { product_ids, category_id } = req.body as { product_ids?: string[]; category_id?: string };
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return errorResponse(res, 'product_ids must be a non-empty array', 400);
  }
  if (!category_id) return errorResponse(res, 'category_id is required', 400);

  const cat = await query('SELECT id, is_active FROM categories WHERE id = $1', [category_id]);
  if (cat.rows.length === 0) return errorResponse(res, 'Target category not found', 404);
  if (cat.rows[0].is_active === false) {
    return errorResponse(res, 'Target category is inactive — activate it before moving products into it', 400);
  }

  const result = await query(
    'UPDATE products SET category_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[]) RETURNING id',
    [category_id, product_ids]
  );

  logger.info('Products moved to category', {
    moved: result.rowCount,
    categoryId: category_id,
    by: req.user?.id,
  });
  successResponse(res, { moved: result.rowCount }, `${result.rowCount} product(s) moved`);
});

/**
 * Create WhatsApp order
 * POST /api/admin/whatsapp-orders
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
export const getAdminAddresses = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 100, search, city, area } = req.query;
  const scope = await resolveCityScope(req);

  let whereSql = 'WHERE a.deleted_at IS NULL';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    whereSql += ` AND (
      a.written_address ILIKE $${paramIndex}
      OR a.landmark ILIKE $${paramIndex}
      OR a.house_number ILIKE $${paramIndex}
      OR a.area_name ILIKE $${paramIndex}
      OR u.full_name ILIKE $${paramIndex}
      OR u.phone ILIKE $${paramIndex}
    )`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (city) {
    whereSql += ` AND LOWER(a.city) = LOWER($${paramIndex++})`;
    params.push(city);
  }

  if (area) {
    whereSql += ` AND LOWER(a.area_name) = LOWER($${paramIndex++})`;
    params.push(area);
  }

  if (!scope.unrestricted && scope.cityName && scope.dbReady) {
    whereSql += ` AND LOWER(a.city) = LOWER($${paramIndex++})`;
    params.push(scope.cityName);
  }

  const countResult = await query(
    `SELECT COUNT(*) FROM addresses a JOIN users u ON a.user_id = u.id ${whereSql}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const limitNum = parseInt(limit as string);
  const pageNum = parseInt(page as string);
  const offset = (pageNum - 1) * limitNum;

  const result = await query(
    `SELECT 
      a.id, a.user_id, a.address_type, a.house_number, a.written_address,
      a.landmark, a.area_name, a.city, a.province, a.postal_code,
      a.is_default, a.door_picture_url, a.location_added_by,
      a.delivery_instructions, a.created_at, a.updated_at,
      ST_X(a.location::geometry) as longitude,
      ST_Y(a.location::geometry) as latitude,
      CASE WHEN a.location IS NOT NULL THEN true ELSE false END as has_location,
      dz.name as zone_name,
      u.full_name as customer_name, u.phone as customer_phone
    FROM addresses a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
    ${whereSql}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset]
  );

  successResponse(res, {
    addresses: result.rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 0,
    },
  }, 'Addresses retrieved successfully');
});

/**
 * Bulk update order status
 * PUT /api/admin/orders/bulk-status
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
 * Assign house number to address
 * PUT /api/admin/addresses/:id/house-number
 */
export const assignHouseNumber = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { house_number } = req.body;

  // Update the address record
  const result = await query(
    `UPDATE addresses 
     SET house_number = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [house_number, id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  // Also update house_number in delivery_address_snapshot of all non-delivered/cancelled orders using this address
  await query(
    `UPDATE orders 
     SET delivery_address_snapshot = jsonb_set(delivery_address_snapshot, '{house_number}', $1::jsonb),
         updated_at = NOW()
     WHERE address_id = $2 
       AND status NOT IN ('delivered', 'cancelled')
       AND deleted_at IS NULL`,
    [JSON.stringify(house_number), id]
  );

  logger.info('House number assigned', { addressId: id, houseNumber: house_number, assignedBy: req.user?.id });

  successResponse(res, result.rows[0], 'House number assigned successfully');
});

/**
 * Get atta requests
 * GET /api/admin/atta-requests
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
export const getAdminCategories = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const params: unknown[] = [];
  let paramIndex = 1;
  let whereSql = 'WHERE 1=1';
  const catCity = cityIdClause(scope, 'c', params, paramIndex);
  whereSql += catCity.sql;
  paramIndex = catCity.nextIndex;

  const result = await query(
    `SELECT 
      c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url,
      c.parent_id, c.display_order, c.is_active, c.city_id,
      c.qualifies_for_free_delivery, c.minimum_order_for_free_delivery,
      COUNT(p.id) FILTER (WHERE p.is_active = TRUE) as product_count,
      COUNT(p.id) as total_product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id
    ${whereSql}
    GROUP BY c.id
    ORDER BY c.display_order ASC, c.name_en ASC`,
    params
  );

  successResponse(res, result.rows, 'Categories retrieved successfully');
});

/**
 * Create category
 * POST /api/admin/categories
 */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const scopeErr = requireCityScope(scope);
  if (scopeErr) {
    return errorResponse(res, scopeErr, 400);
  }

  // Frontend sends camelCase field names
  const nameEn = req.body.nameEn || req.body.name_en;
  const nameUr = req.body.nameUr || req.body.name_ur;
  const {
    icon,
    parent_id,
    display_order,
    is_active,
  } = req.body;

  // Validation
  if (!nameEn || !nameUr) {
    return errorResponse(res, 'Name (English) and Name (Urdu) are required', 400);
  }

  let slug = generateSlug(nameEn);
  if (!slug) {
    slug = `category-${Date.now()}`;
  }

  // Check if slug exists in this city — append suffix on collision
  const existingResult = await query(
    'SELECT id FROM categories WHERE slug = $1 AND city_id = $2',
    [slug, scope.cityId]
  );
  if (existingResult.rows.length > 0) {
    slug = `${slug}-${Date.now()}`;
  }

  // Handle uploaded image — Supabase URL on req.file.url.
  const imageUrl: string | null = req.file?.url || null;

  if (req.file && !imageUrl) {
    return errorResponse(
      res,
      'Category image upload failed. Verify Supabase Storage bucket "uploads" exists (Public) and SUPABASE_SERVICE_ROLE_KEY is set on Render.',
      502
    );
  }

  const result = await query(
    `INSERT INTO categories (
      name_ur, name_en, slug, icon_url, image_url,
      parent_id, display_order, is_active,
      created_by, city_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      nameUr, nameEn, slug, icon || null, imageUrl,
      parent_id || null, display_order || 0,
      is_active !== undefined ? is_active : true,
      req.user?.id,
      scope.cityId,
    ]
  );

  logger.info('Category created', { categoryId: result.rows[0].id, createdBy: req.user?.id, imageUrl });

  createdResponse(res, result.rows[0], 'Category created successfully');
});

/**
 * Update category
 * PUT /api/admin/categories/:id
 */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  // Field name mapping from camelCase (frontend) to snake_case (database)
  const fieldMapping: Record<string, string> = {
    'nameEn': 'name_en',
    'nameUr': 'name_ur',
    'icon': 'icon_url',
    'imageUrl': 'image_url',
    'parentId': 'parent_id',
    'displayOrder': 'display_order',
    'isActive': 'is_active',
  };

  const allowedFields = [
    'name_ur', 'name_en', 'icon_url', 'image_url',
    'parent_id', 'display_order', 'is_active',
  ];

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Process body fields with mapping
  for (const [key, value] of Object.entries(updates)) {
    // Map camelCase to snake_case if needed
    const dbField = fieldMapping[key] || key;
    
    if (allowedFields.includes(dbField)) {
      setClauses.push(`${dbField} = $${paramIndex++}`);
      values.push(value);
    }
  }

  // Handle uploaded image — Supabase URL on req.file.url.
  if (req.file && !req.file.url) {
    return errorResponse(
      res,
      'Category image upload failed. Verify Supabase Storage bucket "uploads" exists (Public) and SUPABASE_SERVICE_ROLE_KEY is set on Render.',
      502
    );
  }
  if (req.file?.url) {
    setClauses.push(`image_url = $${paramIndex++}`);
    values.push(req.file.url);
  }

  if (setClauses.length === 0) {
    return errorResponse(res, 'No valid fields to update', 400);
  }

  // If name_en is being updated (either directly or via nameEn), also update slug
  const nameEnValue = updates.name_en || updates.nameEn;
  if (nameEnValue) {
    const newSlug = generateSlug(nameEnValue);
    const existingResult = await query('SELECT id FROM categories WHERE slug = $1 AND id != $2', [newSlug, id]);
    if (existingResult.rows.length > 0) {
      return errorResponse(res, 'Category with similar name already exists', 409);
    }
    setClauses.push(`slug = $${paramIndex++}`);
    values.push(newSlug);
  }

  values.push(id);

  const result = await query(
    `UPDATE categories SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Category not found');
  }

  logger.info('Category updated', { categoryId: id, updatedBy: req.user?.id });

  successResponse(res, result.rows[0], 'Category updated successfully');
});

/**
 * Toggle category active/inactive — visibility flip without deleting.
 * PATCH /api/admin/categories/:id/toggle-active
 */
export const toggleCategoryActive = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    'UPDATE categories SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active',
    [id]
  );
  if (result.rows.length === 0) return errorResponse(res, 'Category not found', 404);
  successResponse(
    res,
    result.rows[0],
    `Category ${result.rows[0].is_active ? 'activated' : 'deactivated'}`
  );
});

/**
 * Delete category (hard delete)
 * DELETE /api/admin/categories/:id
 */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const categoryCheck = await query('SELECT id FROM categories WHERE id = $1', [id]);
  if (categoryCheck.rows.length === 0) {
    return notFoundResponse(res, 'Category not found');
  }

  // Active products must be moved or deactivated first — the admin UI shows
  // only this count, so blocking here matches what the user sees.
  const activeProductsResult = await query(
    'SELECT COUNT(*)::int AS cnt FROM products WHERE category_id = $1 AND is_active = TRUE',
    [id]
  );
  if (activeProductsResult.rows[0].cnt > 0) {
    return errorResponse(
      res,
      'Cannot delete category with active products. Move or deactivate products first.',
      400
    );
  }

  const childResult = await query(
    'SELECT COUNT(*)::int AS cnt FROM categories WHERE parent_id = $1',
    [id]
  );
  if (childResult.rows[0].cnt > 0) {
    return errorResponse(res, 'Cannot delete category with subcategories. Please delete subcategories first.', 400);
  }

  // Inactive products still block deletion if they appear in past orders.
  const inOrdersResult = await query(
    `SELECT COUNT(DISTINCT p.id)::int AS cnt
     FROM products p
     JOIN order_items oi ON oi.product_id = p.id
     WHERE p.category_id = $1`,
    [id]
  );
  if (inOrdersResult.rows[0].cnt > 0) {
    return errorResponse(
      res,
      'Cannot delete category: some products in this category are referenced by past orders. Move those products to another category first.',
      400
    );
  }

  // Clean up inactive products (and their cart rows) so the category FK
  // doesn't prevent deletion — this is what admins expect when the UI shows
  // "0 products".
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM cart_items
       WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)`,
      [id]
    );
    await client.query('DELETE FROM products WHERE category_id = $1', [id]);
    await client.query('DELETE FROM categories WHERE id = $1', [id]);
  });

  logger.info('Category deleted', { categoryId: id, deletedBy: req.user?.id });
  successResponse(res, null, 'Category deleted successfully');
});

/**
 * Get all customers
 * GET /api/admin/customers
 */
export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const { page = 1, limit = 20, search } = req.query;

  let whereSql = `WHERE u.role = 'customer' AND u.deleted_at IS NULL`;
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereSql += ` AND (u.full_name ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const custCity = customerCityExistsClause(scope, 'u', params, paramIndex);
  whereSql += custCity.sql;
  paramIndex = custCity.nextIndex;

  const countResult = await query(
    `SELECT COUNT(*) FROM users u ${whereSql}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const customersSql = `
    SELECT 
      u.id, u.full_name, u.phone, u.email, u.role,
      u.preferred_language, u.notification_enabled,
      u.status, u.is_phone_verified, u.created_at, u.last_login_at,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.deleted_at IS NULL) as total_orders,
      (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.user_id = u.id AND o.status = 'delivered' AND o.deleted_at IS NULL) as total_spent,
      (SELECT COUNT(*) FROM addresses a WHERE a.user_id = u.id AND a.deleted_at IS NULL) as total_addresses
    FROM users u
    ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(customersSql, params);

  successResponse(res, {
    customers: result.rows,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  }, 'Customers retrieved successfully');
});

/**
 * Get customer addresses with location and door pictures
 * GET /api/admin/customers/:id/addresses
 */
export const getCustomerAddresses = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await query(
    `SELECT 
      a.id, a.address_type, a.house_number, a.written_address,
      a.landmark, a.area_name, a.city, a.province, a.postal_code,
      a.is_default, a.door_picture_url, a.location_added_by,
      a.delivery_instructions, a.created_at, a.updated_at,
      ST_X(a.location::geometry) as longitude,
      ST_Y(a.location::geometry) as latitude,
      CASE WHEN a.location IS NOT NULL THEN true ELSE false END as has_location,
      dz.name as zone_name
    FROM addresses a
    LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
    WHERE a.user_id = $1 AND a.deleted_at IS NULL
    ORDER BY a.is_default DESC, a.created_at DESC`,
    [id]
  );

  successResponse(res, result.rows, 'Customer addresses retrieved successfully');
});

// ============================================================================
// SITE SETTINGS (Banner)
// ============================================================================

/**
 * Get banner settings
 * GET /api/admin/site-settings/banner
 */
export const getBannerSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const banner = await fetchBannerSettings(scope.cityId);
  successResponse(res, banner, 'Banner settings retrieved');
});

/**
 * Update banner settings
 * PUT /api/admin/site-settings/banner
 */
export const updateBannerSettings = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (!scope.cityId) {
    return errorResponse(res, 'Select a city before updating banner settings', 400);
  }

  const userId = req.user?.id;
  const {
    banner_left_text,
    banner_middle_text,
    banner_right_text_en,
    banner_right_text_ur,
  } = req.body;

  const banner = await upsertBannerSettings(
    {
      banner_left_text,
      banner_middle_text,
      banner_right_text_en,
      banner_right_text_ur,
    },
    scope.cityId,
    userId
  );

  logger.info('Banner settings updated', {
    updatedBy: userId,
    cityId: scope.cityId,
  });

  successResponse(res, banner, 'Banner settings updated successfully');
});

// ============================================================================
// DELIVERY SETTINGS, TIME SLOTS, BUSINESS HOURS
// ============================================================================

/**
 * Get all settings (delivery config)
 * GET /api/admin/settings
 */
export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  // Get delivery settings from site_settings table
  const result = await query(
    `SELECT key, value FROM site_settings WHERE key LIKE 'delivery_%'`
  );
  const delivery: Record<string, number> = {
    base_charge: 50,
    free_delivery_threshold: 500,
    express_charge: 100,
  };
  for (const row of result.rows) {
    const shortKey = row.key.replace('delivery_', '');
    delivery[shortKey] = parseFloat(row.value) || 0;
  }

  successResponse(res, { delivery }, 'Settings retrieved');
});

/**
 * Update delivery settings
 * PUT /api/admin/settings/delivery
 */
export const updateDeliverySettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { base_charge, free_delivery_threshold, express_charge } = req.body;

  const updates = [
    { key: 'delivery_base_charge', value: String(base_charge ?? 50) },
    { key: 'delivery_free_delivery_threshold', value: String(free_delivery_threshold ?? 500) },
    { key: 'delivery_express_charge', value: String(express_charge ?? 100) },
  ];

  for (const { key, value } of updates) {
    await upsertGlobalSiteSetting(key, value, userId);
  }

  successResponse(res, {
    base_charge: parseFloat(String(base_charge)) || 50,
    free_delivery_threshold: parseFloat(String(free_delivery_threshold)) || 500,
    express_charge: parseFloat(String(express_charge)) || 100,
  }, 'Delivery settings updated');
});

/**
 * Get time slots
 * GET /api/admin/settings/time-slots
 */
export const getTimeSlots = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT id, slot_name, start_time, end_time, max_orders,
            booked_orders, status, is_free_delivery_slot, is_express_slot,
            CASE WHEN status = 'available' THEN true ELSE false END as is_active
     FROM time_slots
     ORDER BY start_time ASC`
  );

  successResponse(res, result.rows, 'Time slots retrieved');
});

/**
 * Create time slot
 * POST /api/admin/settings/time-slots
 */
export const createTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { start_time, end_time, max_orders, is_active, is_free_delivery_slot } = req.body;
  const slotName = `${start_time} - ${end_time}`;
  const status = is_active !== false ? 'available' : 'unavailable';

  const result = await query(
    `INSERT INTO time_slots (slot_name, start_time, end_time, max_orders, status, is_free_delivery_slot)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, slot_name, start_time, end_time, max_orders, status, is_free_delivery_slot,
               CASE WHEN status = 'available' THEN true ELSE false END as is_active`,
    [slotName, start_time, end_time, max_orders || 50, status, is_free_delivery_slot === true]
  );

  createdResponse(res, result.rows[0], 'Time slot created');
});

/**
 * Update time slot
 * PUT /api/admin/settings/time-slots/:id
 */
export const updateTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { start_time, end_time, max_orders, is_active, is_free_delivery_slot } = req.body;
  const slotName = start_time && end_time ? `${start_time} - ${end_time}` : undefined;
  const status = is_active !== undefined ? (is_active ? 'available' : 'unavailable') : undefined;

  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (slotName) { sets.push(`slot_name = $${idx}`); params.push(slotName); idx++; }
  if (start_time) { sets.push(`start_time = $${idx}`); params.push(start_time); idx++; }
  if (end_time) { sets.push(`end_time = $${idx}`); params.push(end_time); idx++; }
  if (max_orders !== undefined) { sets.push(`max_orders = $${idx}`); params.push(max_orders); idx++; }
  if (status) { sets.push(`status = $${idx}`); params.push(status); idx++; }
  if (is_free_delivery_slot !== undefined) { sets.push(`is_free_delivery_slot = $${idx}`); params.push(is_free_delivery_slot === true); idx++; }

  if (sets.length === 0) {
    return successResponse(res, null, 'Nothing to update');
  }

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE time_slots SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING id, slot_name, start_time, end_time, max_orders, status, is_free_delivery_slot,
               CASE WHEN status = 'available' THEN true ELSE false END as is_active`,
    params
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Time slot not found');
  }

  successResponse(res, result.rows[0], 'Time slot updated');
});

/**
 * Delete time slot
 * DELETE /api/admin/settings/time-slots/:id
 */
export const deleteTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    'DELETE FROM time_slots WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Time slot not found');
  }

  successResponse(res, { id }, 'Time slot deleted');
});

/**
 * Get business hours
 * GET /api/admin/settings/business-hours
 */
export const getBusinessHours = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT key, value FROM site_settings WHERE key LIKE 'business_hours_%'`
  );

  if (result.rows.length === 0) {
    // Return default business hours
    const defaults = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => ({
      day,
      open: '09:00',
      close: '21:00',
      is_open: day !== 'Sunday',
    }));
    return successResponse(res, defaults, 'Business hours retrieved');
  }

  // Parse stored JSON
  const hoursRow = result.rows.find((r: any) => r.key === 'business_hours_data');
  const hours = hoursRow ? JSON.parse(hoursRow.value) : [];
  successResponse(res, hours, 'Business hours retrieved');
});

/**
 * Update business hours
 * PUT /api/admin/settings/business-hours
 */
export const updateBusinessHours = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { hours } = req.body;

  await upsertGlobalSiteSetting('business_hours_data', JSON.stringify(hours), userId);

  successResponse(res, hours, 'Business hours updated');
});

// ============================================================================
// SERVICE CITIES MANAGEMENT
// ============================================================================

/**
 * Get all service cities
 * GET /api/admin/cities
 */
export const getCities = asyncHandler(async (req: Request, res: Response) => {
  const scope = req.cityScope;

  if (scope && !scope.unrestricted && scope.cityId) {
    const result = await query(
      `SELECT id, name, province, is_active, created_at
         FROM service_cities
        WHERE id = $1
        ORDER BY name`,
      [scope.cityId]
    );
    return successResponse(res, result.rows, 'Cities retrieved');
  }

  const result = await query(
    `SELECT id, name, province, is_active, created_at FROM service_cities ORDER BY name`
  );
  successResponse(res, result.rows, 'Cities retrieved');
});

/**
 * Add a service city
 * POST /api/admin/cities
 */
export const addCity = asyncHandler(async (req: Request, res: Response) => {
  const { name, province } = req.body;

  const existing = await query(
    `SELECT id FROM service_cities WHERE LOWER(name) = LOWER($1)`,
    [name]
  );
  if (existing.rows.length > 0) {
    return errorResponse(res, 'City already exists', 400);
  }

  const result = await query(
    `INSERT INTO service_cities (name, province) VALUES ($1, $2) RETURNING *`,
    [name, province]
  );
  createdResponse(res, result.rows[0], 'City added');
});

/**
 * Toggle city active status
 * PUT /api/admin/cities/:id/toggle
 */
export const toggleCity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `UPDATE service_cities SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'City not found');
  }
  successResponse(res, result.rows[0], 'City updated');
});

/**
 * Delete a service city
 * DELETE /api/admin/cities/:id
 */
export const deleteCity = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `DELETE FROM service_cities WHERE id = $1 RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'City not found');
  }
  successResponse(res, null, 'City deleted');
});

/**
 * Copy categories + products from one city to another (super-admin only).
 * POST /api/admin/cities/import-catalog
 */
export const importCityCatalog = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can import catalog between cities', 403);
  }

  const sourceCityId = req.body.source_city_id || req.body.sourceCityId;
  const targetCityId = req.body.target_city_id || req.body.targetCityId;

  if (!sourceCityId || !targetCityId) {
    return errorResponse(res, 'source_city_id and target_city_id are required', 400);
  }
  if (sourceCityId === targetCityId) {
    return errorResponse(res, 'Source and target city must be different', 400);
  }

  const cities = await query(
    `SELECT id, name FROM service_cities WHERE id = ANY($1::uuid[])`,
    [[sourceCityId, targetCityId]]
  );
  if (cities.rows.length !== 2) {
    return errorResponse(res, 'Invalid source or target city', 400);
  }

  const summary = await withTransaction(async (client) => {
    const categories = await client.query(
      `SELECT * FROM categories WHERE city_id = $1 ORDER BY display_order, name_en`,
      [sourceCityId]
    );

    const categoryMap = new Map<string, string>();
    let categoriesCopied = 0;
    let productsCopied = 0;

    for (const cat of categories.rows) {
      let slug = cat.slug;
      const slugCheck = await client.query(
        'SELECT id FROM categories WHERE slug = $1 AND city_id = $2',
        [slug, targetCityId]
      );
      if (slugCheck.rows.length > 0) {
        slug = `${slug}-${Date.now()}`;
      }

      const inserted = await client.query(
        `INSERT INTO categories (
          name_ur, name_en, slug, icon_url, image_url,
          parent_id, display_order, is_active,
          qualifies_for_free_delivery, minimum_order_for_free_delivery,
          city_id, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id`,
        [
          cat.name_ur, cat.name_en, slug, cat.icon_url, cat.image_url,
          null, cat.display_order, cat.is_active,
          cat.qualifies_for_free_delivery, cat.minimum_order_for_free_delivery,
          targetCityId, req.user?.id || null,
        ]
      );
      categoryMap.set(cat.id, inserted.rows[0].id);
      categoriesCopied++;
    }

    const products = await client.query(
      `SELECT * FROM products WHERE city_id = $1`,
      [sourceCityId]
    );

    for (const prod of products.rows) {
      const newCategoryId = categoryMap.get(prod.category_id);
      if (!newCategoryId) continue;

      let slug = prod.slug;
      const slugCheck = await client.query(
        'SELECT id FROM products WHERE slug = $1 AND city_id = $2',
        [slug, targetCityId]
      );
      if (slugCheck.rows.length > 0) {
        slug = `${slug}-${Date.now()}`;
      }

      await client.query(
        `INSERT INTO products (
          name_ur, name_en, slug, sku, barcode, category_id, subcategory_id,
          price, compare_at_price, cost_price,
          half_kg_price, quarter_kg_price, half_dozen_price,
          unit_type, unit_value, stock_quantity, low_stock_threshold,
          stock_status, track_inventory, primary_image, images,
          short_description, description_ur, description_en,
          attributes, meta_title, meta_description, tags,
          is_active, is_featured, is_new_arrival, city_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
        )`,
        [
          prod.name_ur, prod.name_en, slug, prod.sku, prod.barcode,
          newCategoryId, null,
          prod.price, prod.compare_at_price, prod.cost_price,
          prod.half_kg_price, prod.quarter_kg_price, prod.half_dozen_price,
          prod.unit_type, prod.unit_value, prod.stock_quantity, prod.low_stock_threshold,
          prod.stock_status, prod.track_inventory, prod.primary_image, prod.images,
          prod.short_description, prod.description_ur, prod.description_en,
          prod.attributes, prod.meta_title, prod.meta_description, prod.tags,
          prod.is_active, prod.is_featured, prod.is_new_arrival, targetCityId,
        ]
      );
      productsCopied++;
    }

    return { categoriesCopied, productsCopied };
  });

  logger.info('City catalog imported', {
    sourceCityId,
    targetCityId,
    ...summary,
    importedBy: req.user?.id,
  });

  successResponse(res, summary, 'Catalog imported successfully');
});

// ============================================================================
// DELIVERY ZONES MANAGEMENT
// ============================================================================

/**
 * List all delivery zones
 * GET /api/admin/delivery-zones
 */
export const getDeliveryZones = asyncHandler(async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT id, name, code, cities, areas, postal_codes,
            standard_delivery_charge, express_delivery_charge,
            minimum_order_value, is_active, created_at, updated_at
       FROM delivery_zones
      ORDER BY is_active DESC, name`
  );
  successResponse(res, result.rows, 'Delivery zones retrieved');
});

/**
 * Create a delivery zone
 * POST /api/admin/delivery-zones
 *
 * Body: { name, code, cities[], areas[], postal_codes?[],
 *         standard_delivery_charge, express_delivery_charge?,
 *         minimum_order_value? }
 */
export const createDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    code,
    cities,
    areas,
    postal_codes,
    standard_delivery_charge,
    express_delivery_charge,
    minimum_order_value,
  } = req.body;

  if (!name || !code) {
    return errorResponse(res, 'name and code are required', 400);
  }

  const dup = await query(
    `SELECT id FROM delivery_zones WHERE LOWER(code) = LOWER($1)`,
    [code]
  );
  if (dup.rows.length > 0) {
    return errorResponse(res, `Zone code '${code}' is already in use`, 400);
  }

  const result = await query(
    `INSERT INTO delivery_zones
       (name, code, cities, areas, postal_codes,
        standard_delivery_charge, express_delivery_charge, minimum_order_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      name,
      code,
      Array.isArray(cities) ? cities : [],
      Array.isArray(areas) ? areas : [],
      Array.isArray(postal_codes) ? postal_codes : null,
      standard_delivery_charge ?? 100,
      express_delivery_charge ?? 200,
      minimum_order_value ?? 500,
    ]
  );
  createdResponse(res, result.rows[0], 'Delivery zone created');
});

/**
 * Update a delivery zone
 * PUT /api/admin/delivery-zones/:id
 *
 * Body may contain any subset of the editable fields. Only provided
 * fields are updated; unspecified ones stay as-is.
 */
export const updateDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    code,
    cities,
    areas,
    postal_codes,
    standard_delivery_charge,
    express_delivery_charge,
    minimum_order_value,
    is_active,
  } = req.body;

  // If code is changing, make sure the new code isn't taken by another zone.
  if (code !== undefined) {
    const dup = await query(
      `SELECT id FROM delivery_zones WHERE LOWER(code) = LOWER($1) AND id <> $2`,
      [code, id]
    );
    if (dup.rows.length > 0) {
      return errorResponse(res, `Zone code '${code}' is already in use`, 400);
    }
  }

  const result = await query(
    `UPDATE delivery_zones SET
        name                     = COALESCE($2, name),
        code                     = COALESCE($3, code),
        cities                   = COALESCE($4, cities),
        areas                    = COALESCE($5, areas),
        postal_codes             = COALESCE($6, postal_codes),
        standard_delivery_charge = COALESCE($7, standard_delivery_charge),
        express_delivery_charge  = COALESCE($8, express_delivery_charge),
        minimum_order_value      = COALESCE($9, minimum_order_value),
        is_active                = COALESCE($10, is_active),
        updated_at               = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      name ?? null,
      code ?? null,
      Array.isArray(cities) ? cities : null,
      Array.isArray(areas) ? areas : null,
      Array.isArray(postal_codes) ? postal_codes : null,
      standard_delivery_charge ?? null,
      express_delivery_charge ?? null,
      minimum_order_value ?? null,
      typeof is_active === 'boolean' ? is_active : null,
    ]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, result.rows[0], 'Delivery zone updated');
});

/**
 * Toggle delivery zone active status
 * PUT /api/admin/delivery-zones/:id/toggle
 */
export const toggleDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `UPDATE delivery_zones SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, result.rows[0], 'Delivery zone updated');
});

/**
 * Delete a delivery zone
 * DELETE /api/admin/delivery-zones/:id
 *
 * Riders / addresses pointing at this zone have their zone_id set to NULL
 * (declared in the FK).
 */
export const deleteDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `DELETE FROM delivery_zones WHERE id = $1 RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, null, 'Delivery zone deleted');
});
