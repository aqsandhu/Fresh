// My orders, one order, tracking, time slots — moved from order.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { slotAvailabilitySql } from '../../utils/timeSlots';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../utils/response';
import { hasRestaurantDeliveryColumns } from '../../config/restaurantSchema';
import { hasTimeSlotBookings } from '../../config/timeSlotSchema';
import { slotCityFor } from '../../utils/timeSlots';
import { pktDateString, weekdayOfDate } from '../../utils/businessTime';
import { hasOrderCouponColumns, hasUrgentDeliveryColumns } from '../../config/orderSchema';
import { normalizePhoneNumber, parsePagination } from '../../utils/validators';
import { buildTrackingPayload } from './shared';

/**
 * Get user's orders
 * GET /api/orders
 */
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { page = 1, limit = 10, status, city_id } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit, { defaultLimit: 10 });

  let whereSql = `WHERE o.user_id = $1 AND o.deleted_at IS NULL`;
  const params: unknown[] = [req.user.id];
  let paramIndex = 2;

  if (status) {
    whereSql += ` AND o.status = $${paramIndex++}`;
    params.push(status);
  }

  if (city_id && typeof city_id === 'string') {
    whereSql += ` AND o.city_id = $${paramIndex++}`;
    params.push(city_id);
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) FROM orders o ${whereSql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Until migration 18 is applied the coupon columns don't exist — referencing
  // them would break every order read, so gate on the cached probe.
  const couponCols = (await hasOrderCouponColumns())
    ? 'o.coupon_discount, o.coupon_code,'
    : '';
  const urgentCols = (await hasUrgentDeliveryColumns())
    ? 'o.is_urgent_delivery, o.urgent_delivery_eta,'
    : 'FALSE AS is_urgent_delivery, NULL::text AS urgent_delivery_eta,';

  // Get orders
  const ordersSql = `
    SELECT
      o.id, o.order_number, o.status, o.source,
      o.subtotal, o.discount_amount, ${couponCols} ${urgentCols} o.delivery_charge, o.tax_amount, o.total_amount,
      o.payment_method, o.payment_status, o.paid_amount,
      o.placed_at, o.confirmed_at, o.preparing_at, o.ready_at, 
      o.out_for_delivery_at, o.delivered_at, o.cancelled_at,
      o.customer_notes, o.cancellation_reason,
      o.city_id, o.delivery_address_snapshot,
      ts.slot_name, ts.start_time as slot_start, ts.end_time as slot_end,
      o.requested_delivery_date,
      r.id as rider_id, ru.full_name as rider_name, ru.phone as rider_phone
    FROM orders o
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    ${whereSql}
    ORDER BY o.placed_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(safeLimit, offset);

  const result = await query(ordersSql, params);

  // Batch fetch all order items in ONE query (fix N+1)
  const orderIds = result.rows.map((o) => o.id);
  let ordersWithItems;

  if (orderIds.length === 0) {
    ordersWithItems = [];
  } else {
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(', ');
    const allItemsResult = await query(
      `SELECT
        oi.id, oi.order_id, oi.product_id, oi.product_name, oi.product_image,
        oi.product_sku, oi.unit_price, oi.quantity, oi.total_price,
        oi.weight_kg, oi.status, oi.unit, oi.quality
      FROM order_items oi
      WHERE oi.order_id IN (${placeholders})
      ORDER BY oi.created_at ASC`,
      orderIds
    );

    const itemsByOrderId: Record<string, Record<string, unknown>[]> = {};
    for (const item of allItemsResult.rows) {
      const { order_id, ...itemFields } = item;
      if (!itemsByOrderId[order_id]) {
        itemsByOrderId[order_id] = [];
      }
      itemsByOrderId[order_id].push(itemFields);
    }

    ordersWithItems = result.rows.map((order) => ({
      ...order,
      items: itemsByOrderId[order.id] || [],
    }));
  }

  successResponse(res, {
    orders: ordersWithItems,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  }, 'Orders retrieved successfully');
});

/**
 * Get order by ID
 * GET /api/orders/:id
 */
export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;

  const couponCols = (await hasOrderCouponColumns())
    ? 'o.coupon_discount, o.coupon_code,'
    : '';
  const urgentCols = (await hasUrgentDeliveryColumns())
    ? 'o.is_urgent_delivery, o.urgent_delivery_eta,'
    : 'FALSE AS is_urgent_delivery, NULL::text AS urgent_delivery_eta,';

  const result = await query(
    `SELECT
      o.id, o.order_number, o.status, o.source,
      o.subtotal, o.discount_amount, ${couponCols} ${urgentCols} o.delivery_charge, o.tax_amount, o.total_amount,
      o.payment_method, o.payment_status, o.paid_amount,
      o.placed_at, o.confirmed_at, o.preparing_at, o.ready_at, 
      o.out_for_delivery_at, o.delivered_at, o.cancelled_at,
      o.customer_notes, o.cancellation_reason,
      o.delivery_address_snapshot,
      ts.slot_name, ts.start_time as slot_start, ts.end_time as slot_end,
      o.requested_delivery_date,
      r.id as rider_id, ru.full_name as rider_name, ru.phone as rider_phone,
      r.vehicle_type as rider_vehicle_type, r.vehicle_number as rider_vehicle_number,
      o.delivery_proof_image,
      dcr.rule_name as delivery_rule_applied
    FROM orders o
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    LEFT JOIN delivery_charges_config dcr ON o.delivery_charge_rule_id = dcr.id
    WHERE o.id = $1 AND o.user_id = $2 AND o.deleted_at IS NULL`,
    [id, req.user.id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  const order = result.rows[0];

  // Get order items
  const itemsResult = await query(
    `SELECT
      oi.id, oi.product_id, oi.product_name, oi.product_image, oi.product_sku,
      oi.unit_price, oi.quantity, oi.total_price, oi.weight_kg, oi.final_weight_kg, oi.status,
      oi.special_instructions, oi.unit, oi.quality
    FROM order_items oi
    WHERE oi.order_id = $1`,
    [id]
  );

  order.items = itemsResult.rows;

  successResponse(res, order, 'Order retrieved successfully');
});

/**
 * Track order status (authenticated — owner or staff only)
 * GET /api/orders/track/:id
 */
export const trackOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await query(
    `SELECT 
      o.id, o.order_number, o.status,
      o.placed_at, o.confirmed_at, o.preparing_at, o.ready_at, 
      o.out_for_delivery_at, o.delivered_at, o.cancelled_at,
      o.delivery_address_snapshot->>'written_address' as delivery_address,
      o.delivery_address_snapshot,
      o.user_id,
      r.id as rider_id, ru.full_name as rider_name, ru.phone as rider_phone, ru.avatar_url as rider_avatar_url,
      r.vehicle_type as rider_vehicle_type, r.vehicle_number as rider_vehicle_number,
      r.rating as rider_rating, r.rating_count as rider_rating_count,
      ST_X(r.current_location::geometry) as rider_longitude,
      ST_Y(r.current_location::geometry) as rider_latitude,
      r.location_updated_at as rider_location_updated_at
    FROM orders o
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  const order = result.rows[0];

  if (req.user) {
    const isOwner = req.user.id === order.user_id;
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    let isAssignedRider = false;
    if (req.user.role === 'rider') {
      const rider = await query('SELECT 1 FROM riders WHERE id = $1 AND user_id = $2', [order.rider_id, req.user.id]);
      isAssignedRider = rider.rows.length > 0;
    }
    if (!isOwner && !isAdmin && !isAssignedRider) {
      return errorResponse(res, 'You can only track your own orders', 403);
    }
  }

  successResponse(res, buildTrackingPayload(order), 'Order tracking information retrieved');
});

