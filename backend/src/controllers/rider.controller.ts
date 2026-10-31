// ============================================================================
// RIDER CONTROLLER — everything the rider app calls under /api/rider.
//
// Task rows are built by ONE column/join builder (taskSelect) for the active
// list, the completed list and the detail screen, so a card and its detail
// can never disagree. It covers the three kinds of work a rider carries:
//   • consumer orders     — address from the order snapshot + live address row
//   • restaurant orders   — no user_id; business name/phone/pin/storefront
//                           photo live in delivery_address_snapshot
//   • Atta Chakki tasks   — customer address from atta_requests.address_id,
//                           wheat/flour details, contact note, COD amount
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../utils/response';
import { isValidOrderTransition } from '../utils/orderStatus';
import { hasRestaurantDeliveryColumns } from '../config/restaurantSchema';
import { deductOcpStockOnDelivery } from '../utils/ocpStock';
import { commitOrderSaleOnDelivery } from '../utils/systemStock';
import { emitOrderUpdate, emitToUser, emitRiderEventToAdmins, emitRiderLocationUpdate } from '../config/socket';
import { parsePagination } from '../utils/validators';
import {
  hasOrderCouponColumns,
  hasUrgentDeliveryColumns,
  hasRestaurantOrderColumns,
} from '../config/orderSchema';
import { hasOcpTables } from '../config/ocpSchema';
import { hasVariableWeightColumns } from '../config/productSchema';
import { hasFeedbackTables } from '../config/feedbackSchema';
import {
  hasAttaCashColumns,
  hasRiderCashSettlementTables,
  hasRiderTaskArrivedColumn,
} from '../config/riderSchema';
import { pushToCustomers } from '../utils/customerNotify';
import { syncRiderAvailability, resolveDutyStatus } from '../utils/riderAvailability';
import { computeRiderStats, computeRiderToday } from '../utils/riderStats';
import logger from '../utils/logger';

// ── Shared task SELECT ──────────────────────────────────────────────────────

interface TaskSqlFlags {
  urgent: boolean;
  restaurant: boolean;
  ocp: boolean;
  arrived: boolean;
  attaCash: boolean;
  coupon: boolean;
}

async function taskSqlFlags(): Promise<TaskSqlFlags> {
  const [urgent, restaurant, ocp, arrived, attaCash, coupon] = await Promise.all([
    hasUrgentDeliveryColumns(),
    hasRestaurantOrderColumns(),
    hasOcpTables(),
    hasRiderTaskArrivedColumn(),
    hasAttaCashColumns(),
    hasOrderCouponColumns(),
  ]);
  return { urgent, restaurant, ocp, arrived, attaCash, coupon };
}

/** Safe numeric read of a JSON text value (snapshot coordinates). */
const jsonNum = (expr: string) => `(CASE WHEN (${expr}) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${expr})::float8 END)`;

const SNAP = 'o.delivery_address_snapshot';

function taskSelect(f: TaskSqlFlags, detail: boolean): string {
  const snapLng = jsonNum(`${SNAP}->'location'->>'longitude'`);
  const snapLat = jsonNum(`${SNAP}->'location'->>'latitude'`);
  return `
    SELECT
      rt.id, rt.task_type, rt.status,
      rt.assigned_at, rt.accepted_at, rt.started_at, rt.completed_at,
      ${f.arrived ? 'rt.arrived_at,' : 'NULL::timestamptz AS arrived_at,'}
      rt.sequence_number, rt.estimated_duration,
      rt.pickup_address, rt.delivery_address,
      ST_X(rt.pickup_location::geometry) AS pickup_longitude,
      ST_Y(rt.pickup_location::geometry) AS pickup_latitude,
      ST_X(rt.delivery_location::geometry) AS delivery_longitude,
      ST_Y(rt.delivery_location::geometry) AS delivery_latitude,
      rt.pickup_proof_image, rt.delivery_proof_image, rt.notes,
      -- Order
      o.id AS order_id, o.order_number, o.status AS order_status,
      o.total_amount, o.paid_amount, o.payment_method, o.payment_status,
      o.rider_delivery_charge,
      ${f.urgent ? 'o.is_urgent_delivery, o.urgent_delivery_eta,' : 'FALSE AS is_urgent_delivery, NULL::text AS urgent_delivery_eta,'}
      o.requested_delivery_date, o.customer_notes,
      ${detail ? `o.delivery_charge, o.subtotal, o.discount_amount, ${f.coupon ? 'o.coupon_discount,' : '0 AS coupon_discount,'}` : ''}
      -- Restaurant (B2B) orders carry the business in the snapshot
      ${f.restaurant
        ? `(o.restaurant_id IS NOT NULL) AS is_restaurant, ${SNAP}->>'business_name' AS restaurant_name,`
        : 'FALSE AS is_restaurant, NULL::text AS restaurant_name,'}
      -- Address: order snapshot first, live address row (orders + atta) second
      COALESCE(NULLIF(${SNAP}->>'written_address', ''), a.written_address) AS order_delivery_address,
      COALESCE(NULLIF(${SNAP}->>'landmark', ''), a.landmark) AS order_landmark,
      COALESCE(NULLIF(${SNAP}->>'house_number', ''), a.house_number) AS order_house_number,
      COALESCE(NULLIF(${SNAP}->>'area_name', ''), a.area_name) AS order_area,
      COALESCE(NULLIF(${SNAP}->>'city', ''), a.city) AS order_city,
      -- Customer contact (privacy: only when the admin allowed it)
      CASE WHEN o.show_customer_phone = true THEN COALESCE(ou.phone, ${SNAP}->>'phone') ELSE NULL END AS customer_phone,
      CASE WHEN o.show_customer_phone = true
           THEN COALESCE(ou.full_name, ${SNAP}->>'owner_name', ${SNAP}->>'business_name') ELSE NULL END AS customer_name,
      COALESCE(o.address_id, ar.address_id) AS address_id,
      (a.location IS NOT NULL OR (${snapLat} IS NOT NULL AND ${snapLng} IS NOT NULL)) AS has_location,
      a.location_added_by,
      COALESCE(ST_X(a.location::geometry), ${snapLng}) AS address_longitude,
      COALESCE(ST_Y(a.location::geometry), ${snapLat}) AS address_latitude,
      COALESCE(
        NULLIF(a.door_picture_url, ''),
        NULLIF(${SNAP}->>'front_image_url', ''),
        NULLIF(${SNAP}->>'door_picture_url', '')
      ) AS door_picture_url,
      -- Slot
      ts.slot_name AS time_slot_name, ts.start_time, ts.end_time,
      -- Order Collection Point (cash goes to the OCP, not the company)
      ${f.ocp ? 'o.ocp_id, ocp.name AS ocp_name, ocp.address AS ocp_address,' : 'NULL::uuid AS ocp_id, NULL::text AS ocp_name, NULL::text AS ocp_address,'}
      -- Atta Chakki
      ar.id AS atta_request_id, ar.request_number AS atta_request_number,
      ar.status AS atta_status, ar.wheat_quantity_kg, ar.wheat_quality, ar.flour_type,
      ar.flour_quantity_expected_kg, ar.actual_flour_quantity_kg,
      ar.special_instructions AS atta_instructions,
      ar.total_amount AS atta_total_amount, ar.payment_status AS atta_payment_status,
      ar.payment_method AS atta_payment_method,
      ${f.attaCash ? 'ar.paid_amount AS atta_paid_amount' : '0 AS atta_paid_amount'}
    FROM rider_tasks rt
    LEFT JOIN orders o ON rt.order_id = o.id
    LEFT JOIN users ou ON o.user_id = ou.id
    LEFT JOIN atta_requests ar ON rt.atta_request_id = ar.id
    LEFT JOIN addresses a ON a.id = COALESCE(o.address_id, ar.address_id)
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    ${f.ocp ? 'LEFT JOIN order_collection_points ocp ON ocp.id = o.ocp_id' : ''}`;
}

