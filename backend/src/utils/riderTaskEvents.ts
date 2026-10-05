// ============================================================================
// Rider task side-effects shared by the admin order paths and the assignment
// util: cancelling the active rider_tasks rows when an order is cancelled /
// reassigned, and telling the affected rider (socket + Expo push).
//
// Before this, an admin cancel left the rider's task 'assigned' and the rider
// drove to a cancelled order (pickup then failed with 409).
// ============================================================================

import { PoolClient } from 'pg';
import { emitToUser } from '../config/socket';
import { sendExpoPushToUsers } from './expoPush';
import logger from './logger';

export interface CancelledRiderTask {
  taskId: string;
  riderId: string;
  riderUserId: string | null;
}

/**
 * Cancel every active rider_tasks row for an order (inside the caller's
 * transaction). Returns the affected tasks so the caller can notify after
 * commit. `exceptRiderId` keeps the newly assigned rider's task untouched.
 */
export async function cancelActiveRiderTasks(
  client: PoolClient,
  orderId: string,
  opts: { exceptRiderId?: string | null; note?: string | null } = {}
): Promise<CancelledRiderTask[]> {
  const params: unknown[] = [orderId];
  let exceptSql = '';
  if (opts.exceptRiderId) {
    params.push(opts.exceptRiderId);
    exceptSql = ` AND rt.rider_id <> $${params.length}`;
  }
  params.push(opts.note ?? null);
  const noteIdx = params.length;

  const result = await client.query(
    `UPDATE rider_tasks rt
        SET status = 'cancelled',
            completed_at = NOW(),
            notes = COALESCE($${noteIdx}, rt.notes),
            updated_at = NOW()
       FROM riders r
      WHERE rt.rider_id = r.id
        AND rt.order_id = $1
        AND rt.status IN ('assigned', 'in_progress')${exceptSql}
      RETURNING rt.id AS task_id, rt.rider_id, r.user_id AS rider_user_id`,
    params
  );
  return result.rows.map((row) => ({
    taskId: row.task_id,
    riderId: row.rider_id,
    riderUserId: row.rider_user_id ?? null,
  }));
}

/** Socket + push to each rider whose task was cancelled. Call AFTER commit. */
export function notifyRiderTasksCancelled(
  tasks: CancelledRiderTask[],
  order: { id: string; order_number?: string | null },
  reason: string | null | undefined
): void {
  for (const task of tasks) {
    if (!task.riderUserId) continue;
    const payload = {
      taskId: task.taskId,
      orderId: order.id,
      orderNumber: order.order_number ?? null,
      reason: reason ?? null,
      message: `Order #${order.order_number ?? ''} was cancelled or reassigned`,
    };
    emitToUser(task.riderUserId, 'rider:task_cancelled', payload);
    sendExpoPushToUsers([task.riderUserId], {
      title: 'Task cancelled',
      body: `Order #${order.order_number ?? ''} was cancelled or reassigned.`,
      data: { type: 'task_cancelled', ...payload },
      channelId: 'task-update',
    }).catch(() => {});
    logger.info('Rider task cancelled', { taskId: task.taskId, riderId: task.riderId, orderId: order.id });
  }
}

export type AttaTaskType = 'atta_pickup' | 'atta_delivery';

/**
 * Create the rider_tasks row for an Atta Chakki pickup/delivery assignment
 * (admin sets pickup_rider_id / delivery_rider_id). Any previous active task of
 * the same type on the request is cancelled first (reassignment). Returns the
 * new task id + the rider's user id so the caller can notify after commit.
 */
