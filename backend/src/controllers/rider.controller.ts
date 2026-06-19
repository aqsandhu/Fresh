// ============================================================================
// RIDER CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../utils/response';
import { isValidOrderTransition } from '../utils/orderStatus';
import { hasRestaurantDeliveryColumns } from '../config/restaurantSchema';
import { deductOcpStockOnDelivery } from '../utils/ocpStock';
import { commitOrderSaleOnDelivery } from '../utils/systemStock';
import { emitOrderUpdate, emitToUser, emitToAdmins } from '../config/socket';
import logger from '../utils/logger';

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
      r.status, r.verification_status, r.rating,
      r.total_deliveries, r.total_earnings,
      ST_X(r.current_location::geometry) as longitude,
      ST_Y(r.current_location::geometry) as latitude,
      r.location_updated_at,
      u.full_name, u.phone, u.email, u.avatar_url
    FROM riders r
    JOIN users u ON r.user_id = u.id
    WHERE r.user_id = $1 AND r.deleted_at IS NULL`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Rider profile not found');
  }

  successResponse(res, result.rows[0], 'Rider profile retrieved successfully');
});

/**
 * Get assigned tasks
 * GET /api/rider/tasks
 */
export const getTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { status, page = 1, limit = 20 } = req.query;

  // Get rider ID
  const riderResult = await query(
    'SELECT id FROM riders WHERE user_id = $1',
    [req.user.id]
  );

  if (riderResult.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  const riderId = riderResult.rows[0].id;

  let sql = `
    FROM rider_tasks rt
    LEFT JOIN orders o ON rt.order_id = o.id
    LEFT JOIN users ou ON o.user_id = ou.id
    LEFT JOIN atta_requests ar ON rt.atta_request_id = ar.id
    WHERE rt.rider_id = $1
  `;

  const params: any[] = [riderId];
  let paramIndex = 2;

  if (status) {
    sql += ` AND rt.status = $${paramIndex++}`;
    params.push(status);
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get tasks
  const tasksSql = `
    SELECT 
      rt.id, rt.task_type, rt.status,
      rt.assigned_at, rt.accepted_at, rt.started_at, rt.completed_at,
      rt.sequence_number, rt.estimated_duration,
      rt.pickup_address, rt.delivery_address,
      ST_X(rt.pickup_location::geometry) as pickup_longitude,
      ST_Y(rt.pickup_location::geometry) as pickup_latitude,
      ST_X(rt.delivery_location::geometry) as delivery_longitude,
      ST_Y(rt.delivery_location::geometry) as delivery_latitude,
      rt.pickup_proof_image, rt.delivery_proof_image, rt.notes,
      -- Order details
      o.id as order_id, o.order_number, o.status as order_status,
      o.total_amount, o.payment_method, o.payment_status,
      -- Delivery address from order
      o.delivery_address_snapshot->>'written_address' as order_delivery_address,
      o.delivery_address_snapshot->>'landmark' as order_landmark,
      o.delivery_address_snapshot->>'house_number' as order_house_number,
      -- Customer phone (only when admin allows)
      CASE WHEN o.show_customer_phone = true THEN ou.phone ELSE NULL END as customer_phone,
      CASE WHEN o.show_customer_phone = true THEN ou.full_name ELSE NULL END as customer_name,
      -- Atta request details
      ar.id as atta_request_id, ar.request_number as atta_request_number,
      ar.status as atta_status, ar.wheat_quantity_kg
    ${sql}
    ORDER BY 
      CASE rt.status 
        WHEN 'assigned' THEN 1 
        WHEN 'in_progress' THEN 2 
        ELSE 3 
      END,
      rt.sequence_number ASC,
      rt.assigned_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(tasksSql, params);

  successResponse(res, {
    tasks: result.rows,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
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

  const riderResult = await query('SELECT id FROM riders WHERE user_id = $1', [req.user.id]);
  if (riderResult.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  const riderId = riderResult.rows[0].id;

  const result = await query(
    `SELECT 
      rt.id, rt.task_type, rt.status,
      rt.assigned_at, rt.accepted_at, rt.started_at, rt.completed_at,
      rt.sequence_number, rt.estimated_duration,
      rt.pickup_address, rt.delivery_address,
      ST_X(rt.pickup_location::geometry) as pickup_longitude,
      ST_Y(rt.pickup_location::geometry) as pickup_latitude,
      ST_X(rt.delivery_location::geometry) as delivery_longitude,
      ST_Y(rt.delivery_location::geometry) as delivery_latitude,
      rt.pickup_proof_image, rt.delivery_proof_image, rt.notes,
      o.id as order_id, o.order_number, o.status as order_status,
      o.total_amount, o.payment_method, o.payment_status,
      o.delivery_address_snapshot->>'written_address' as order_delivery_address,
      o.delivery_address_snapshot->>'landmark' as order_landmark,
      o.delivery_address_snapshot->>'house_number' as order_house_number,
      CASE WHEN o.show_customer_phone = true THEN ou.phone ELSE NULL END as customer_phone,
      CASE WHEN o.show_customer_phone = true THEN ou.full_name ELSE NULL END as customer_name,
      ar.id as atta_request_id, ar.status as atta_status, ar.wheat_quantity_kg
    FROM rider_tasks rt
    LEFT JOIN orders o ON rt.order_id = o.id
    LEFT JOIN users ou ON o.user_id = ou.id
    LEFT JOIN atta_requests ar ON rt.atta_request_id = ar.id
    WHERE rt.rider_id = $1 AND rt.status IN ('assigned', 'in_progress')
    ORDER BY 
      CASE rt.status WHEN 'in_progress' THEN 1 WHEN 'assigned' THEN 2 END,
      rt.sequence_number ASC, rt.assigned_at DESC`,
    [riderId]
  );

  successResponse(res, result.rows, 'Active tasks retrieved successfully');
});

/**
 * Get completed tasks — flat array for mobile app
 * GET /api/rider/tasks/completed
 */
export const getCompletedTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const riderResult = await query('SELECT id FROM riders WHERE user_id = $1', [req.user.id]);
  if (riderResult.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  const riderId = riderResult.rows[0].id;

  const result = await query(
    `SELECT 
      rt.id, rt.task_type, rt.status,
      rt.assigned_at, rt.accepted_at, rt.started_at, rt.completed_at,
      rt.sequence_number, rt.estimated_duration,
      rt.pickup_address, rt.delivery_address,
      ST_X(rt.pickup_location::geometry) as pickup_longitude,
      ST_Y(rt.pickup_location::geometry) as pickup_latitude,
      ST_X(rt.delivery_location::geometry) as delivery_longitude,
      ST_Y(rt.delivery_location::geometry) as delivery_latitude,
      rt.pickup_proof_image, rt.delivery_proof_image, rt.notes,
      o.id as order_id, o.order_number, o.status as order_status,
      o.total_amount, o.payment_method, o.payment_status,
      o.delivery_address_snapshot->>'written_address' as order_delivery_address,
      o.delivery_address_snapshot->>'landmark' as order_landmark,
      o.delivery_address_snapshot->>'house_number' as order_house_number,
      CASE WHEN o.show_customer_phone = true THEN ou.phone ELSE NULL END as customer_phone,
      CASE WHEN o.show_customer_phone = true THEN ou.full_name ELSE NULL END as customer_name,
      ar.id as atta_request_id, ar.status as atta_status, ar.wheat_quantity_kg
    FROM rider_tasks rt
    LEFT JOIN orders o ON rt.order_id = o.id
    LEFT JOIN users ou ON o.user_id = ou.id
    LEFT JOIN atta_requests ar ON rt.atta_request_id = ar.id
    WHERE rt.rider_id = $1 AND rt.status = 'completed'
    ORDER BY rt.completed_at DESC
    LIMIT 50`,
    [riderId]
  );

  successResponse(res, result.rows, 'Completed tasks retrieved successfully');
});