async function resolveRiderId(userId: string): Promise<string | null> {
  const riderResult = await query('SELECT id FROM riders WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
  return riderResult.rows[0]?.id || null;
}

/** Throws-as-response helper for transaction blocks. */
const httpError = (message: string, http: number) => Object.assign(new Error(message), { http });

// ── Profile ─────────────────────────────────────────────────────────────────

/**
 * Get rider profile
 * GET /api/rider/profile
 */
export const getRiderProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const result = await query(
    `SELECT
      r.id, r.cnic, r.vehicle_type, r.vehicle_number,
      r.status, r.verification_status, r.rating, r.rating_count,
      r.total_deliveries, r.total_earnings, r.created_at AS joined_at,
      ST_X(r.current_location::geometry) as longitude,
      ST_Y(r.current_location::geometry) as latitude,
      r.location_updated_at,
      sc.name AS city_name,
      (SELECT COUNT(*)::int FROM rider_tasks t
        WHERE t.rider_id = r.id AND t.status IN ('assigned', 'in_progress')) AS active_tasks,
      u.full_name, u.phone, u.email, u.avatar_url
    FROM riders r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN service_cities sc ON sc.id = r.city_id
    WHERE r.user_id = $1 AND r.deleted_at IS NULL`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Rider profile not found');
  }

  successResponse(res, result.rows[0], 'Rider profile retrieved successfully');
});

/**
 * Register/update rider push token
 * PUT /api/rider/fcm-token
 */
export const updateFcmToken = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const token = String(req.body?.token ?? '').trim();
  if (!token) {
    return errorResponse(res, 'Push token is required', 400);
  }

  const result = await query(
    `UPDATE users
        SET device_tokens = (
              SELECT ARRAY(
                SELECT token
                FROM unnest(ARRAY[$2]::text[] || COALESCE(device_tokens, ARRAY[]::text[]))
                     WITH ORDINALITY AS t(token, ord)
                GROUP BY token
                ORDER BY MIN(ord)
                LIMIT 5
              )
            ),
            updated_at = NOW()
      WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
      RETURNING id`,
    [req.user.id, token]
  );

  if (result.rows.length === 0) {
    return errorResponse(res, 'Rider account not found or inactive', 401);
  }

  successResponse(res, null, 'Push token updated');
});

// ── Task lists ──────────────────────────────────────────────────────────────

/**
 * Get assigned tasks (paged, optional ?status)
 * GET /api/rider/tasks
 */
export const getTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { status, page = 1, limit = 20 } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit);

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const params: unknown[] = [riderId];
  let where = 'WHERE rt.rider_id = $1';
  if (typeof status === 'string' && ['assigned', 'in_progress', 'completed', 'cancelled', 'failed'].includes(status)) {
    params.push(status);
    where += ` AND rt.status = $${params.length}`;
  }

  const countResult = await query(`SELECT COUNT(*) FROM rider_tasks rt ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const flags = await taskSqlFlags();
  params.push(safeLimit, offset);
  const result = await query(
    `${taskSelect(flags, false)}
     ${where}
     ORDER BY CASE rt.status WHEN 'in_progress' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,
              rt.sequence_number ASC, rt.assigned_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  successResponse(res, {
    tasks: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  }, 'Tasks retrieved successfully');
});

/**
 * Get active tasks (assigned + in_progress) — flat array for mobile app
 * GET /api/rider/tasks/active
 */
export const getActiveTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const flags = await taskSqlFlags();
  const result = await query(
    `${taskSelect(flags, false)}
     WHERE rt.rider_id = $1 AND rt.status IN ('assigned', 'in_progress')
     ORDER BY
       CASE rt.status WHEN 'in_progress' THEN 1 WHEN 'assigned' THEN 2 END,
       ${flags.urgent ? 'CASE WHEN o.is_urgent_delivery THEN 0 ELSE 1 END,' : ''}
       rt.sequence_number ASC, rt.assigned_at ASC`,
    [riderId]
  );

  successResponse(res, result.rows, 'Active tasks retrieved successfully');
});

/**
 * Get finished tasks — completed by default; ?include=all adds failed and
 * cancelled ones (so the rider can see what was taken off him and why).
 * GET /api/rider/tasks/completed
 */
export const getCompletedTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const includeAll = req.query.include === 'all';
  const flags = await taskSqlFlags();
  const result = await query(
    `${taskSelect(flags, false)}
     WHERE rt.rider_id = $1 AND rt.status ${includeAll ? "IN ('completed', 'failed', 'cancelled')" : "= 'completed'"}
     ORDER BY COALESCE(rt.completed_at, rt.updated_at) DESC
     LIMIT 100`,
    [riderId]
  );

  successResponse(res, result.rows, 'Completed tasks retrieved successfully');
});

