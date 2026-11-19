// Shared helpers for the rider handlers (moved from rider.controller.ts, W21).

import { asCaughtError } from '../../utils/caughtError';
import { query, withTransaction } from '../../config/database';
import { emitOrderUpdate, emitToUser, emitRiderEventToAdmins } from '../../config/socket';
import { hasOrderCouponColumns, hasUrgentDeliveryColumns, hasRestaurantOrderColumns } from '../../config/orderSchema';
import { hasOcpTables } from '../../config/ocpSchema';
import { hasAttaCashColumns, hasRiderTaskArrivedColumn } from '../../config/riderSchema';
import { pushToCustomers } from '../../utils/customerNotify';
import { syncRiderAvailability } from '../../utils/riderAvailability';
import logger from '../../utils/logger';

export interface TaskSqlFlags {
  urgent: boolean;
  restaurant: boolean;
  ocp: boolean;
  arrived: boolean;
  attaCash: boolean;
  coupon: boolean;
}

export async function taskSqlFlags(): Promise<TaskSqlFlags> {
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
export const jsonNum = (expr: string) => `(CASE WHEN (${expr}) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${expr})::float8 END)`;

export const SNAP = 'o.delivery_address_snapshot';

export function taskSelect(f: TaskSqlFlags, detail: boolean): string {
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

export async function resolveRiderId(userId: string): Promise<string | null> {
  const riderResult = await query('SELECT id FROM riders WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
  return riderResult.rows[0]?.id || null;
}

/** Throws-as-response helper for transaction blocks. */
export const httpError = (message: string, http: number) => Object.assign(new Error(message), { http });

// ── Profile ─────────────────────────────────────────────────────────────────

export function notifyAttaCustomer(
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

export const ARRIVAL_REPEAT_MS = 2 * 60 * 1000;

export const lastArrivalPing = new Map<string, number>();

export interface ArrivalOutcome {
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
export async function notifyArrival(riderId: string, taskId: string): Promise<ArrivalOutcome> {
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
 * Mark a task as failed (rider could not complete it). The order itself is
 * deliberately left untouched — failing a delivery is an operational event
 * for the admin to resolve (reassign or cancel), not an order-state change
 * the rider is allowed to make.
 */
export async function failTask(
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
export async function announceTaskFailure(riderId: string, task: any, reason: string | null): Promise<void> {
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
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    logger.warn('announceTaskFailure failed', { err: err?.message });
  }
}

/** Resolve the address a task delivers to (order or atta) — or a restaurant. */
export async function resolveTaskAddress(taskId: string, riderId: string) {
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
