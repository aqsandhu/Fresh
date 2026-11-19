// Rider profile and task lists — moved from rider.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../utils/response';
import { parsePagination } from '../../utils/validators';
import { hasVariableWeightColumns } from '../../config/productSchema';
import { taskSqlFlags, taskSelect, resolveRiderId } from './shared';

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

  let items: unknown[] = [];
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
