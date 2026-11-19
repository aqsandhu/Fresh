// Order status, payment received, bulk status, delete — moved from orders.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../../utils/caughtError';
import { Request, Response } from 'express';
import { query, withTransaction, type DbRow } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../../utils/response';
import { emitOrderUpdate, emitToUser, emitOrderEventToAdmins } from '../../../config/socket';
import logger from '../../../utils/logger';
import { notifyOrderStatus } from '../../../utils/customerNotify';
import { resolveCityScope, orderInScope } from '../../../utils/cityScope';
import { isValidOrderTransition, restoreOrderInventory, ORDER_STATUS_TIMESTAMPS } from '../../../utils/orderStatus';
import {
  cancelActiveRiderTasks,
  notifyRiderTasksCancelled,
  completeActiveRiderTasks,
  notifyRiderTasksClosed,
  CancelledRiderTask,
} from '../../../utils/riderTaskEvents';
import { commitOrderSaleOnDelivery } from '../../../utils/systemStock';
import { deductOcpStockOnDelivery } from '../../../utils/ocpStock';
import { recordRefundDueOnCancel } from '../../../utils/refundDue';
import { hasOrderCashReceivedColumn } from '../../../config/controlsSchema';
import { gradeMilestoneOnDelivery } from './shared';

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  // Money never leaves through a bare status flip: a refund must go through
  // the complaint refund (reason + cap + second admin for large amounts) so it
  // is recorded with who did it. (The validator rejects 'refunded' too.)
  if (status === 'refunded') {
    return errorResponse(res, 'Use the complaint refund to return money (it records the reason and approval).', 400);
  }

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  // Transaction + row lock: the transition check, the status flip and the
  // cancel side-effects (stock/slot restore) must be atomic — same contract
  // as the customer-cancel and webhook paths.
  let updatedRow: any = null;
  let cancelledRiderTasks: CancelledRiderTask[] = [];
  let closedRiderTasks: CancelledRiderTask[] = [];
  const cashCol = await hasOrderCashReceivedColumn();
  try {
    updatedRow = await withTransaction(async (client) => {
      const orderResult = await client.query(
        'SELECT id, status, time_slot_id, payment_status, paid_amount FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (orderResult.rows.length === 0) return null;

      const order = orderResult.rows[0];

      if (!isValidOrderTransition(order.status, status)) {
        throw Object.assign(
          new Error(`Invalid status transition: ${order.status} → ${status}`),
          { http: 409 }
        );
      }

      const timestampColumn = ORDER_STATUS_TIMESTAMPS[status];
      // Only a real change stamps the time — re-sending the same status kept
      // moving delivered_at to a later day (A38).
      const timestampValue = timestampColumn && order.status !== status ? `, ${timestampColumn} = NOW()` : '';

      // Admin-confirmed delivery of a COD order collects the cash exactly like
      // the rider's own "delivered" path does (OCP orders are collected by the
      // OCP, so they are left alone). Without this the order sat "delivered /
      // payment pending" forever and never counted in revenue.
      // No rider and no OCP means the office itself handed the goods over and
      // took the cash: stamp the admin as the holder, exactly like "Payment
      // received". Before this the order became "paid" with NOBODY recorded
      // as holding the money (not in any rider's dues, not in cash-by-admin).
      const officeCashSql =
        status === 'delivered' && order.status !== 'delivered' && cashCol
          ? `, cash_received_by = CASE
                 WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL AND rider_id IS NULL
                      AND payment_status <> 'completed' THEN $4::uuid
                 ELSE cash_received_by END,
               cash_received_at = CASE
                 WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL AND rider_id IS NULL
                      AND payment_status <> 'completed' THEN NOW()
                 ELSE cash_received_at END`
          : '';
      const codPaidSql =
        status === 'delivered'
          ? `${officeCashSql}, payment_status = CASE
                 WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN 'completed'::payment_status
                 ELSE payment_status END,
               paid_amount = CASE
                 WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN total_amount
                 ELSE paid_amount END`
          : '';
      // Who cancelled it (the column existed but the admin path never set it).
      const cancelledBySql =
        status === 'cancelled' && order.status !== 'cancelled' ? ', cancelled_by = $4::uuid' : '';
      const actorParam = officeCashSql || cancelledBySql ? [req.user?.id ?? null] : [];

      const result = await client.query(
        `UPDATE orders
         SET status = $1${timestampValue}${codPaidSql}${cancelledBySql},
             cancellation_reason = COALESCE($2, cancellation_reason),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [status, reason, id, ...actorParam]
      );

      // Admin-confirmed delivery closes the rider's task too (same as the
      // payment-received fast path) so the rider app stops showing it active.
      if (status === 'delivered' && order.status !== 'delivered') {
        closedRiderTasks = await completeActiveRiderTasks(client, id);
      }

      // Cancelling releases what the order consumed at creation.
      if (status === 'cancelled' && order.status !== 'cancelled') {
        // The rider must not keep driving to a cancelled order.
        cancelledRiderTasks = await cancelActiveRiderTasks(client, id, {
          note: reason ? `Order cancelled: ${reason}` : 'Order cancelled by admin',
        });
        // Paid order cancelled → money is owed back. Record a refunds-ledger
        // row (same shape as the complaint refund insert) so finance can
        // reconcile; never blocks the cancellation. Runs exactly once thanks
        // to the FOR UPDATE lock + transition guard above.
        // Only what has not been refunded yet (utils/refundDue.ts): a Rs 1000
        // order with a Rs 300 complaint refund owes Rs 700 back, not Rs 1000.
        await recordRefundDueOnCancel(client, order);
        await restoreOrderInventory(client, order);
      }

      // Delivering commits the system-stock sale (reserved → permanent) and
      // deducts the OCP's own stock. Both idempotent + self-guarded.
      if (status === 'delivered' && order.status !== 'delivered') {
        await commitOrderSaleOnDelivery(client, id);
        await deductOcpStockOnDelivery(client, id);
      }

      return result.rows[0];
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 409) {
      return errorResponse(res, err.message, 409);
    }
    throw err;
  }

  if (!updatedRow) {
    return notFoundResponse(res, 'Order not found');
  }
  const result = { rows: [updatedRow] };

  logger.info('Order status updated', { orderId: id, status, updatedBy: req.user?.id });

  // Emit real-time order status update
  emitOrderUpdate(id, {
    orderId: id,
    status,
    reason,
    updatedBy: req.user?.id,
    updatedAt: new Date().toISOString(),
  });

  // Notify the customer of status change
  const order = result.rows[0];
  if (status === 'delivered') gradeMilestoneOnDelivery(order);
  emitToUser(order.user_id, 'order:status_changed', {
    orderId: id,
    orderNumber: order.order_number,
    status,
    message: `Your order #${order.order_number} is now ${status}`,
  });
  // App closed / in background → push (honours the customer's switch).
  notifyOrderStatus(order, status, reason).catch(() => {});

  // Notify admins
  emitOrderEventToAdmins(id, 'order:status_updated', {
    orderId: id,
    orderNumber: order.order_number,
    status,
    updatedBy: req.user?.id,
  });

  // Tell the displaced rider (socket + push) — after commit.
  notifyRiderTasksCancelled(cancelledRiderTasks, { id, order_number: order.order_number }, reason);
  notifyRiderTasksClosed(closedRiderTasks, { id, order_number: order.order_number }, `Order #${order.order_number} was marked delivered by the admin`);

  successResponse(res, result.rows[0], 'Order status updated successfully');
});

/**
 * Mark payment as received — auto-sets order status to 'delivered'
 * PUT /api/admin/orders/:id/payment-received
 */

export const markPaymentReceived = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  // Deliberate COD fast-path OUTSIDE the strict state machine: collecting
  // cash implies the order reached the customer, so any live status may jump
  // straight to delivered+paid. The only hard guard is below — a
  // cancelled/refunded order must never flip to delivered (that resurrected
  // dead orders and inflated revenue).
  let closedRiderTasks: CancelledRiderTask[] = [];
  // Who took the cash (only when the office is the one collecting it — an
  // order the rider already collected keeps the rider as the holder).
  const cashCol = await hasOrderCashReceivedColumn();
  const result = await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE orders
       SET payment_status = 'completed', paid_amount = total_amount,
           status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW()${
             cashCol
               ? `,
           cash_received_by = CASE WHEN payment_status <> 'completed' THEN $2::uuid ELSE cash_received_by END,
           cash_received_at = CASE WHEN payment_status <> 'completed' THEN NOW() ELSE cash_received_at END`
               : ''
           }
       WHERE id = $1 AND deleted_at IS NULL AND status NOT IN ('cancelled', 'refunded')
       RETURNING *`,
      cashCol ? [id, req.user?.id ?? null] : [id]
    );
    if (updated.rows.length === 0) return updated;
    // Only live tasks — a cancelled/failed task must keep its real outcome
    // (the old `status != 'completed'` rewrote those to completed too).
    closedRiderTasks = await completeActiveRiderTasks(client, id);
    await commitOrderSaleOnDelivery(client, id);
    await deductOcpStockOnDelivery(client, id);
    return updated;
  });

  if (result.rows.length === 0) {
    const exists = await query(
      `SELECT status FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (exists.rows.length > 0) {
      return errorResponse(
        res,
        `Cannot mark a ${exists.rows[0].status} order as paid/delivered`,
        409
      );
    }
    return notFoundResponse(res, 'Order not found');
  }

  // Also complete any associated rider task
  /* Delivery, rider task and stock commits are completed atomically above.

  // The order is now delivered: commit the system-stock sale (reserved →
  // permanent) and deduct the OCP's own stock. Both idempotent + self-guarded.
  await withTransaction(async (client) => {
    await commitOrderSaleOnDelivery(client, id);
    await deductOcpStockOnDelivery(client, id);
  }); */

  logger.info('Payment received & order delivered', { orderId: id, updatedBy: req.user?.id });

  // Emit real-time events
  const updatedOrder = result.rows[0];
  gradeMilestoneOnDelivery(updatedOrder);
  emitOrderUpdate(id, {
    orderId: id,
    status: 'delivered',
    paymentStatus: 'completed',
    message: `Order #${updatedOrder.order_number} marked as delivered — payment received`,
  });

  emitToUser(updatedOrder.user_id, 'order:delivered', {
    orderId: id,
    orderNumber: updatedOrder.order_number,
    message: `Your order #${updatedOrder.order_number} has been delivered!`,
  });
  notifyOrderStatus(updatedOrder, 'delivered').catch(() => {});
  notifyRiderTasksClosed(closedRiderTasks, { id, order_number: updatedOrder.order_number }, `Order #${updatedOrder.order_number} was marked delivered by the admin`);

  successResponse(res, result.rows[0], 'Payment received and order marked as delivered');
});