/**
 * Get task details
 * GET /api/rider/tasks/:id
 */
export const getTaskDetails = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const flags = await taskSqlFlags();
  const result = await query(
    `${taskSelect(flags, true)}
     WHERE rt.id = $1 AND rt.rider_id = $2`,
    [id, riderId]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Task not found');
  }

  const task = result.rows[0];

  let items: any[] = [];
  if (task.order_id) {
    const finalWeight = (await hasVariableWeightColumns()) ? 'final_weight_kg,' : 'NULL::numeric AS final_weight_kg,';
    const itemsResult = await query(
      `SELECT id, product_name, product_image, quantity, unit, quality, weight_kg, ${finalWeight}
              unit_price, total_price, special_instructions
       FROM order_items WHERE order_id = $1 ORDER BY created_at`,
      [task.order_id]
    );
    items = itemsResult.rows;
  }

  successResponse(res, { ...task, items }, 'Task details retrieved successfully');
});

/**
 * Accept task (stamps accepted_at; the task stays 'assigned' until pickup)
 * PUT /api/rider/tasks/:id/accept
 */
export const acceptTask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const result = await query(
    `UPDATE rider_tasks
     SET accepted_at = COALESCE(accepted_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND rider_id = $2 AND status = 'assigned'
     RETURNING *`,
    [id, riderId]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Task not found or already started');
  }

  successResponse(res, result.rows[0], 'Task accepted successfully');
});

// ── Customer notifications for atta progress ────────────────────────────────

function notifyAttaCustomer(
  userId: string | null | undefined,
  request: { id: string; request_number?: string | null },
  status: 'picked_up' | 'at_mill' | 'out_for_delivery' | 'delivered'
): void {
  if (!userId) return;
  const ref = request.request_number ? `#${request.request_number}` : '';
  const copy: Record<typeof status, { title: string; body: string }> = {
    picked_up: { title: 'Gandum pick ho gayi', body: `Aap ki gandum (request ${ref}) rider ne le li hai.` },
    at_mill: { title: 'Gandum chakki par', body: `Request ${ref} ki gandum chakki par pohanch gayi hai.` },
    out_for_delivery: { title: 'Atta raste mein hai', body: `Request ${ref} ka atta rider le kar aa raha hai.` },
    delivered: { title: 'Atta deliver ho gaya', body: `Request ${ref} ka atta aap ko deliver ho gaya. Shukriya!` },
  };
  const payload = { attaRequestId: request.id, requestNumber: request.request_number ?? null, status, message: copy[status].body };
  emitToUser(userId, 'atta:status_changed', payload);
  pushToCustomers([userId], {
    title: copy[status].title,
    body: copy[status].body,
    data: { type: 'atta_update', ...payload },
  }).catch(() => {});
}

// ── Pickup ──────────────────────────────────────────────────────────────────

/**
 * Confirm pickup
 * PUT /api/rider/tasks/:id/pickup
 *
 * Transactional: locks the task and its order so the order status flip goes
 * through the shared state machine — a cancelled order can no longer be
 * dragged to out_for_delivery, and a second tap is a no-op.
 */
export const confirmPickup = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : null;

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  let attaEvent: { userId: string; id: string; request_number: string; status: 'picked_up' | 'out_for_delivery' } | null = null;

  try {
    await withTransaction(async (client) => {
      const taskResult = await client.query(
        'SELECT * FROM rider_tasks WHERE id = $1 AND rider_id = $2 FOR UPDATE',
        [id, riderId]
      );
      if (taskResult.rows.length === 0) throw httpError('Task not found', 404);
      const task = taskResult.rows[0];

      if (!['assigned', 'in_progress'].includes(task.status)) {
        throw httpError(`Task is already ${task.status}`, 409);
      }

      await client.query(
        `UPDATE rider_tasks
         SET status = 'in_progress', started_at = COALESCE(started_at, NOW()),
             accepted_at = COALESCE(accepted_at, NOW()),
             notes = COALESCE($1, notes), updated_at = NOW()
         WHERE id = $2`,
        [notes, id]
      );

      if (task.order_id) {
        const orderResult = await client.query(
          'SELECT id, status FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [task.order_id]
        );
        const order = orderResult.rows[0];
        if (!order) throw httpError('Order not found', 404);
        // Already out for delivery (set at assignment) — nothing to do.
        if (order.status !== 'out_for_delivery') {
          if (!isValidOrderTransition(order.status, 'out_for_delivery')) {
            throw httpError(`Order is ${order.status} and cannot be picked up`, 409);
          }
          await client.query(
            `UPDATE orders
             SET status = 'out_for_delivery',
                 out_for_delivery_at = COALESCE(out_for_delivery_at, NOW()),
                 updated_at = NOW()
             WHERE id = $1`,
            [task.order_id]
          );
        }
      } else if (task.atta_request_id) {
        // atta_pickup: wheat collected from the customer → picked_up.
        // atta_delivery: flour collected from the mill → out_for_delivery.
        const delivery = task.task_type === 'atta_delivery';
        const upd = await client.query(
          delivery
            ? `UPDATE atta_requests
                  SET status = 'out_for_delivery', delivery_scheduled_at = COALESCE(delivery_scheduled_at, NOW()),
                      delivery_rider_id = $2, updated_at = NOW()
                WHERE id = $1 AND status IN ('at_mill', 'milling', 'ready_for_delivery', 'out_for_delivery')
                RETURNING id, request_number, user_id, status`
            : `UPDATE atta_requests
                  SET status = 'picked_up', picked_up_at = COALESCE(picked_up_at, NOW()),
                      pickup_rider_id = $2, updated_at = NOW()
                WHERE id = $1 AND status IN ('pending_pickup', 'picked_up')
                RETURNING id, request_number, user_id, status`,
          [task.atta_request_id, riderId]
        );
        if (upd.rows.length === 0) {
          const cur = await client.query('SELECT status FROM atta_requests WHERE id = $1', [task.atta_request_id]);
          throw httpError(`Atta request is ${cur.rows[0]?.status ?? 'missing'} and cannot be ${delivery ? 'collected from the mill' : 'picked up'} now`, 409);
        }
        const r = upd.rows[0];
        attaEvent = { userId: r.user_id, id: r.id, request_number: r.request_number, status: delivery ? 'out_for_delivery' : 'picked_up' };
      }
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }

  if (attaEvent) {
    const ev = attaEvent as { userId: string; id: string; request_number: string; status: 'picked_up' | 'out_for_delivery' };
    notifyAttaCustomer(ev.userId, ev, ev.status);
  }

  successResponse(res, null, 'Pickup confirmed successfully');
});