/**
 * Get today's stats for mobile app dashboard
 * GET /api/rider/stats/today
 */
export const getTodayStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const riderResult = await query('SELECT id FROM riders WHERE user_id = $1', [req.user.id]);
  if (riderResult.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  const riderId = riderResult.rows[0].id;

  const result = await query(
    `SELECT 
      COUNT(*) FILTER (WHERE rt.status = 'completed') as total_deliveries,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE rt.status = 'completed'), 0) as total_earnings
    FROM rider_tasks rt
    LEFT JOIN orders o ON rt.order_id = o.id
    WHERE rt.rider_id = $1 AND DATE(rt.completed_at) = CURRENT_DATE`,
    [riderId]
  );

  const row = result.rows[0];
  successResponse(res, {
    date: new Date().toISOString().split('T')[0],
    totalDeliveries: parseInt(row.total_deliveries) || 0,
    totalEarnings: parseFloat(row.total_earnings) || 0,
    totalDistance: 0,
    avgDeliveryTime: 0,
  }, "Today's stats retrieved successfully");
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

  // Get rider ID
  const riderResult = await query(
    'SELECT id FROM riders WHERE user_id = $1',
    [req.user.id]
  );

  if (riderResult.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  const riderId = riderResult.rows[0].id;

  const result = await query(
    `SELECT 
      rt.id, rt.task_type, rt.status,
      rt.assigned_at, rt.accepted_at, rt.started_at, rt.completed_at,
      rt.sequence_number, rt.estimated_duration,
      rt.pickup_address,
      ST_X(rt.pickup_location::geometry) as pickup_longitude,
      ST_Y(rt.pickup_location::geometry) as pickup_latitude,
      ST_X(rt.delivery_location::geometry) as delivery_longitude,
      ST_Y(rt.delivery_location::geometry) as delivery_latitude,
      rt.pickup_proof_image, rt.delivery_proof_image, rt.notes,
      -- Order details
      o.id as order_id, o.order_number, o.status as order_status,
      o.total_amount, o.delivery_charge, o.payment_method, o.payment_status,
      o.customer_notes,
      o.delivery_address_snapshot->>'written_address' as order_delivery_address,
      o.delivery_address_snapshot->>'landmark' as order_landmark,
      o.delivery_address_snapshot->>'house_number' as order_house_number,
      o.delivery_address_snapshot->>'area_name' as order_area,
      o.delivery_address_snapshot->>'city' as order_city,
      -- Customer phone (privacy-controlled)
      CASE WHEN o.show_customer_phone = true THEN ou.phone ELSE NULL END as customer_phone,
      CASE WHEN o.show_customer_phone = true THEN ou.full_name ELSE NULL END as customer_name,
      -- Address location & door picture from live addresses table
      o.address_id,
      CASE WHEN a.location IS NOT NULL THEN true ELSE false END as has_location,
      a.location_added_by,
      ST_X(a.location::geometry) as address_longitude,
      ST_Y(a.location::geometry) as address_latitude,
      a.door_picture_url,
      -- Time slot
      ts.slot_name as time_slot_name, ts.start_time, ts.end_time, o.requested_delivery_date,
      -- Atta request details
      ar.id as atta_request_id, ar.request_number as atta_request_number,
      ar.status as atta_status, ar.wheat_quantity_kg
    FROM rider_tasks rt
    LEFT JOIN orders o ON rt.order_id = o.id
    LEFT JOIN users ou ON o.user_id = ou.id
    LEFT JOIN addresses a ON o.address_id = a.id
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    LEFT JOIN atta_requests ar ON rt.atta_request_id = ar.id
    WHERE rt.id = $1 AND rt.rider_id = $2`,
    [id, riderId]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Task not found');
  }

  const task = result.rows[0];

  // Fetch order items if order exists
  let items: any[] = [];
  if (task.order_id) {
    const itemsResult = await query(
      `SELECT id, product_name, quantity, unit_price, total_price, special_instructions
       FROM order_items WHERE order_id = $1 ORDER BY created_at`,
      [task.order_id]
    );
    items = itemsResult.rows;
  }

  successResponse(res, { ...task, items }, 'Task details retrieved successfully');
});