/** An order locked by the bulk status update (only what the update reads). */
interface LockedOrderRow {
  id: string;
  order_number: string;
  status: string;
  time_slot_id: string | null;
  payment_status: string | null;
  /** NUMERIC comes back from pg as a string. */
  paid_amount: string | null;
}

export const bulkUpdateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { order_ids, status, reason } = req.body as {
    order_ids: string[];
    status: string;
    reason?: string;
  };

  if (!Array.isArray(order_ids) || order_ids.length === 0) {
    return errorResponse(res, 'At least one order ID is required', 400);
  }

  const timestampColumn = ORDER_STATUS_TIMESTAMPS[status];
  const timestampValue = timestampColumn ? `, ${timestampColumn} = NOW()` : '';

  // City isolation: scoped admins can only bulk-update their city's orders.
  const scope = await resolveCityScope(req);
  const lockParams: unknown[] = [order_ids];
  let scopeSql = '';
  if (!scope.unrestricted && scope.cityId && scope.cityName && scope.dbReady) {
    lockParams.push(scope.cityId, scope.cityName);
    scopeSql = ` AND (
      o.city_id = $2
      OR LOWER(COALESCE(addr.city, '')) = LOWER($3)
      OR LOWER(COALESCE(o.delivery_address_snapshot->>'city', '')) = LOWER($3)
    )`;
  }

  // Per-order transition validation + cancel side-effects, atomically.
  // Orders whose current status can't legally move to the target are skipped
  // (and reported back) instead of being force-jumped.
  const cancelledRiderTasksByOrder: { order: LockedOrderRow; tasks: CancelledRiderTask[] }[] = [];
  const closedRiderTasksByOrder: { order: LockedOrderRow; tasks: CancelledRiderTask[] }[] = [];
  const { updatedRows, skipped } = await withTransaction(async (client) => {
    const lockResult = await client.query<LockedOrderRow>(
      `SELECT o.id, o.order_number, o.status, o.time_slot_id, o.payment_status, o.paid_amount FROM orders o
        LEFT JOIN addresses addr ON o.address_id = addr.id
        WHERE o.id = ANY($1::uuid[]) AND o.deleted_at IS NULL${scopeSql}
        FOR UPDATE OF o`,
      lockParams
    );

    const allowed: LockedOrderRow[] = [];
    const skippedLocal: { id: string; status: string }[] = [];
    for (const order of lockResult.rows) {
      // Already in that status: leave it alone (a new timestamp would move
      // the order to another day in reports — A38).
      if (order.status !== status && isValidOrderTransition(order.status, status)) {
        allowed.push(order);
      } else {
        skippedLocal.push({ id: order.id, status: order.status });
      }
    }

    if (allowed.length === 0) {
      return { updatedRows: [] as DbRow<{ id: string; order_number: string; user_id: string | null }>[], skipped: skippedLocal };
    }

    // Same COD rule as the single-order path: an admin "delivered" collects
    // the cash for direct COD orders (otherwise they stay "payment pending"
    // forever and never reach revenue or the rider's cash-to-hand-over).
    // Same holder/actor stamps as the single-order path.
    const bulkCashCol = await hasOrderCashReceivedColumn();
    const bulkOfficeCashSql =
      status === 'delivered' && bulkCashCol
        ? `, cash_received_by = CASE
               WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL AND rider_id IS NULL
                    AND status <> 'delivered' AND payment_status <> 'completed' THEN $4::uuid
               ELSE cash_received_by END,
             cash_received_at = CASE
               WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL AND rider_id IS NULL
                    AND status <> 'delivered' AND payment_status <> 'completed' THEN NOW()
               ELSE cash_received_at END`
        : '';
    const bulkCodPaidSql =
      status === 'delivered'
        ? `${bulkOfficeCashSql}, payment_status = CASE
               WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN 'completed'::payment_status
               ELSE payment_status END,
             paid_amount = CASE
               WHEN payment_method = 'cash_on_delivery' AND ocp_id IS NULL THEN total_amount
               ELSE paid_amount END`
        : '';
    const bulkCancelledBySql =
      status === 'cancelled' ? `, cancelled_by = CASE WHEN status <> 'cancelled' THEN $4::uuid ELSE cancelled_by END` : '';
    const bulkActorParam = bulkOfficeCashSql || bulkCancelledBySql ? [req.user?.id ?? null] : [];
    const result = await client.query<DbRow<{ id: string; order_number: string; user_id: string | null }>>(
      `UPDATE orders
       SET status = $1${timestampValue}${bulkCodPaidSql}${bulkCancelledBySql},
           cancellation_reason = COALESCE($2, cancellation_reason),
           updated_at = NOW()
       WHERE id = ANY($3::uuid[])
       RETURNING *`,
      [status, reason || null, allowed.map((o) => o.id), ...bulkActorParam]
    );

    if (status === 'cancelled') {
      for (const order of allowed) {
        if (order.status !== 'cancelled') {
          // Same refund-due rule as the single-order cancel (it was missing here).
          await recordRefundDueOnCancel(client, order);
          await restoreOrderInventory(client, order);
          const tasks = await cancelActiveRiderTasks(client, order.id, {
            note: reason ? `Order cancelled: ${reason}` : 'Order cancelled by admin',
          });
          if (tasks.length) cancelledRiderTasksByOrder.push({ order, tasks });
        }
      }
    }
    if (status === 'delivered') {
      for (const order of allowed) {
        if (order.status !== 'delivered') {
          await commitOrderSaleOnDelivery(client, order.id);
          await deductOcpStockOnDelivery(client, order.id);
          const closed = await completeActiveRiderTasks(client, order.id);
          if (closed.length) closedRiderTasksByOrder.push({ order, tasks: closed });
        }
      }
    }

    return { updatedRows: result.rows, skipped: skippedLocal };
  });

  const result = { rows: updatedRows };

  for (const { order, tasks } of cancelledRiderTasksByOrder) {
    const row = result.rows.find((r) => r.id === order.id) ?? order;
    notifyRiderTasksCancelled(tasks, { id: order.id, order_number: row.order_number }, reason);
  }
  for (const { order, tasks } of closedRiderTasksByOrder) {
    const row = result.rows.find((r) => r.id === order.id) ?? order;
    notifyRiderTasksClosed(tasks, { id: order.id, order_number: row.order_number }, `Order #${row.order_number} was marked delivered by the admin`);
  }

  for (const order of result.rows) {
    emitOrderUpdate(order.id, {
      orderId: order.id,
      status,
      reason,
      updatedBy: req.user?.id,
      updatedAt: new Date().toISOString(),
    });

    emitToUser(order.user_id, 'order:status_changed', {
      orderId: order.id,
      orderNumber: order.order_number,
      status,
      message: `Your order #${order.order_number} is now ${status}`,
    });
    notifyOrderStatus(order, status, reason).catch(() => {});

    emitOrderEventToAdmins(order.id, 'order:status_updated', {
      orderId: order.id,
      orderNumber: order.order_number,
      status,
      updatedBy: req.user?.id,
    });
  }

  logger.info('Bulk order status updated', {
    count: result.rows.length,
    skipped: skipped.length,
    status,
    updatedBy: req.user?.id,
  });

  successResponse(res, {
    updated: result.rows.length,
    skipped,
    orders: result.rows,
  }, skipped.length > 0
    ? `${result.rows.length} order(s) updated, ${skipped.length} skipped (invalid status transition)`
    : `${result.rows.length} order(s) updated successfully`);
});

