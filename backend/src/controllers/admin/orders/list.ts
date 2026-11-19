// Order list and order detail — moved from orders.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { successResponse, notFoundResponse } from '../../../utils/response';
import { localDate } from '../../../utils/businessTime';
import { resolveCityScope, orderCityClause, orderInScope } from '../../../utils/cityScope';
import { hasRiderTaskArrivedColumn } from '../../../config/riderSchema';
import { parsePagination } from '../../../utils/validators';
import { hasVariableWeightColumns } from '../../../config/productSchema';
import { hasUrgentDeliveryColumns, hasRestaurantOrderColumns } from '../../../config/orderSchema';
import { hasOcpTables } from '../../../config/ocpSchema';

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

  const params: unknown[] = [];
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