/**
 * Accept task
 * PUT /api/rider/tasks/:id/accept
 */
export const acceptTask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;

  // Get rider ID
  const riderResult = await query(
    'SELECT id FROM riders WHERE user_id = $1',
    [req.user.id]
  );

  if (riderResult.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  const riderId = riderResult.rows[0].id;

  // Accepting only stamps accepted_at — the task stays 'assigned' until the
  // rider actually starts (pickup flips it to in_progress). COALESCE keeps a
  // double-tap from moving the original acceptance time.
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

async function resolveRiderId(userId: string): Promise<string | null> {
  const riderResult = await query('SELECT id FROM riders WHERE user_id = $1', [userId]);
  return riderResult.rows[0]?.id || null;
}

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
  const { notes } = req.body;

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) {
    return notFoundResponse(res, 'Rider not found');
  }

  try {
    await withTransaction(async (client) => {
      const taskResult = await client.query(
        'SELECT * FROM rider_tasks WHERE id = $1 AND rider_id = $2 FOR UPDATE',
        [id, riderId]
      );
      if (taskResult.rows.length === 0) {
        throw Object.assign(new Error('Task not found'), { http: 404 });
      }
      const task = taskResult.rows[0];

      if (!['assigned', 'in_progress'].includes(task.status)) {
        throw Object.assign(
          new Error(`Task is already ${task.status}`),
          { http: 409 }
        );
      }

      await client.query(
        `UPDATE rider_tasks
         SET status = 'in_progress', started_at = COALESCE(started_at, NOW()),
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
        if (!order) {
          throw Object.assign(new Error('Order not found'), { http: 404 });
        }
        // Already out for delivery (e.g. set at assignment) — nothing to do.
        if (order.status !== 'out_for_delivery') {
          if (!isValidOrderTransition(order.status, 'out_for_delivery')) {
            throw Object.assign(
              new Error(`Order is ${order.status} and cannot be picked up`),
              { http: 409 }
            );
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
        await client.query(
          `UPDATE atta_requests
           SET status = 'picked_up', picked_up_at = COALESCE(picked_up_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [task.atta_request_id]
        );
      }
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }

  successResponse(res, null, 'Pickup confirmed successfully');
});

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
  const { notes } = req.body;

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) {
    return notFoundResponse(res, 'Rider not found');
  }

  let deliveredOrder: { id: string; order_number: string; user_id: string } | null = null;

  try {
    await withTransaction(async (client) => {
      const taskResult = await client.query(
        'SELECT * FROM rider_tasks WHERE id = $1 AND rider_id = $2 FOR UPDATE',
        [id, riderId]
      );
      if (taskResult.rows.length === 0) {
        throw Object.assign(new Error('Task not found'), { http: 404 });
      }
      const task = taskResult.rows[0];

      if (!['assigned', 'in_progress'].includes(task.status)) {
        throw Object.assign(
          new Error(`Task is already ${task.status}`),
          { http: 409 }
        );
      }

      if (task.order_id) {
        const orderResult = await client.query(
          'SELECT id, order_number, status, user_id FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [task.order_id]
        );
        const order = orderResult.rows[0];
        if (!order) {
          throw Object.assign(new Error('Order not found'), { http: 404 });
        }
        if (order.status !== 'delivered') {
          if (!isValidOrderTransition(order.status, 'delivered')) {
            throw Object.assign(
              new Error(`Order is ${order.status} and cannot be delivered`),
              { http: 409 }
            );
          }
          await client.query(
            `UPDATE orders
             SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()),
                 delivered_by = $1, updated_at = NOW()
             WHERE id = $2`,
            [riderId, task.order_id]
          );
          // Commit the system-stock sale (reserved → permanent) for reserved
          // orders, then deduct the OCP's own stock if the order belongs to one.
          // Both idempotent + locked in this transaction.
          await commitOrderSaleOnDelivery(client, task.order_id);
          await deductOcpStockOnDelivery(client, task.order_id);
          deliveredOrder = { id: order.id, order_number: order.order_number, user_id: order.user_id };
        }

        // The task row is locked and was not completed — exactly one caller
        // gets here per task, so the counter can't double-increment.
        await client.query(
          `UPDATE riders
           SET total_deliveries = total_deliveries + 1, status = 'available', updated_at = NOW()
           WHERE id = $1`,
          [riderId]
        );
      } else if (task.atta_request_id) {
        await client.query(
          `UPDATE atta_requests
           SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [task.atta_request_id]
        );
      }

      await client.query(
        `UPDATE rider_tasks
         SET status = 'completed', completed_at = COALESCE(completed_at, NOW()),
             notes = COALESCE($1, notes), updated_at = NOW()
         WHERE id = $2`,
        [notes, id]
      );
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }

  if (deliveredOrder) {
    const order = deliveredOrder as { id: string; order_number: string; user_id: string };
    emitOrderUpdate(order.id, {
      orderId: order.id,
      status: 'delivered',
      message: `Order #${order.order_number} has been delivered`,
    });
    emitToUser(order.user_id, 'order:delivered', {
      orderId: order.id,
      orderNumber: order.order_number,
      message: `Your order #${order.order_number} has been delivered!`,
    });
  }

  successResponse(res, null, 'Delivery confirmed successfully');
});