// ── Arrived (privacy-protected "I'm at your door") ───────────────────────────

const ARRIVAL_REPEAT_MS = 2 * 60 * 1000;
const lastArrivalPing = new Map<string, number>();

interface ArrivalOutcome {
  notified: boolean;
  arrivedAt: string;
  reason?: string;
}

/**
 * Tell the customer the rider is at the door — the documented privacy flow
 * (ARCHITECTURE.md): the rider never needs the customer's number; the
 * customer gets "Aapka order aapke darwaze par hai" as a push, a live socket
 * alert on the tracking screen and an entry in their notifications list.
 */
async function notifyArrival(riderId: string, taskId: string): Promise<ArrivalOutcome> {
  const arrivedReady = await hasRiderTaskArrivedColumn();
  const restaurantReady = await hasRestaurantOrderColumns();
  const taskRes = await query(
    `SELECT rt.id, rt.status, rt.task_type, rt.order_id, rt.atta_request_id,
            o.order_number, o.user_id AS order_user_id, o.status AS order_status,
            ${restaurantReady ? 'o.restaurant_id,' : 'NULL::uuid AS restaurant_id,'}
            ar.request_number, ar.user_id AS atta_user_id,
            ru.full_name AS rider_name
       FROM rider_tasks rt
       JOIN riders r ON r.id = rt.rider_id
       JOIN users ru ON ru.id = r.user_id
       LEFT JOIN orders o ON o.id = rt.order_id
       LEFT JOIN atta_requests ar ON ar.id = rt.atta_request_id
      WHERE rt.id = $1 AND rt.rider_id = $2`,
    [taskId, riderId]
  );
  if (taskRes.rows.length === 0) throw httpError('Task not found', 404);
  const t = taskRes.rows[0];
  if (!['assigned', 'in_progress'].includes(t.status)) {
    throw httpError(`Task is already ${t.status}`, 409);
  }

  const last = lastArrivalPing.get(taskId) ?? 0;
  if (Date.now() - last < ARRIVAL_REPEAT_MS) {
    throw httpError('The customer was notified a moment ago. Please wait a little before notifying again.', 429);
  }
  lastArrivalPing.set(taskId, Date.now());
  if (lastArrivalPing.size > 5000) lastArrivalPing.clear();

  const arrivedAt = new Date().toISOString();
  if (arrivedReady) {
    await query(`UPDATE rider_tasks SET arrived_at = NOW(), updated_at = NOW() WHERE id = $1`, [taskId]);
  }

  const customerUserId: string | null = t.order_user_id || t.atta_user_id || null;
  const reference = t.order_number || t.request_number || '';
  const isAtta = !t.order_id && !!t.atta_request_id;
  const title = 'Rider aap ke darwaze par hai';
  const body = isAtta
    ? `Rider ${t.rider_name || ''} gandum/atta ke liye aap ke darwaze par hai (request #${reference}).`
    : `Aapka order aapke darwaze par hai! Rider ${t.rider_name || ''} order #${reference} ke sath bahar maujood hai.`;

  if (t.order_id) {
    // call_requests keeps the audit trail of app-mediated contact.
    await query(
      `INSERT INTO call_requests (rider_id, order_id, virtual_number, status)
       VALUES ($1, $2, NULL, 'requested')`,
      [riderId, t.order_id]
    ).catch((err) => logger.warn('call_requests insert failed', { err: err?.message }));
  }

  if (!customerUserId) {
    // Restaurant (B2B) orders have no customer app account to notify.
    emitRiderEventToAdmins(riderId, 'rider:arrived', {
      taskId, orderId: t.order_id, orderNumber: reference, riderName: t.rider_name,
      message: `Rider ${t.rider_name || ''} has arrived for #${reference}`,
    });
    return { notified: false, arrivedAt, reason: t.restaurant_id ? 'restaurant' : 'no_customer_account' };
  }

  await query(
    `INSERT INTO notifications (user_id, type, title, message, order_id, atta_request_id, action_type)
     VALUES ($1, 'call_request', $2, $3, $4, $5, 'rider_arrived')`,
    [customerUserId, title, body, t.order_id || null, t.atta_request_id || null]
  ).catch((err) => logger.warn('arrival notification insert failed', { err: err?.message }));

  const payload = {
    orderId: t.order_id || null,
    orderNumber: t.order_number || null,
    attaRequestId: t.atta_request_id || null,
    requestNumber: t.request_number || null,
    riderName: t.rider_name || null,
    arrivedAt,
    message: body,
  };
  emitToUser(customerUserId, 'order:rider_arrived', payload);
  if (t.order_id) emitOrderUpdate(t.order_id, { ...payload, status: t.order_status, event: 'rider_arrived' });
  pushToCustomers([customerUserId], {
    title,
    body,
    data: { type: 'rider_arrived', ...payload },
  }).catch(() => {});

  logger.info('Rider arrival notified', { riderId, taskId, orderId: t.order_id, attaRequestId: t.atta_request_id });
  return { notified: true, arrivedAt };
}

/**
 * I've arrived — notify the customer.
 * POST /api/rider/tasks/:id/arrived
 */
export const markArrived = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');
  try {
    const out = await notifyArrival(riderId, req.params.id);
    return successResponse(
      res,
      { notified: out.notified, arrived_at: out.arrivedAt, reason: out.reason ?? null },
      out.notified ? 'Customer notified that you have arrived' : 'Arrival recorded'
    );
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
});

// ── Proof of delivery ───────────────────────────────────────────────────────

/**
 * Upload the proof-of-delivery photo (website privacy policy: "Riders take a
 * photo of the delivered order as proof of delivery").
 * POST /api/rider/tasks/:id/proof   (multipart field: delivery_proof)
 * Body: { stage?: 'pickup' | 'delivery' } — pickup proof is used for the
 * atta wheat hand-over.
 */