/**
 * Public order tracking with order number + phone verification
 * GET /api/orders/track/public/:orderNumber?phone=03XXXXXXXXX
 */
export const trackOrderPublic = asyncHandler(async (req: Request, res: Response) => {
  const { orderNumber } = req.params;
  const phone = String(req.query.phone || '');

  if (!phone) {
    return errorResponse(res, 'Phone number is required for tracking', 400);
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizePhoneNumber(phone);
  } catch {
    return errorResponse(res, 'Invalid phone number', 400);
  }

  const result = await query(
    `SELECT 
      o.id, o.order_number, o.status,
      o.placed_at, o.confirmed_at, o.preparing_at, o.ready_at, 
      o.out_for_delivery_at, o.delivered_at, o.cancelled_at,
      o.delivery_address_snapshot->>'written_address' as delivery_address,
      o.delivery_address_snapshot,
      o.user_id,
      r.id as rider_id, ru.full_name as rider_name, ru.phone as rider_phone, ru.avatar_url as rider_avatar_url,
      r.vehicle_type as rider_vehicle_type, r.vehicle_number as rider_vehicle_number,
      r.rating as rider_rating, r.rating_count as rider_rating_count,
      ST_X(r.current_location::geometry) as rider_longitude,
      ST_Y(r.current_location::geometry) as rider_latitude,
      r.location_updated_at as rider_location_updated_at
    FROM orders o
    JOIN users u ON o.user_id = u.id
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    WHERE o.order_number = $1 AND u.phone = $2 AND o.deleted_at IS NULL`,
    [orderNumber, normalizedPhone]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  successResponse(res, buildTrackingPayload(result.rows[0]), 'Order tracking information retrieved');
});

/**
 * Get available time slots
 * GET /api/orders/time-slots
 */
export const getTimeSlots = asyncHandler(async (req: Request, res: Response) => {
  const { date } = req.query;

  // Get day of week (0 = Sunday, 6 = Saturday). Reject malformed dates so
  // they don't silently produce NaN and return zero slots.
  // Without a date it is TODAY IN PAKISTAN (the server clock is UTC, so
  // between 00:00 and 05:00 PKT it used to apply yesterday's weekday rules).
  let dayOfWeek: number;
  if (typeof date === 'string' && date.length > 0) {
    const targetDate = new Date(date);
    if (Number.isNaN(targetDate.getTime())) {
      return errorResponse(res, 'Invalid date format', 400);
    }
    dayOfWeek = /^\d{4}-\d{2}-\d{2}$/.test(date) ? weekdayOfDate(date) : targetDate.getDay();
  } else {
    dayOfWeek = weekdayOfDate(pktDateString());
  }
  const dateParam = (typeof date === 'string' && date.length > 0) ? date : null;

  const audienceClause = (await hasRestaurantDeliveryColumns()) ? `AND audience = 'consumer'` : '';

  // Availability is per (slot, date): join the per-date counter for the target
  // date so a slot full on one day isn't shown full on another. Falls back to
  // the legacy global counter until the per-date table exists.
  const perDate = await hasTimeSlotBookings();
  const bookedExpr = perDate ? 'COALESCE(tsb.booked_count, 0)' : 'ts.booked_orders';
  const join = perDate
    ? `LEFT JOIN time_slot_bookings tsb ON tsb.time_slot_id = ts.id AND tsb.delivery_date = COALESCE($2::date, (NOW() AT TIME ZONE 'Asia/Karachi')::date)`
    : '';
  const params: unknown[] = perDate ? [dayOfWeek, dateParam] : [dayOfWeek];
  // Every city has its own slots (A30).
  const slotCity = await slotCityFor(req);
  params.push(slotCity);
  const cityClause = `AND (ts.city_id = $${params.length}::uuid OR ts.city_id IS NULL)`;
  const result = await query(
    `SELECT
      ts.id, ts.slot_name, ts.start_time, ts.end_time,
      ts.max_orders, ${bookedExpr} AS booked_orders,
      ${slotAvailabilitySql(bookedExpr)},
      ts.is_free_delivery_slot, ts.is_express_slot
    FROM time_slots ts
    ${join}
    WHERE ts.status = 'available'
    ${audienceClause.replace('audience', 'ts.audience')}
    ${cityClause}
    AND (ts.applicable_days IS NULL OR $1 = ANY(ts.applicable_days))
    ORDER BY ts.start_time ASC`,
    params
  );

  successResponse(res, result.rows, 'Time slots retrieved successfully');
});
