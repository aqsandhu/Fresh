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