export const uploadProofOfDelivery = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  if (!req.file) return errorResponse(res, 'Proof photo is required', 400);
  const imageUrl = req.file.url || '';
  if (!imageUrl) return errorResponse(res, 'Image upload failed (storage misconfigured)', 500);

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const stage = req.body?.stage === 'pickup' ? 'pickup' : 'delivery';
  const column = stage === 'pickup' ? 'pickup_proof_image' : 'delivery_proof_image';

  const updated = await query(
    `UPDATE rider_tasks SET ${column} = $1, updated_at = NOW()
      WHERE id = $2 AND rider_id = $3 AND status IN ('assigned', 'in_progress', 'completed')
      RETURNING id, order_id, atta_request_id`,
    [imageUrl, req.params.id, riderId]
  );
  if (updated.rows.length === 0) return notFoundResponse(res, 'Task not found');

  const task = updated.rows[0];
  if (task.order_id && stage === 'delivery') {
    // orders.delivery_proof_image is what the admin order view / slip reads.
    await query(`UPDATE orders SET delivery_proof_image = $1, updated_at = NOW() WHERE id = $2`, [imageUrl, task.order_id])
      .catch((err) => logger.warn('orders.delivery_proof_image update failed', { err: err?.message }));
  }
  if (task.atta_request_id) {
    await query(`UPDATE atta_requests SET ${column} = $1, updated_at = NOW() WHERE id = $2`, [imageUrl, task.atta_request_id]);
  }

  logger.info('Rider proof photo uploaded', { riderId, taskId: req.params.id, stage });
  return successResponse(res, { url: imageUrl, stage }, 'Proof photo saved');
});

// ── Deliver ─────────────────────────────────────────────────────────────────

/**
 * Confirm delivery
 * PUT /api/rider/tasks/:id/deliver
 *
 * Transactional, same contract as the admin/webhook paths: the order must
 * legally transition to delivered, and rider total_deliveries increments
 * exactly once (guarded by the task's completed flip under the row lock).
 */
export const confirmDelivery = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : null;

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const attaCashReady = await hasAttaCashColumns();
  let deliveredOrder: { id: string; order_number: string; user_id: string | null } | null = null;
  let attaEvent: { userId: string; id: string; request_number: string; status: 'at_mill' | 'delivered' } | null = null;

  try {
    await withTransaction(async (client) => {
      const taskResult = await client.query(
        'SELECT * FROM rider_tasks WHERE id = $1 AND rider_id = $2 FOR UPDATE',
        [id, riderId]
      );
      if (taskResult.rows.length === 0) throw httpError('Task not found', 404);
      const task = taskResult.rows[0];

      if (!['assigned', 'in_progress'].includes(task.status)) {
        throw httpError(`Task is already ${task.status}`, 409);
      }

      if (task.order_id) {
        const orderResult = await client.query(
          'SELECT id, order_number, status, user_id, payment_method, payment_status, ocp_id FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [task.order_id]
        );
        const order = orderResult.rows[0];
        if (!order) throw httpError('Order not found', 404);
        // A non-COD order whose payment never arrived must not be handed over:
        // the rider collects no cash for it, so the goods would leave unpaid.
        if (order.payment_method !== 'cash_on_delivery' && order.payment_status !== 'completed') {
          throw httpError(
            'Payment for this order has not been received. Do not hand it over — contact the office.',
            409
          );
        }
        if (order.status !== 'delivered') {
          if (!isValidOrderTransition(order.status, 'delivered')) {
            throw httpError(`Order is ${order.status} and cannot be delivered`, 409);
          }
          await client.query(
            `UPDATE orders
             SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()),
                 delivered_by = $1,
                 payment_status = CASE
                   WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN 'completed'::payment_status
                   ELSE payment_status
                 END,
                 paid_amount = CASE
                   WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN total_amount
                   ELSE paid_amount
                 END,
                 updated_at = NOW()
             WHERE id = $2`,
            [riderId, task.order_id]
          );
          // Commit the system-stock sale (reserved → permanent) for reserved
          // orders, then deduct the OCP's own stock if the order belongs to one.
          await commitOrderSaleOnDelivery(client, task.order_id);
          await deductOcpStockOnDelivery(client, task.order_id);
          deliveredOrder = { id: order.id, order_number: order.order_number, user_id: order.user_id };
        }

        // The task row is locked and was not completed — exactly one caller
        // gets here per task, so the counter can't double-increment.
        await client.query(
          `UPDATE riders SET total_deliveries = total_deliveries + 1, updated_at = NOW() WHERE id = $1`,
          [riderId]
        );
      } else if (task.atta_request_id) {
        if (task.task_type === 'atta_pickup') {
          // Wheat dropped at the mill.
          const upd = await client.query(
            `UPDATE atta_requests
                SET status = 'at_mill', milling_started_at = COALESCE(milling_started_at, NOW()),
                    picked_up_at = COALESCE(picked_up_at, NOW()), pickup_rider_id = $2, updated_at = NOW()
              WHERE id = $1 AND status IN ('pending_pickup', 'picked_up')
              RETURNING id, request_number, user_id`,
            [task.atta_request_id, riderId]
          );
          if (upd.rows.length === 0) {
            const cur = await client.query('SELECT status FROM atta_requests WHERE id = $1', [task.atta_request_id]);
            throw httpError(`Atta request is ${cur.rows[0]?.status ?? 'missing'} — cannot mark the wheat as dropped at the mill`, 409);
          }
          attaEvent = { userId: upd.rows[0].user_id, id: upd.rows[0].id, request_number: upd.rows[0].request_number, status: 'at_mill' };
        } else {
          // Flour handed to the customer; the rider collects the atta charges in cash.
          const upd = await client.query(
            `UPDATE atta_requests
                SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()),
                    delivery_rider_id = $2,
                    payment_status = CASE
                      WHEN payment_method = 'cash_on_delivery' AND COALESCE(total_amount, 0) > 0 THEN 'completed'::payment_status
                      ELSE payment_status
                    END
                    ${attaCashReady ? `,
                    paid_amount = CASE
                      WHEN payment_method = 'cash_on_delivery' THEN COALESCE(total_amount, 0)
                      ELSE paid_amount
                    END,
                    collected_by_rider_id = CASE
                      WHEN payment_method = 'cash_on_delivery' AND COALESCE(total_amount, 0) > 0 THEN $2
                      ELSE collected_by_rider_id
                    END` : ''},
                    updated_at = NOW()
              WHERE id = $1 AND status IN ('ready_for_delivery', 'out_for_delivery')
              RETURNING id, request_number, user_id`,
            [task.atta_request_id, riderId]
          );
          if (upd.rows.length === 0) {
            const cur = await client.query('SELECT status FROM atta_requests WHERE id = $1', [task.atta_request_id]);
            throw httpError(`Atta request is ${cur.rows[0]?.status ?? 'missing'} — cannot mark it delivered`, 409);
          }
          attaEvent = { userId: upd.rows[0].user_id, id: upd.rows[0].id, request_number: upd.rows[0].request_number, status: 'delivered' };
          await client.query(
            `UPDATE riders SET total_deliveries = total_deliveries + 1, updated_at = NOW() WHERE id = $1`,
            [riderId]
          );
        }
      }

      await client.query(
        `UPDATE rider_tasks
         SET status = 'completed', completed_at = COALESCE(completed_at, NOW()),
             started_at = COALESCE(started_at, NOW()),
             notes = COALESCE($1, notes), updated_at = NOW()
         WHERE id = $2`,
        [notes, id]
      );

      // Busy while other tasks remain; never flips an off-duty rider back on.
      await syncRiderAvailability(riderId, client);
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }

  if (deliveredOrder) {
    const order = deliveredOrder as { id: string; order_number: string; user_id: string | null };
    emitOrderUpdate(order.id, {
      orderId: order.id,
      status: 'delivered',
      message: `Order #${order.order_number} has been delivered`,
    });
    if (order.user_id) {
      emitToUser(order.user_id, 'order:delivered', {
        orderId: order.id,
        orderNumber: order.order_number,
        message: `Your order #${order.order_number} has been delivered!`,
      });
      pushToCustomers([order.user_id], {
        title: 'Order delivered',
        body: `Your order #${order.order_number} has been delivered. Enjoy your fresh groceries!`,
        data: { type: 'order_delivered', orderId: order.id, orderNumber: order.order_number },
      }).catch(() => {});
    }
    emitRiderEventToAdmins(riderId, 'rider:task_completed', { taskId: id, orderId: order.id, orderNumber: order.order_number, riderId });
  }
  if (attaEvent) {
    const ev = attaEvent as { userId: string; id: string; request_number: string; status: 'at_mill' | 'delivered' };
    notifyAttaCustomer(ev.userId, ev, ev.status);
    emitRiderEventToAdmins(riderId, 'rider:task_completed', { taskId: id, attaRequestId: ev.id, orderNumber: ev.request_number, riderId });
  }

  successResponse(res, null, 'Delivery confirmed successfully');
});