/**
 * Mark a task as failed (rider could not complete it).
 * Shared by PATCH /tasks/:id/status { status: 'failed' } and
 * POST /tasks/:id/cancel { reason }.
 *
 * The order is deliberately left untouched — failing a delivery is an
 * operational event for the admin to resolve (reassign or cancel), not an
 * order-state change the rider is allowed to make.
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
    if (taskResult.rows.length === 0) {
      throw Object.assign(new Error('Task not found'), { http: 404 });
    }
    const task = taskResult.rows[0];
    if (!['assigned', 'in_progress'].includes(task.status)) {
      throw Object.assign(new Error(`Task is already ${task.status}`), { http: 409 });
    }

    const updated = await client.query(
      `UPDATE rider_tasks
       SET status = 'failed', completed_at = NOW(), notes = COALESCE($1, notes), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [notes, taskId]
    );

    await client.query(
      `UPDATE riders SET status = 'available', updated_at = NOW() WHERE id = $1`,
      [riderId]
    );

    return { task: { ...updated.rows[0], order_id: task.order_id } };
  });
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

  // status === 'failed'
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  try {
    const { task } = await failTask(riderId, req.params.id, req.body?.notes || null);
    if (task.order_id) {
      emitToAdmins('rider:task_failed', {
        taskId: task.id,
        orderId: task.order_id,
        riderId,
        notes: task.notes,
        message: 'A delivery task was marked failed by the rider',
      });
    }
    logger.warn('Rider task failed', { taskId: req.params.id, riderId });
    successResponse(res, task, 'Task marked as failed');
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
});

/**
 * Cancel (fail) a task with a reason — used by the rider app's Cancel action.
 * POST /api/rider/tasks/:id/cancel   Body: { reason }
 */
