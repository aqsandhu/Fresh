// Atta (flour) requests — moved from orders.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../../utils/caughtError';
import { Request, Response } from 'express';
import { query, withTransaction } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../../utils/response';
import { emitToUser } from '../../../config/socket';
import logger from '../../../utils/logger';
import { resolveCityScope } from '../../../utils/cityScope';
import { hasAttaCashColumns } from '../../../config/riderSchema';
import { syncRiderAvailability } from '../../../utils/riderAvailability';
import {
  notifyRiderTasksCancelled,
  createAttaRiderTask,
  notifyAttaAssignment,
  cancelActiveAttaTasks,
  notifyAttaTasksCancelled,
  CancelledRiderTask,
  AttaTaskType,
} from '../../../utils/riderTaskEvents';
import { parsePagination } from '../../../utils/validators';

export const getAttaRequests = asyncHandler(async (req: Request, res: Response) => {
  const { status, page = 1, limit = 20 } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit);

  let sql = `
    FROM atta_requests ar
    JOIN users u ON ar.user_id = u.id
    LEFT JOIN addresses a ON ar.address_id = a.id
    LEFT JOIN riders pr ON pr.id = ar.pickup_rider_id
    LEFT JOIN users pru ON pru.id = pr.user_id
    LEFT JOIN riders dr ON dr.id = ar.delivery_rider_id
    LEFT JOIN users dru ON dru.id = dr.user_id
    WHERE 1=1
  `;

  const params: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    sql += ` AND ar.status = $${paramIndex++}`;
    params.push(status);
  }

  // City scoping via the pickup address — same rule as updateAttaStatus, so a
  // scoped admin can't list another city's requests (customer PII included).
  const attaScope = await resolveCityScope(req);
  if (!attaScope.unrestricted && attaScope.cityName && attaScope.dbReady) {
    sql += ` AND LOWER(COALESCE(a.city, '')) = LOWER($${paramIndex++})`;
    params.push(attaScope.cityName);
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get requests — with who is (or was) carrying the wheat / flour and the
  // live task state, so the admin can dispatch from this page.
  const attaCashReady = await hasAttaCashColumns();
  const requestsSql = `
    SELECT 
      ar.id, ar.request_number, ar.status,
      ar.wheat_quality, ar.wheat_quantity_kg,
      ar.flour_type, ar.actual_flour_quantity_kg, ar.special_instructions,
      ar.service_charge, ar.milling_charge, ar.delivery_charge, ar.total_amount,
      ar.payment_status, ar.payment_method,
      ${attaCashReady ? 'ar.paid_amount,' : '0 AS paid_amount,'}
      u.full_name as customer_name, u.phone as customer_phone,
      a.written_address as pickup_address, a.house_number, a.area_name, a.city,
      ar.pickup_rider_id, pru.full_name AS pickup_rider_name,
      ar.delivery_rider_id, dru.full_name AS delivery_rider_name,
      (SELECT t.status FROM rider_tasks t WHERE t.atta_request_id = ar.id AND t.task_type = 'atta_pickup'
        ORDER BY t.assigned_at DESC LIMIT 1) AS pickup_task_status,
      (SELECT t.notes FROM rider_tasks t WHERE t.atta_request_id = ar.id AND t.task_type = 'atta_pickup'
        ORDER BY t.assigned_at DESC LIMIT 1) AS pickup_task_notes,
      (SELECT t.status FROM rider_tasks t WHERE t.atta_request_id = ar.id AND t.task_type = 'atta_delivery'
        ORDER BY t.assigned_at DESC LIMIT 1) AS delivery_task_status,
      (SELECT t.notes FROM rider_tasks t WHERE t.atta_request_id = ar.id AND t.task_type = 'atta_delivery'
        ORDER BY t.assigned_at DESC LIMIT 1) AS delivery_task_notes,
      ar.pickup_proof_image, ar.delivery_proof_image,
      ar.created_at
    ${sql}
    ORDER BY ar.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(safeLimit, offset);

  const result = await query(requestsSql, params);

  successResponse(res, {
    requests: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  }, 'Atta requests retrieved successfully');
});

/**
 * Update atta request status
 * PUT /api/admin/atta-requests/:id/status
 */

export const updateAttaStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, rider_id } = req.body;

  // City-scoped via the pickup address: a scoped admin can't act on another
  // city's atta request by guessing the id.
  const attaScope = await resolveCityScope(req);
  if (!attaScope.unrestricted && attaScope.cityName && attaScope.dbReady) {
    const chk = await query(
      `SELECT 1 FROM atta_requests ar
         LEFT JOIN addresses a ON a.id = ar.address_id
        WHERE ar.id = $1 AND LOWER(COALESCE(a.city, '')) = LOWER($2)`,
      [id, attaScope.cityName]
    );
    if (chk.rows.length === 0) return notFoundResponse(res, 'Atta request not found');
  }

  const statusUpdates: Record<string, { column: string; riderColumn?: string }> = {
    picked_up: { column: 'picked_up_at', riderColumn: 'pickup_rider_id' },
    at_mill: { column: 'milling_started_at' },
    milling: { column: 'milling_started_at' },
    ready_for_delivery: { column: 'milling_completed_at' },
    out_for_delivery: { column: 'delivery_scheduled_at', riderColumn: 'delivery_rider_id' },
    delivered: { column: 'delivered_at' },
  };

  const update = statusUpdates[status];
  if (!update) {
    return errorResponse(res, 'Invalid status', 400);
  }

  const allowedFrom: Record<string, string[]> = {
    picked_up: ['pending_pickup'],
    at_mill: ['picked_up'],
    milling: ['picked_up', 'at_mill'],
    ready_for_delivery: ['at_mill', 'milling'],
    out_for_delivery: ['ready_for_delivery'],
    delivered: ['out_for_delivery'],
  };
  if (update.riderColumn && rider_id) {
    // riders.status is available/busy/offline/on_leave — the old `= 'active'`
    // check matched nothing, so every rider assignment on an atta request
    // failed with "Active rider not found".
    const rider = await query(
      `SELECT id FROM riders
        WHERE id = $1 AND deleted_at IS NULL AND verification_status = 'verified'
          AND status NOT IN ('offline', 'on_leave')`,
      [rider_id]
    );
    if (rider.rows.length === 0) return errorResponse(res, 'Rider not found, not verified, or off duty', 400);
  }

  let sql = `UPDATE atta_requests SET status = $1, ${update.column} = COALESCE(${update.column}, NOW())`;
  const params: unknown[] = [status, allowedFrom[status]];
  let paramIndex = 3;

  if (update.riderColumn && rider_id) {
    sql += `, ${update.riderColumn} = $${paramIndex++}`;
    params.push(rider_id);
  }

  sql += `, updated_at = NOW() WHERE id = $${paramIndex} AND status = ANY($2::text[]) RETURNING *`;
  params.push(id);

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    const exists = await query('SELECT status FROM atta_requests WHERE id = $1', [id]);
    if (exists.rows.length > 0) {
      return errorResponse(res, `Invalid atta status transition: ${exists.rows[0].status} → ${status}`, 409);
    }
    return notFoundResponse(res, 'Atta request not found');
  }

  // A manual status move past a rider's step closes that rider task, so the
  // rider app does not keep showing work the office already finished.
  const closePickup = ['at_mill', 'milling', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes(status);
  const closeDelivery = status === 'delivered';
  if (closePickup || closeDelivery) {
    const types = [closePickup ? 'atta_pickup' : null, closeDelivery ? 'atta_delivery' : null].filter(Boolean);
    const closed = await query(
      `UPDATE rider_tasks rt
          SET status = 'completed', completed_at = COALESCE(rt.completed_at, NOW()),
              notes = COALESCE(rt.notes, 'Closed by admin'), updated_at = NOW()
         FROM riders r
        WHERE rt.rider_id = r.id AND rt.atta_request_id = $1
          AND rt.task_type = ANY($2::task_type[]) AND rt.status IN ('assigned', 'in_progress')
        RETURNING rt.id AS task_id, rt.rider_id, r.user_id AS rider_user_id`,
      [id, types]
    );
    for (const row of closed.rows) {
      await syncRiderAvailability(row.rider_id);
      emitToUser(row.rider_user_id, 'rider:task_updated', {
        taskId: row.task_id, attaRequestId: id, orderNumber: result.rows[0].request_number,
        status: 'completed', message: 'The office updated this atta request',
      });
    }
  }
  // Cancelled by the office: the rider's pickup / delivery is called off too
  // (it stayed on the rider's list — round 6, with A28).
  if (status === 'cancelled') {
    const called = await withTransaction((client) => cancelActiveAttaTasks(client, id, 'Cancelled by the office'));
    notifyAttaTasksCancelled(called, { id, request_number: result.rows[0].request_number }, 'Cancelled by the office');
  }

  // A rider assignment creates the rider_tasks row the rider app works from
  // (previously the rider column was set but no task ever reached the app).
  if (update.riderColumn && rider_id) {
    const taskType: AttaTaskType = update.riderColumn === 'pickup_rider_id' ? 'atta_pickup' : 'atta_delivery';
    try {
      const created = await withTransaction((client) => createAttaRiderTask(client, id, rider_id, taskType));
      notifyAttaAssignment(created.riderUserId, { id, request_number: result.rows[0].request_number }, taskType, created.taskId);
      notifyRiderTasksCancelled(created.displaced, { id, order_number: result.rows[0].request_number }, 'Reassigned to another rider');
    } catch (err) {
      logger.error('Failed to create atta rider task', { attaRequestId: id, riderId: rider_id, err });
    }
  }

  successResponse(res, result.rows[0], 'Atta request status updated successfully');
});

/**
 * Assign the rider who collects the wheat (atta_pickup) or brings the flour
 * back (atta_delivery) WITHOUT moving the request's status — the rider's own
 * "Wheat collected" / "Flour collected" / "Delivered" taps move it, exactly
 * like an order. (The old way only assigned a rider as a side-effect of the
 * admin claiming the wheat was already picked up.)
 * PUT /api/admin/atta-requests/:id/assign-rider   Body: { rider_id, task_type }
 */
export const assignAttaRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { rider_id } = req.body;
  const taskType = req.body?.task_type as AttaTaskType;
  if (!rider_id) return errorResponse(res, 'Select a rider.', 400);
  if (!['atta_pickup', 'atta_delivery'].includes(taskType)) {
    return errorResponse(res, "task_type must be 'atta_pickup' or 'atta_delivery'", 400);
  }

  const attaScope = await resolveCityScope(req);
  if (!attaScope.unrestricted && attaScope.cityName && attaScope.dbReady) {
    const chk = await query(
      `SELECT 1 FROM atta_requests ar
         LEFT JOIN addresses a ON a.id = ar.address_id
        WHERE ar.id = $1 AND LOWER(COALESCE(a.city, '')) = LOWER($2)`,
      [id, attaScope.cityName]
    );
    if (chk.rows.length === 0) return notFoundResponse(res, 'Atta request not found');
  }

  const rider = await query(
    `SELECT r.id, r.city_id FROM riders r
      WHERE r.id = $1 AND r.deleted_at IS NULL AND r.verification_status = 'verified'
        AND r.status NOT IN ('offline', 'on_leave')`,
    [rider_id]
  );
  if (rider.rows.length === 0) return errorResponse(res, 'Rider not found, not verified, or off duty', 400);
  if (attaScope.cityId && rider.rows[0].city_id && rider.rows[0].city_id !== attaScope.cityId && !attaScope.unrestricted) {
    return errorResponse(res, 'Rider belongs to a different service city', 400);
  }

  const allowed = taskType === 'atta_pickup'
    ? ['pending_pickup']
    : ['at_mill', 'milling', 'ready_for_delivery'];
  const column = taskType === 'atta_pickup' ? 'pickup_rider_id' : 'delivery_rider_id';

  let out: { created: { taskId: string; riderUserId: string | null; displaced: CancelledRiderTask[] }; request: any };
  try {
    out = await withTransaction(async (client) => {
      const reqRow = await client.query(
        `SELECT id, request_number, status FROM atta_requests WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (reqRow.rows.length === 0) throw Object.assign(new Error('Atta request not found'), { http: 404 });
      const request = reqRow.rows[0];
      if (!allowed.includes(request.status)) {
        throw Object.assign(
          new Error(
            taskType === 'atta_pickup'
              ? `A pickup rider can only be assigned while the request is pending pickup (it is ${request.status}).`
              : `A delivery rider can be assigned once the wheat is at the mill (it is ${request.status}).`
          ),
          { http: 409 }
        );
      }
      await client.query(`UPDATE atta_requests SET ${column} = $1, updated_at = NOW() WHERE id = $2`, [rider_id, id]);
      const created = await createAttaRiderTask(client, id, rider_id, taskType);
      return { created, request };
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 409) return errorResponse(res, err.message, 409);
    throw err;
  }

  notifyAttaAssignment(out.created.riderUserId, { id, request_number: out.request.request_number }, taskType, out.created.taskId);
  notifyRiderTasksCancelled(out.created.displaced, { id, order_number: out.request.request_number }, 'Reassigned to another rider');
  logger.info('Atta rider assigned', { attaRequestId: id, riderId: rider_id, taskType, by: req.user?.id });
  successResponse(res, { task_id: out.created.taskId, request_id: id, task_type: taskType }, 'Rider assigned');
});

// ============================================================================
// CATEGORY MANAGEMENT
// ============================================================================

/**
 * Get all categories (admin - includes inactive)
 * GET /api/admin/categories
 */