// ── Fail / report a problem ─────────────────────────────────────────────────

/**
 * Mark a task as failed (rider could not complete it). The order itself is
 * deliberately left untouched — failing a delivery is an operational event
 * for the admin to resolve (reassign or cancel), not an order-state change
 * the rider is allowed to make.
 */
async function failTask(
  riderId: string,
  taskId: string,
  notes: string | null
): Promise<{ task: any }> {
  return withTransaction(async (client) => {
    const taskResult = await client.query(
      'SELECT * FROM rider_tasks WHERE id = $1 AND rider_id = $2 FOR UPDATE',
      [taskId, riderId]
    );
    if (taskResult.rows.length === 0) throw httpError('Task not found', 404);
    const task = taskResult.rows[0];
    if (!['assigned', 'in_progress'].includes(task.status)) {
      throw httpError(`Task is already ${task.status}`, 409);
    }

    const updated = await client.query(
      `UPDATE rider_tasks
       SET status = 'failed', completed_at = NOW(), notes = COALESCE($1, notes), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [notes, taskId]
    );

    await syncRiderAvailability(riderId, client);
    return { task: updated.rows[0] };
  });
}

/** Tell every admin dashboard that a rider could not finish a task. */
async function announceTaskFailure(riderId: string, task: any, reason: string | null): Promise<void> {
  try {
    const info = await query(
      `SELECT ru.full_name AS rider_name, o.order_number, ar.request_number
         FROM riders r JOIN users ru ON ru.id = r.user_id
         LEFT JOIN orders o ON o.id = $2
         LEFT JOIN atta_requests ar ON ar.id = $3
        WHERE r.id = $1`,
      [riderId, task.order_id || null, task.atta_request_id || null]
    );
    const row = info.rows[0] || {};
    const reference = row.order_number || row.request_number || '';
    emitRiderEventToAdmins(riderId, 'rider:task_failed', {
      taskId: task.id,
      taskType: task.task_type,
      orderId: task.order_id || null,
      attaRequestId: task.atta_request_id || null,
      orderNumber: reference || null,
      riderId,
      riderName: row.rider_name || null,
      notes: reason,
      message: `${row.rider_name || 'A rider'} could not complete #${reference}${reason ? ` — ${reason}` : ''}`,
    });
  } catch (err: any) {
    logger.warn('announceTaskFailure failed', { err: err?.message });
  }
}

/**
 * Update task status — dispatcher used by the mobile app.
 * PATCH /api/rider/tasks/:id/status   Body: { status, notes? }
 *   in_progress → pickup flow, completed → delivery flow, failed → fail task.
 */
export const updateTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: 'in_progress' | 'completed' | 'failed' };

  if (status === 'in_progress') return confirmPickup(req, res, () => undefined);
  if (status === 'completed') return confirmDelivery(req, res, () => undefined);

  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  try {
    const reason = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : null;
    const { task } = await failTask(riderId, req.params.id, reason);
    await announceTaskFailure(riderId, task, reason);
    logger.warn('Rider task failed', { taskId: req.params.id, riderId });
    successResponse(res, task, 'Task marked as failed');
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
});

/**
 * Report a problem (fail the task with a reason) — the rider app's action.
 * POST /api/rider/tasks/:id/cancel   Body: { reason }
 */
export const cancelTaskByRider = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (reason.length < 3) return errorResponse(res, 'Please tell us what went wrong.', 400);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  try {
    const { task } = await failTask(riderId, req.params.id, reason);
    await announceTaskFailure(riderId, task, reason);
    logger.warn('Rider reported a problem', { taskId: req.params.id, riderId, reason });
    successResponse(res, task, 'Problem reported to the admin');
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
});

// ── Contact ─────────────────────────────────────────────────────────────────

/**
 * Request to call customer (privacy protected)
 * POST /api/rider/call-request   Body: { order_id }
 *
 * Phone visible (admin override) → returns the number to dial.
 * Phone hidden → the customer is notified that the rider is at the door
 * (same as POST /tasks/:id/arrived) and `notified: true` is returned.
 */
