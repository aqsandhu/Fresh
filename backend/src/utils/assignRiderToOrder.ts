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

export interface AssignRiderResult {
  order: any;
  rider: { id: string; name: string };
}

export async function assignRiderToOrder(
  orderId: string,
  riderId: string,
  assignedBy?: string
): Promise<AssignRiderResult> {
  const assignment = await withTransaction(async (client) => {
    const riderResult = await client.query(
      `SELECT r.id, r.user_id, r.status, r.city_id, u.full_name
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
      'SELECT time_slot_id, status, city_id FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
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
    if (timeSlotId) {
      const chargeResult = await client.query(
        'SELECT charge_per_order FROM rider_delivery_charges WHERE rider_id = $1 AND time_slot_id = $2',
        [riderId, timeSlotId]
      );
      if (chargeResult.rows.length > 0) {
        riderCharge = parseFloat(chargeResult.rows[0].charge_per_order) || 0;
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
    await client.query("UPDATE riders SET status = 'busy', updated_at = NOW() WHERE id = $1", [riderId]);
    await client.query(
      `UPDATE rider_tasks SET status = 'cancelled', completed_at = NOW()
        WHERE order_id = $1 AND status IN ('assigned', 'in_progress')`,
      [orderId]
    );
    await client.query(
      `INSERT INTO rider_tasks (rider_id, task_type, order_id, status, assigned_at)
       VALUES ($1, 'delivery', $2, 'assigned', NOW())`,
      [riderId, orderId]
    );
    return { order: upd.rows[0], rider };
  });

  if (!assignment?.order) throw Object.assign(new Error('Order not found'), { http: 404 });
  const { order: updated, rider } = assignment;

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
  }
  if (rider.user_id) {
    emitToUser(rider.user_id, 'rider:new_assignment', {
      orderId,
      orderNumber: updated.order_number,
      message: `New delivery assignment: Order #${updated.order_number}`,
    });
  }

  return { order: updated, rider: { id: rider.id, name: rider.full_name } };
}