/**
 * Permanently delete an order (soft delete) — super admin only
 * DELETE /api/admin/orders/:id
 */

export const deleteOrder = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admins can delete orders', 403);
  }

  const { id } = req.params;

  // Soft-deleting a live order must release what it holds: reserved stock,
  // the slot seat and any rider task — otherwise the stock stays locked and the
  // rider keeps driving to an order nobody can see any more.
  let deletedRow: any = null;
  let cancelledRiderTasks: CancelledRiderTask[] = [];
  try {
  await withTransaction(async (client) => {
    const cur = await client.query(
      `SELECT id, order_number, status, time_slot_id, requested_delivery_date
         FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (cur.rows.length === 0) return;
    const order = cur.rows[0];
    // A delivered/refunded order is a financial record: deleting it removed
    // the sale from profit and from the rider's cash due while its stock had
    // already left. Cancel/refund paths keep the trail instead.
    if (order.status === 'delivered' || order.status === 'refunded') {
      throw Object.assign(new Error(`A ${order.status} order cannot be deleted — it is part of the books.`), { http: 409 });
    }
    if (!['delivered', 'cancelled', 'refunded'].includes(order.status)) {
      cancelledRiderTasks = await cancelActiveRiderTasks(client, id, { note: 'Order deleted by admin' });
      await restoreOrderInventory(client, order);
    }
    const result = await client.query(
      `UPDATE orders SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, order_number`,
      [id]
    );
    deletedRow = result.rows[0] ?? null;
  });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 409) return errorResponse(res, err.message, 409);
    throw err;
  }

  if (!deletedRow) {
    return notFoundResponse(res, 'Order not found');
  }
  const result = { rows: [deletedRow] };
  if (cancelledRiderTasks.length > 0) {
    notifyRiderTasksCancelled(
      cancelledRiderTasks,
      { id, order_number: deletedRow.order_number },
      'Order deleted by admin'
    );
  }

  logger.info('Order deleted', {
    orderId: id,
    orderNumber: result.rows[0].order_number,
    deletedBy: req.user?.id,
  });

  successResponse(res, { id }, 'Order deleted successfully');
});

/**
 * Delete a customer address (soft delete) — super admin only
 * DELETE /api/admin/addresses/:id
 */