export const requestCall = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { order_id } = req.body;
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const orderResult = await query(
    `SELECT o.id, o.rider_id, o.show_customer_phone,
            COALESCE(u.phone, o.delivery_address_snapshot->>'phone') AS customer_phone,
            (SELECT rt.id FROM rider_tasks rt
              WHERE rt.order_id = o.id AND rt.rider_id = $2 AND rt.status IN ('assigned', 'in_progress')
              ORDER BY rt.assigned_at DESC LIMIT 1) AS task_id
     FROM orders o
     LEFT JOIN users u ON o.user_id = u.id
     WHERE o.id = $1 AND o.rider_id = $2 AND o.deleted_at IS NULL`,
    [order_id, riderId]
  );

  if (orderResult.rows.length === 0) {
    return notFoundResponse(res, 'Order not found or not assigned to you');
  }

  const order = orderResult.rows[0];

  if (order.show_customer_phone && order.customer_phone) {
    const callResult = await query(
      `INSERT INTO call_requests (rider_id, order_id, virtual_number, status)
       VALUES ($1, $2, $3, 'requested')
       RETURNING id`,
      [riderId, order_id, order.customer_phone]
    );
    return successResponse(res, {
      call_request_id: callResult.rows[0].id,
      virtual_number: order.customer_phone,
      notified: false,
      message: 'Dial the number to connect with the customer.',
    }, 'Call request created successfully');
  }

  if (!order.task_id) {
    return errorResponse(res, 'This delivery is no longer active.', 409);
  }

  try {
    const out = await notifyArrival(riderId, order.task_id);
    return successResponse(res, {
      call_request_id: null,
      virtual_number: null,
      notified: out.notified,
      reason: out.reason ?? null,
      message: out.notified
        ? 'The customer has been notified that you are at the door.'
        : 'Customer phone is hidden — ask the admin to call them.',
    }, out.notified ? 'Customer notified' : 'Arrival recorded');
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
});

// ── Location / duty ─────────────────────────────────────────────────────────

/**
 * Update rider location
 * PUT /api/rider/location
 */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { latitude, longitude, accuracy } = req.body;

  const result = await query(
    `UPDATE riders
     SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         location_accuracy = $4,
         location_updated_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $3 AND deleted_at IS NULL
     RETURNING id, location_updated_at`,
    [longitude, latitude, req.user.id, accuracy ?? null]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  await emitRiderLocationUpdate({
    riderId: result.rows[0].id,
    latitude,
    longitude,
    accuracy: accuracy ?? null,
    updatedAt: result.rows[0].location_updated_at?.toISOString?.() || new Date().toISOString(),
  });

  successResponse(res, null, 'Location updated successfully');
});

/**
 * Duty toggle
 * PUT /api/rider/status   Body: { status: 'available' | 'offline' }
 *
 * 'available' with tasks still in hand is stored as 'busy' so dispatch sees
 * the real load; 'busy' itself is derived, never chosen by the rider.
 */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { status } = req.body;
  if (!['available', 'offline', 'on_leave'].includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const active = await query(
    `SELECT COUNT(*)::int AS n FROM rider_tasks WHERE rider_id = $1 AND status IN ('assigned', 'in_progress')`,
    [riderId]
  );
  const activeTasks = Number(active.rows[0]?.n || 0);
  const finalStatus = resolveDutyStatus(status, activeTasks > 0);

  const result = await query(
    `UPDATE riders SET status = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, status, location_updated_at`,
    [finalStatus, riderId]
  );

  emitRiderEventToAdmins(riderId, 'rider:status', { riderId, status: finalStatus, activeTasks });
  successResponse(res, { ...result.rows[0], active_tasks: activeTasks }, 'Status updated successfully');
});

// ── Address pin / door picture ──────────────────────────────────────────────

/** Resolve the address a task delivers to (order or atta) — or a restaurant. */
async function resolveTaskAddress(taskId: string, riderId: string) {
  const restaurantReady = await hasRestaurantOrderColumns();
  const r = await query(
    `SELECT rt.id, o.id AS order_id,
            COALESCE(o.address_id, ar.address_id) AS address_id,
            ${restaurantReady ? 'o.restaurant_id' : 'NULL::uuid AS restaurant_id'}
       FROM rider_tasks rt
       LEFT JOIN orders o ON rt.order_id = o.id
       LEFT JOIN atta_requests ar ON rt.atta_request_id = ar.id
      WHERE rt.id = $1 AND rt.rider_id = $2`,
    [taskId, riderId]
  );
  return r.rows[0] as { id: string; order_id: string | null; address_id: string | null; restaurant_id: string | null } | undefined;
}

/**
 * Pin location for a task's delivery address (persists for future orders)
 * PUT /api/rider/tasks/:id/pin-location
 */
export const pinLocation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const { latitude, longitude } = req.body;

  if (latitude == null || longitude == null) {
    return errorResponse(res, 'Latitude and longitude are required', 400);
  }

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const target = await resolveTaskAddress(id, riderId);
  if (!target) return notFoundResponse(res, 'Task not found');

  // Restaurant order: update the restaurant's MASTER location (shows everywhere)
  // + patch this order's snapshot. No addresses row exists for these.
  if (target.restaurant_id) {
    await query(
      `UPDATE restaurants
          SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, updated_at = NOW()
        WHERE id = $3`,
      [longitude, latitude, target.restaurant_id]
    );
    await query(
      `UPDATE orders
          SET delivery_address_snapshot = jsonb_set(
                COALESCE(delivery_address_snapshot, '{}'::jsonb), '{location}', $1::jsonb, true)
        WHERE id = $2`,
      [JSON.stringify({ latitude, longitude }), target.order_id]
    );
    logger.info('Rider pinned restaurant location', { riderId, taskId: id, restaurantId: target.restaurant_id });
    return successResponse(res, { latitude, longitude }, 'Location pinned successfully');
  }

  if (!target.address_id) {
    return errorResponse(res, 'This task has no saved address to pin', 400);
  }

  await query(
    `UPDATE addresses
     SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         location_added_by = 'rider',
         updated_at = NOW()
     WHERE id = $3`,
    [longitude, latitude, target.address_id]
  );

  // Keep this order's snapshot in step so admin/customer maps agree.
  if (target.order_id) {
    await query(
      `UPDATE orders
          SET delivery_address_snapshot = jsonb_set(
                COALESCE(delivery_address_snapshot, '{}'::jsonb), '{location}', $1::jsonb, true)
        WHERE id = $2`,
      [JSON.stringify({ latitude, longitude }), target.order_id]
    );
  }

  const zoneResult = await query(
    `SELECT id FROM delivery_zones
     WHERE is_active = TRUE
     AND (boundary IS NULL OR ST_Within(
       ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography::geometry,
       boundary::geometry
     ))
     LIMIT 1`,
    [longitude, latitude]
  );
  if (zoneResult.rows.length > 0) {
    await query('UPDATE addresses SET zone_id = $1 WHERE id = $2', [zoneResult.rows[0].id, target.address_id]);
  }

  logger.info('Rider pinned location for address', { riderId, taskId: id, addressId: target.address_id });
  successResponse(res, { latitude, longitude }, 'Location pinned successfully');
});

