// Cancelling an order — moved from order.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { withTransaction } from '../../config/database';
import {
  asyncHandler,
  BadRequestError,
  NotFoundError,
  ConflictError,
} from '../../middleware';
import { successResponse, errorResponse } from '../../utils/response';
import { restoreOrderInventory } from '../../utils/orderStatus';
import { cancelActiveRiderTasks, notifyRiderTasksCancelled, CancelledRiderTask } from '../../utils/riderTaskEvents';
import { emitOrderUpdate, emitOrderEventToAdmins } from '../../config/socket';
import { recordRefundDueOnCancel } from '../../utils/refundDue';

/**
 * Cancel order
 * PUT /api/orders/:id/cancel
 */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  // Clients disagree on the key — mobile sends `reason`, the website sends
  // `cancellation_reason`. Accept both so neither silently drops the reason.
  const reason: string | null =
    req.body?.reason ?? req.body?.cancellation_reason ?? null;

  let cancelledRiderTasks: CancelledRiderTask[] = [];

  // Only the order number is needed after the transaction.
  const cancelledOrder: { order_number: string } = await withTransaction(async (client) => {
    // Check if order exists and belongs to user. FOR UPDATE so two concurrent
    // cancels can't both pass the status check and restore stock twice.
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE',
      [id, req.user!.id]
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundError('Order not found');
    }

    const order = orderResult.rows[0];

    // Check if order can be cancelled based on status
    // refunded is terminal too — cancelling it would re-run the inventory restore.
    if (['delivered', 'cancelled', 'refunded', 'out_for_delivery'].includes(order.status)) {
      throw new ConflictError(`Order cannot be cancelled in ${order.status} status`);
    }

    // Orders can only be cancelled within 30 minutes of placement (or any
    // time while still pending).
    const placedAt = new Date(order.placed_at);
    const now = new Date();
    const minutesSincePlacement = (now.getTime() - placedAt.getTime()) / (1000 * 60);
    const CANCELLATION_WINDOW_MINUTES = 30;

    if (order.status !== 'pending' && minutesSincePlacement > CANCELLATION_WINDOW_MINUTES) {
      throw new BadRequestError(
        `Order can only be cancelled within ${CANCELLATION_WINDOW_MINUTES} minutes of placement`
      );
    }

    // Update order status
    await client.query(
      `UPDATE orders 
       SET status = 'cancelled', 
           cancelled_at = NOW(), 
           cancellation_reason = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [reason, id]
    );

    // Paid order cancelled → money is owed back to the customer. Record a
    // refunds-ledger row (same shape as complaint.controller's refund insert)
    // so finance can reconcile the outflow; never blocks the cancellation.
    // The FOR UPDATE row lock + status check above make this run exactly once.
    // Only what was paid and not already refunded (utils/refundDue.ts).
    {
      await recordRefundDueOnCancel(client, { id, payment_status: order.payment_status, paid_amount: order.paid_amount });
    }

    // Restore time-slot seat + stock (shared with admin/webhook cancel paths).
    await restoreOrderInventory(client, order);

    // Defensive: no rider task should be active here (out_for_delivery can't be
    // cancelled), but if the rule ever loosens the rider must be told.
    cancelledRiderTasks = await cancelActiveRiderTasks(client, id, {
      note: reason ? `Order cancelled by customer: ${reason}` : 'Order cancelled by customer',
    });

    return order;
  });

  notifyRiderTasksCancelled(cancelledRiderTasks, { id, order_number: cancelledOrder.order_number }, reason);

  // Emit real-time cancellation events
  emitOrderUpdate(id, {
    orderId: id,
    status: 'cancelled',
    reason,
    message: `Order #${cancelledOrder.order_number} has been cancelled`,
  });

  emitOrderEventToAdmins(id, 'order:cancelled', {
    orderId: id,
    orderNumber: cancelledOrder.order_number,
    reason,
    message: `Order #${cancelledOrder.order_number} cancelled by customer`,
  });

  successResponse(res, null, 'Order cancelled successfully');
});
