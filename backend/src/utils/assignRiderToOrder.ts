// ============================================================================
// Shared rider-assignment core — used by the admin Orders controller AND the
// OCP operator. Validates the rider, atomically (FOR UPDATE) flips the order to
// out_for_delivery, snapshots the rider charge, swaps the rider_task, and emits
// the realtime events. Callers do their own scope check (city / OCP) first.
// Throws Object.assign(Error, { http }) on validation failures.
// ============================================================================

import { withTransaction } from '../config/database';
import { emitOrderUpdate, emitToUser } from '../config/socket';
import logger from './logger';
import { isValidOrderTransition } from './orderStatus';
import { cancelActiveRiderTasks, notifyRiderTasksCancelled, pushNewAssignment } from './riderTaskEvents';
import { pushToCustomers } from './customerNotify';
import { syncRiderAvailability } from './riderAvailability';
import { hasUrgentDeliveryColumns } from '../config/orderSchema';
import { hasRiderUrgentChargeColumn } from '../config/riderSchema';

export interface AssignRiderResult {
  order: any;
  rider: { id: string; name: string };
}

export async function assignRiderToOrder(
  orderId: string,
  riderId: string,
  assignedBy?: string
): Promise<AssignRiderResult> {
  const [urgentReady, urgentRateReady] = await Promise.all([
    hasUrgentDeliveryColumns(),
    hasRiderUrgentChargeColumn(),
  ]);
  const assignment = await withTransaction(async (client) => {
    const riderResult = await client.query(
      `SELECT r.id, r.user_id, r.status, r.city_id, u.full_name,
              ${urgentRateReady ? 'r.urgent_delivery_charge' : 'NULL::numeric AS urgent_delivery_charge'}
         FROM riders r
         JOIN users u ON r.user_id = u.id
        WHERE r.id = $1 AND r.verification_status = 'verified' AND r.deleted_at IS NULL
        FOR UPDATE OF r`,
      [riderId]
    );
    if (riderResult.rows.length === 0) {
      throw Object.assign(new Error('Rider not found or not verified'), { http: 404 });
    }
    const rider = riderResult.rows[0];
    if (rider.status === 'offline' || rider.status === 'on_leave') {
      throw Object.assign(new Error(`Rider is ${rider.status}. Cannot assign orders.`), { http: 400 });
    }

    const orderCheck = await client.query(
      `SELECT time_slot_id, status, city_id,
              ${urgentReady ? 'COALESCE(is_urgent_delivery, FALSE) AS is_urgent' : 'FALSE AS is_urgent'}
         FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [orderId]
    );
    if (orderCheck.rows.length === 0) {
      throw Object.assign(new Error('Order not found'), { http: 404 });
    }
    const order = orderCheck.rows[0];
    if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
      throw Object.assign(new Error('Cannot assign rider to a completed or cancelled order'), { http: 400 });
    }
    if (rider.city_id && order.city_id && rider.city_id !== order.city_id) {
      throw Object.assign(new Error('Rider belongs to a different service city'), { http: 400 });
    }
    if (order.status !== 'out_for_delivery' && !isValidOrderTransition(order.status, 'out_for_delivery')) {
      throw Object.assign(new Error('Order must be ready for pickup before assigning a rider'), { http: 400 });
    }

    const timeSlotId = order.time_slot_id;
    let riderCharge = 0;
    // Urgent order + the rider has a dedicated urgent rate (migration 58) →
    // that rate, and nothing else. Otherwise the slot rules below apply.
    const urgentRate =
      order.is_urgent === true && rider.urgent_delivery_charge !== null && rider.urgent_delivery_charge !== undefined
        ? parseFloat(rider.urgent_delivery_charge)
        : null;
    if (urgentRate !== null && Number.isFinite(urgentRate)) {
      riderCharge = urgentRate;
    } else if (timeSlotId) {
      const chargeResult = await client.query(
        'SELECT charge_per_order FROM rider_delivery_charges WHERE rider_id = $1 AND time_slot_id = $2',
        [riderId, timeSlotId]
      );
      if (chargeResult.rows.length > 0) {
        riderCharge = parseFloat(chargeResult.rows[0].charge_per_order) || 0;
      }
    }
    if (urgentRate === null && (!timeSlotId || riderCharge === 0)) {
      // No urgent rate set / no slot rate for this slot: fall back to the
      // rider's most recently configured per-order rate so the delivery is
      // never silently unpaid.
      const fallback = await client.query(
        `SELECT charge_per_order FROM rider_delivery_charges
          WHERE rider_id = $1 AND charge_per_order > 0
          ORDER BY effective_from DESC, updated_at DESC LIMIT 1`,
        [riderId]
      );
      if (fallback.rows.length > 0) {
        riderCharge = parseFloat(fallback.rows[0].charge_per_order) || 0;
      }
    }

    const upd = await client.query(
      `UPDATE orders
          SET rider_id = $1,
              assigned_at = NOW(),
              rider_delivery_charge = $3,
              status = 'out_for_delivery',
              out_for_delivery_at = COALESCE(out_for_delivery_at, NOW()),
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [riderId, orderId, riderCharge]
    );
    // Close any previous task on this order (reassignment). The displaced
    // rider is told after commit — before this, they drove to an order that
    // was no longer theirs. cancelActiveRiderTasks also frees that rider.
    const displaced = await cancelActiveRiderTasks(client, orderId, { note: 'Reassigned by admin' });
    // Queue position: after whatever this rider is already carrying.
    const task = await client.query(
      `INSERT INTO rider_tasks (rider_id, task_type, order_id, status, assigned_at, sequence_number)
       VALUES ($1, 'delivery', $2, 'assigned', NOW(),
               COALESCE((SELECT MAX(sequence_number) FROM rider_tasks
                          WHERE rider_id = $1 AND status IN ('assigned', 'in_progress')), 0) + 1)
       RETURNING id`,
      [riderId, orderId]
    );
    await syncRiderAvailability(riderId, client);
    return { order: upd.rows[0], rider, displaced, taskId: task.rows[0]?.id as string | undefined };
  });

  if (!assignment?.order) throw Object.assign(new Error('Order not found'), { http: 404 });
  const { order: updated, rider, displaced, taskId } = assignment;

  logger.info('Rider assigned to order', { orderId, riderId, assignedBy });

  emitOrderUpdate(orderId, {
    orderId,
    status: 'out_for_delivery',
    riderId,
    riderName: rider.full_name,
    message: `Rider ${rider.full_name} assigned to order #${updated.order_number}`,
  });
  if (updated.user_id) {
    emitToUser(updated.user_id, 'order:rider_assigned', {
      orderId,
      orderNumber: updated.order_number,
      riderName: rider.full_name,
      status: 'out_for_delivery',
      message: `Rider ${rider.full_name} is on the way with your order #${updated.order_number}!`,
    });
    pushToCustomers([updated.user_id], {
      title: 'Your order is on the way',
      body: `Rider ${rider.full_name} is bringing order #${updated.order_number}.`,
      data: { type: 'rider_assigned', orderId, orderNumber: updated.order_number },
    }).catch(() => {});
  }
  if (rider.user_id) {
    emitToUser(rider.user_id, 'rider:new_assignment', {
      orderId,
      orderNumber: updated.order_number,
      taskId: taskId ?? null,
      message: `New delivery assignment: Order #${updated.order_number}`,
    });
    // Backgrounded phones only hear about this via push.
    pushNewAssignment(rider.user_id, { id: orderId, order_number: updated.order_number }, taskId);
  }
  // A different rider previously held this order — tell them it's gone.
  notifyRiderTasksCancelled(
    displaced.filter((d) => d.riderId !== riderId),
    { id: orderId, order_number: updated.order_number },
    'Reassigned to another rider'
  );

  return { order: updated, rider: { id: rider.id, name: rider.full_name } };
}