export async function createAttaRiderTask(
  client: PoolClient,
  attaRequestId: string,
  riderId: string,
  taskType: AttaTaskType
): Promise<{ taskId: string; riderUserId: string | null; displaced: CancelledRiderTask[] }> {
  const displacedRes = await client.query(
    `UPDATE rider_tasks rt
        SET status = 'cancelled', completed_at = NOW(), notes = COALESCE(rt.notes, 'Reassigned by admin'), updated_at = NOW()
       FROM riders r
      WHERE rt.rider_id = r.id
        AND rt.atta_request_id = $1
        AND rt.task_type = $2
        AND rt.status IN ('assigned', 'in_progress')
        AND rt.rider_id <> $3
      RETURNING rt.id AS task_id, rt.rider_id, r.user_id AS rider_user_id`,
    [attaRequestId, taskType, riderId]
  );
  const displaced = displacedRes.rows.map((row) => ({
    taskId: row.task_id,
    riderId: row.rider_id,
    riderUserId: row.rider_user_id ?? null,
  }));

  // Same rider already holds an active task of this type → keep it.
  const existing = await client.query(
    `SELECT id FROM rider_tasks
      WHERE atta_request_id = $1 AND task_type = $2 AND rider_id = $3 AND status IN ('assigned', 'in_progress')
      LIMIT 1`,
    [attaRequestId, taskType, riderId]
  );
  const riderUser = await client.query('SELECT user_id FROM riders WHERE id = $1', [riderId]);
  const riderUserId: string | null = riderUser.rows[0]?.user_id ?? null;
  if (existing.rows.length > 0) {
    return { taskId: existing.rows[0].id, riderUserId, displaced };
  }

  // Customer's address is the pickup point (wheat) and the delivery point (flour).
  const addr = await client.query(
    `SELECT a.written_address, ST_X(a.location::geometry) AS lng, ST_Y(a.location::geometry) AS lat
       FROM atta_requests ar
       LEFT JOIN addresses a ON a.id = ar.address_id
      WHERE ar.id = $1`,
    [attaRequestId]
  );
  const address = addr.rows[0]?.written_address ?? null;
  const lng = addr.rows[0]?.lng ?? null;
  const lat = addr.rows[0]?.lat ?? null;
  const locationSql = lng !== null && lat !== null ? 'ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography' : 'NULL';
  const params: unknown[] = [riderId, taskType, attaRequestId, address];
  if (lng !== null && lat !== null) params.push(lng, lat);

  const inserted = await client.query(
    `INSERT INTO rider_tasks (rider_id, task_type, atta_request_id, status, assigned_at,
                              pickup_address, delivery_address, pickup_location, delivery_location)
     VALUES ($1, $2, $3, 'assigned', NOW(),
             CASE WHEN $2 = 'atta_pickup' THEN $4 ELSE NULL END,
             CASE WHEN $2 = 'atta_delivery' THEN $4 ELSE NULL END,
             CASE WHEN $2 = 'atta_pickup' THEN ${locationSql} ELSE NULL END,
             CASE WHEN $2 = 'atta_delivery' THEN ${locationSql} ELSE NULL END)
     RETURNING id`,
    params
  );
  await client.query("UPDATE riders SET status = 'busy', updated_at = NOW() WHERE id = $1 AND status = 'available'", [riderId]);
  return { taskId: inserted.rows[0].id, riderUserId, displaced };
}

/** Socket + push for a new Atta Chakki task. Call AFTER commit. */
export function notifyAttaAssignment(
  riderUserId: string | null,
  request: { id: string; request_number?: string | null },
  taskType: AttaTaskType,
  taskId: string
): void {
  if (!riderUserId) return;
  const label = taskType === 'atta_pickup' ? 'Atta pickup' : 'Atta delivery';
  const payload = {
    taskId,
    attaRequestId: request.id,
    orderNumber: request.request_number ?? null,
    taskType,
    message: `${label}: request #${request.request_number ?? ''}`,
  };
  emitToUser(riderUserId, 'rider:new_assignment', payload);
  sendExpoPushToUsers([riderUserId], {
    title: `New ${label.toLowerCase()} assigned`,
    body: `Request #${request.request_number ?? ''} is ready for you.`,
    data: { type: 'new_task', ...payload },
    channelId: 'new-task',
  }).catch(() => {});
}

/** Push for a brand-new assignment (socket emit stays in assignRiderToOrder). */
export function pushNewAssignment(
  riderUserId: string | null | undefined,
  order: { id: string; order_number?: string | null },
  taskId?: string | null
): void {
  if (!riderUserId) return;
  sendExpoPushToUsers([riderUserId], {
    title: 'New delivery assigned',
    body: `Order #${order.order_number ?? ''} is ready for you.`,
    data: { type: 'new_task', orderId: order.id, orderNumber: order.order_number ?? null, taskId: taskId ?? null },
    channelId: 'new-task',
  }).catch(() => {});
}