export const cancelTaskByRider = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  try {
    const { task } = await failTask(riderId, req.params.id, reason);
    if (task.order_id) {
      emitToAdmins('rider:task_failed', {
        taskId: task.id,
        orderId: task.order_id,
        riderId,
        notes: reason,
        message: 'A delivery task was cancelled by the rider',
      });
    }
    logger.warn('Rider cancelled task', { taskId: req.params.id, riderId, reason });
    successResponse(res, task, 'Task cancelled');
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
});

/**
 * Request to call customer (privacy protected)
 * POST /api/rider/call-request
 */
export const requestCall = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { order_id } = req.body;

  // Get rider ID
  const riderResult = await query(
    'SELECT id FROM riders WHERE user_id = $1',
    [req.user.id]
  );

  if (riderResult.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  const riderId = riderResult.rows[0].id;

  // Verify rider is assigned to this order
  const orderResult = await query(
    `SELECT o.id, o.rider_id, o.show_customer_phone, u.phone as customer_phone
     FROM orders o
     JOIN users u ON o.user_id = u.id
     WHERE o.id = $1 AND o.rider_id = $2`,
    [order_id, riderId]
  );

  if (orderResult.rows.length === 0) {
    return notFoundResponse(res, 'Order not found or not assigned to you');
  }

  const order = orderResult.rows[0];

  // No telephony/number-masking integration exists, so the only honest
  // behaviour is to respect the admin's phone-visibility flag: reveal the
  // real number when the admin allowed it, otherwise refuse — never hand
  // out a fake "virtual number" that dials nowhere.
  if (!order.show_customer_phone) {
    return errorResponse(
      res,
      'Customer phone is hidden for this order. Ask the admin to enable phone visibility.',
      403
    );
  }

  const callResult = await query(
    `INSERT INTO call_requests (rider_id, order_id, virtual_number, status)
     VALUES ($1, $2, $3, 'requested')
     RETURNING *`,
    [riderId, order_id, order.customer_phone]
  );

  logger.info('Call request created', {
    callRequestId: callResult.rows[0].id,
    riderId,
    orderId: order_id
  });

  successResponse(res, {
    call_request_id: callResult.rows[0].id,
    virtual_number: order.customer_phone,
    message: 'Dial the number to connect with the customer.',
  }, 'Call request created successfully');
});

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
     WHERE user_id = $3
     RETURNING id`,
    [longitude, latitude, req.user.id, accuracy ?? null]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  successResponse(res, null, 'Location updated successfully');
});

/**
 * Update rider status
 * PUT /api/rider/status
 */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { status } = req.body;

  const validStatuses = ['available', 'busy', 'offline', 'on_leave'];
  if (!validStatuses.includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }

  const result = await query(
    `UPDATE riders 
     SET status = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING *`,
    [status, req.user.id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  successResponse(res, result.rows[0], 'Status updated successfully');
});

/**
 * Pin location for an order's delivery address
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

  // Get rider ID
  const riderResult = await query(
    'SELECT id FROM riders WHERE user_id = $1',
    [req.user.id]
  );

  if (riderResult.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  const riderId = riderResult.rows[0].id;

  // Get the task and its order (consumer orders carry address_id; restaurant
  // orders carry restaurant_id + a JSONB snapshot instead).
  const taskResult = await query(
    `SELECT rt.id, o.id AS order_id, o.address_id, o.restaurant_id, o.user_id as customer_user_id
     FROM rider_tasks rt
     JOIN orders o ON rt.order_id = o.id
     WHERE rt.id = $1 AND rt.rider_id = $2`,
    [id, riderId]
  );

  if (taskResult.rows.length === 0) {
    return notFoundResponse(res, 'Task not found');
  }

  const { address_id, restaurant_id, order_id } = taskResult.rows[0];

  // Restaurant order: update the restaurant's MASTER location (shows everywhere)
  // + patch this order's snapshot. No addresses row exists for these.
  if (restaurant_id) {
    await query(
      `UPDATE restaurants
          SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, updated_at = NOW()
        WHERE id = $3`,
      [longitude, latitude, restaurant_id]
    );
    await query(
      `UPDATE orders
          SET delivery_address_snapshot = jsonb_set(
                COALESCE(delivery_address_snapshot, '{}'::jsonb), '{location}', $1::jsonb, true)
        WHERE id = $2`,
      [JSON.stringify({ latitude, longitude }), order_id]
    );
    logger.info('Rider pinned restaurant location', { riderId, taskId: id, restaurantId: restaurant_id, latitude, longitude });
    return successResponse(res, { latitude, longitude }, 'Location pinned successfully');
  }

  // Update the address location
  await query(
    `UPDATE addresses
     SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         location_added_by = 'rider',
         updated_at = NOW()
     WHERE id = $3`,
    [longitude, latitude, address_id]
  );

  // Find delivery zone for this location
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
    await query(
      'UPDATE addresses SET zone_id = $1 WHERE id = $2',
      [zoneResult.rows[0].id, address_id]
    );
  }

  logger.info('Rider pinned location for address', { 
    riderId, taskId: id, addressId: address_id, latitude, longitude 
  });

  successResponse(res, { latitude, longitude }, 'Location pinned successfully');
});

/**
 * Upload / update door picture for delivery address
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

  const riderResult = await query('SELECT id FROM riders WHERE user_id = $1', [req.user.id]);
  if (riderResult.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  const riderId = riderResult.rows[0].id;

  // Get the task and its order (restaurant orders carry restaurant_id + snapshot).
  const taskResult = await query(
    `SELECT rt.id, o.id AS order_id, o.address_id, o.restaurant_id
     FROM rider_tasks rt
     JOIN orders o ON rt.order_id = o.id
     WHERE rt.id = $1 AND rt.rider_id = $2`,
    [id, riderId]
  );

  if (taskResult.rows.length === 0) {
    return notFoundResponse(res, 'Task not found');
  }

  const { address_id, restaurant_id, order_id } = taskResult.rows[0];
  // Supabase Storage URL set by the upload middleware.
  const imageUrl = req.file.url || '';
  if (!imageUrl) {
    return errorResponse(res, 'Image upload failed (storage misconfigured)', 500);
  }

  // Restaurant order: the "door picture" is the restaurant's storefront photo.
  // Update the MASTER restaurant row (shows everywhere) + this order's snapshot.
  if (restaurant_id) {
    if (await hasRestaurantDeliveryColumns()) {
      await query(`UPDATE restaurants SET front_image_url = $1, updated_at = NOW() WHERE id = $2`, [imageUrl, restaurant_id]);
    }
    await query(
      `UPDATE orders
          SET delivery_address_snapshot = jsonb_set(
                COALESCE(delivery_address_snapshot, '{}'::jsonb), '{front_image_url}', $1::jsonb, true)
        WHERE id = $2`,
      [JSON.stringify(imageUrl), order_id]
    );
    logger.info('Rider updated restaurant front image', { riderId, taskId: id, restaurantId: restaurant_id });
    return successResponse(res, { url: imageUrl }, 'Front image uploaded successfully');
  }

  // Update the address door_picture_url
  await query(
    `UPDATE addresses SET door_picture_url = $1, updated_at = NOW() WHERE id = $2`,
    [imageUrl, address_id]
  );

  logger.info('Rider uploaded door picture', { riderId, taskId: id, addressId: address_id });

  successResponse(res, { url: imageUrl }, 'Door picture uploaded successfully');
});

/**
 * Get today's earnings
 * GET /api/rider/earnings/today
 */
export const getTodayEarnings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  // Get rider ID
  const riderResult = await query(
    'SELECT id FROM riders WHERE user_id = $1',
    [req.user.id]
  );

  if (riderResult.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  const riderId = riderResult.rows[0].id;

  // Get today's completed deliveries
  const deliveriesResult = await query(
    `SELECT 
      COUNT(*) as completed_deliveries,
      COUNT(CASE WHEN task_type = 'pickup' THEN 1 END) as pickups,
      COUNT(CASE WHEN task_type = 'delivery' THEN 1 END) as deliveries,
      COUNT(CASE WHEN task_type = 'atta_pickup' THEN 1 END) as atta_pickups,
      COUNT(CASE WHEN task_type = 'atta_delivery' THEN 1 END) as atta_deliveries
    FROM rider_tasks
    WHERE rider_id = $1 
    AND status = 'completed'
    AND DATE(completed_at) = CURRENT_DATE`,
    [riderId]
  );

  successResponse(res, deliveriesResult.rows[0], 'Today\'s earnings retrieved successfully');
});

/**
 * Get full rider stats (daily, weekly, monthly + payment tracking)
 * GET /api/rider/stats
 */
export const getMyStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);

  const riderResult = await query('SELECT id FROM riders WHERE user_id = $1', [req.user.id]);
  if (riderResult.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  const riderId = riderResult.rows[0].id;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const dayOfWeek = now.getDay() || 7;
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - dayOfWeek + 1);
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const statsResult = await query(
    `SELECT
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $2) as today_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $2), 0) as today_earnings,
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $3) as this_week_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $3), 0) as this_week_earnings,
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $4 AND o.placed_at < $5) as last_week_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $4 AND o.placed_at < $5), 0) as last_week_earnings,
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $6) as this_month_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $6), 0) as this_month_earnings,
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $7 AND o.placed_at < $8) as last_month_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $7 AND o.placed_at < $8), 0) as last_month_earnings,
      COUNT(*) FILTER (WHERE o.status = 'delivered') as total_delivered,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered'), 0) as total_earned,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0) as total_collected
    FROM orders o WHERE o.rider_id = $1`,
    [riderId, todayStart, thisWeekStart.toISOString(),
     lastWeekStart.toISOString(), lastWeekEnd.toISOString(),
     thisMonthStart, lastMonthStart, lastMonthEnd]
  );

  const s = statsResult.rows[0];
  const totalCollected = parseFloat(s.total_collected) || 0;
  const totalEarned = parseFloat(s.total_earned) || 0;

  successResponse(res, {
    stats: {
      today: { orders: parseInt(s.today_orders), earnings: parseFloat(s.today_earnings) },
      thisWeek: { orders: parseInt(s.this_week_orders), earnings: parseFloat(s.this_week_earnings) },
      lastWeek: { orders: parseInt(s.last_week_orders), earnings: parseFloat(s.last_week_earnings) },
      thisMonth: { orders: parseInt(s.this_month_orders), earnings: parseFloat(s.this_month_earnings) },
      lastMonth: { orders: parseInt(s.last_month_orders), earnings: parseFloat(s.last_month_earnings) },
    },
    payment: {
      totalCollected,
      totalEarned,
      paymentPending: totalCollected - totalEarned,
    },
  }, 'Rider stats retrieved');
});