/**
 * Upload / update door picture for the delivery address
 * POST /api/rider/tasks/:id/door-picture
 */
export const uploadDoorPicture = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  if (!req.file) {
    return errorResponse(res, 'Door picture image is required', 400);
  }

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const target = await resolveTaskAddress(id, riderId);
  if (!target) return notFoundResponse(res, 'Task not found');

  const imageUrl = req.file.url || '';
  if (!imageUrl) {
    return errorResponse(res, 'Image upload failed (storage misconfigured)', 500);
  }

  // Restaurant order: the "door picture" is the restaurant's storefront photo.
  if (target.restaurant_id) {
    if (await hasRestaurantDeliveryColumns()) {
      await query(`UPDATE restaurants SET front_image_url = $1, updated_at = NOW() WHERE id = $2`, [imageUrl, target.restaurant_id]);
    }
    await query(
      `UPDATE orders
          SET delivery_address_snapshot = jsonb_set(
                COALESCE(delivery_address_snapshot, '{}'::jsonb), '{front_image_url}', $1::jsonb, true)
        WHERE id = $2`,
      [JSON.stringify(imageUrl), target.order_id]
    );
    logger.info('Rider updated restaurant front image', { riderId, taskId: id, restaurantId: target.restaurant_id });
    return successResponse(res, { url: imageUrl }, 'Front image uploaded successfully');
  }

  if (!target.address_id) {
    return errorResponse(res, 'This task has no saved address', 400);
  }

  await query(
    `UPDATE addresses SET door_picture_url = $1, updated_at = NOW() WHERE id = $2`,
    [imageUrl, target.address_id]
  );

  logger.info('Rider uploaded door picture', { riderId, taskId: id, addressId: target.address_id });
  successResponse(res, { url: imageUrl }, 'Door picture uploaded successfully');
});

// ── Earnings / stats ────────────────────────────────────────────────────────

/**
 * Today's stats for the Home dashboard (Asia/Karachi day, by delivery time)
 * GET /api/rider/stats/today
 */
export const getTodayStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const today = await computeRiderToday(riderId);
  successResponse(res, { ...today, totalDistance: 0, avgDeliveryTime: 0 }, "Today's stats retrieved successfully");
});

/**
 * Get today's earnings (legacy shape)
 * GET /api/rider/earnings/today
 */
export const getTodayEarnings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const today = await computeRiderToday(riderId);
  successResponse(res, {
    completed_deliveries: today.totalDeliveries + today.attaTasks,
    deliveries: today.totalDeliveries,
    atta_tasks: today.attaTasks,
    total_earnings: today.totalEarnings,
  }, "Today's earnings retrieved successfully");
});

/**
 * Full rider stats (periods + cash position)
 * GET /api/rider/stats
 */
export const getMyStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const stats = await computeRiderStats(riderId);
  successResponse(res, stats, 'Rider stats retrieved');
});

/**
 * Cash the rider has handed over to the company.
 * GET /api/rider/cash-settlements
 */
export const getMyCashSettlements = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');
  if (!(await hasRiderCashSettlementTables())) return successResponse(res, [], 'Cash settlements');

  const attaReady = await hasAttaCashColumns();
  const result = await query(
    `SELECT s.id, s.amount, s.status, s.note, s.received_at,
            u.full_name AS received_by_name,
            (SELECT COUNT(*)::int FROM rider_cash_settlement_orders so WHERE so.settlement_id = s.id) AS order_count,
            ${attaReady ? '(SELECT COUNT(*)::int FROM rider_cash_settlement_atta sa WHERE sa.settlement_id = s.id)' : '0'} AS atta_count
       FROM rider_cash_settlements s
       LEFT JOIN users u ON u.id = s.received_by
      WHERE s.rider_id = $1
      ORDER BY s.received_at DESC
      LIMIT 50`,
    [riderId]
  );
  successResponse(
    res,
    result.rows.map((row: any) => ({ ...row, amount: parseFloat(row.amount) || 0 })),
    'Cash settlements'
  );
});

/**
 * Customer reviews about this rider (published only). Customer identity is
 * reduced to a first name — the rider never gets a customer's contact data.
 * GET /api/rider/reviews
 */
export const getMyReviews = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const summary = await query(`SELECT rating, rating_count FROM riders WHERE id = $1`, [riderId]);
  if (!(await hasFeedbackTables())) {
    return successResponse(res, {
      rating: parseFloat(summary.rows[0]?.rating) || null,
      ratingCount: Number(summary.rows[0]?.rating_count || 0),
      reviews: [],
    }, 'Reviews');
  }

  const result = await query(
    `SELECT rv.id, rv.rating, rv.comment, rv.admin_reply, rv.created_at,
            o.order_number,
            split_part(COALESCE(u.full_name, ''), ' ', 1) AS customer_first_name
       FROM reviews rv
       LEFT JOIN orders o ON o.id = rv.order_id
       LEFT JOIN users u ON u.id = rv.user_id
      WHERE rv.target_type = 'rider' AND rv.rider_id = $1 AND rv.is_published = TRUE
      ORDER BY rv.created_at DESC
      LIMIT 50`,
    [riderId]
  );

  successResponse(res, {
    rating: summary.rows[0]?.rating_count > 0 ? parseFloat(summary.rows[0]?.rating) : null,
    ratingCount: Number(summary.rows[0]?.rating_count || 0),
    reviews: result.rows,
  }, 'Reviews');
});
