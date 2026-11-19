// Pick-up, arrival, proof, delivery, failure, cancel — moved from rider.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../utils/caughtError';
import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../utils/response';
import { isValidOrderTransition } from '../../utils/orderStatus';
import { deductOcpStockOnDelivery } from '../../utils/ocpStock';
import { commitOrderSaleOnDelivery } from '../../utils/systemStock';
import { emitOrderUpdate, emitToUser, emitRiderEventToAdmins } from '../../config/socket';
import { hasAttaCashColumns } from '../../config/riderSchema';
import { pushToCustomers } from '../../utils/customerNotify';
import { syncRiderAvailability } from '../../utils/riderAvailability';
import logger from '../../utils/logger';
import { resolveRiderId, httpError, notifyAttaCustomer, failTask, announceTaskFailure, notifyArrival } from './shared';

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
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
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
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
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
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
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
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
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
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
});

// ── Contact ─────────────────────────────────────────────────────────────────
