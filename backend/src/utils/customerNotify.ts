// ============================================================================
// Customer notifications — one place for "tell the customer".
//
//   inbox row (notifications table, the bell)  → optional; order status rows
//                                                are written by the DB trigger
//                                                notify_order_status_change()
//   realtime socket ('notification:new')       → app/website open right now
//   Expo push                                   → app in background / closed
//
// Push honours users.notification_enabled (the "Order updates" switch on the
// website / app settings). Applied to CUSTOMERS only: a rider's work pushes
// (new task, cancelled task) must always arrive. The inbox row is always
// kept so the customer still sees it when they open the app.
//
// Everything here is fire-and-forget: it never throws into the request.
// ============================================================================

import { query } from '../config/database';
import { emitToUser } from '../config/socket';
import { sendExpoPushToUsers } from './expoPush';
import logger from './logger';

export type CustomerNotificationType =
  | 'order_confirmed'
  | 'order_ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'order_amount_updated'
  | 'promotion'
  | 'system';

export interface CustomerNotice {
  type: CustomerNotificationType;
  title: string;
  message: string;
  orderId?: string | null;
  /** Deep link for the website bell (e.g. '/cart'). */
  actionUrl?: string | null;
  actionType?: string | null;
  /** Extra push data (the app deep-links on orderId / screen). */
  data?: Record<string, unknown>;
  /** false = the inbox row already exists (DB trigger / caller insert). */
  inbox?: boolean;
}

/** Push to customers who have not switched notifications off. */
export async function pushToCustomers(
  userIds: Array<string | null | undefined>,
  message: { title: string; body: string; data?: Record<string, unknown> }
): Promise<number> {
  const ids = [...new Set(userIds.filter((u): u is string => typeof u === 'string' && u.length > 0))];
  if (ids.length === 0) return 0;
  try {
    const allowed = await query(
      `SELECT id FROM users
        WHERE id = ANY($1::uuid[])
          AND notification_enabled IS DISTINCT FROM FALSE`,
      [ids]
    );
    const to = allowed.rows.map((r: { id: string }) => r.id);
    if (to.length === 0) return 0;
    return await sendExpoPushToUsers(to, message);
  } catch (err) {
    logger.warn('pushToCustomers failed', { error: (err as Error).message });
    return 0;
  }
}

/** Inbox row (optional) + socket + push for one customer. Never throws. */
export async function notifyCustomer(userId: string | null | undefined, n: CustomerNotice): Promise<void> {
  if (!userId) return; // restaurant / B2B orders have no consumer
  try {
    if (n.inbox !== false) {
      await query(
        `INSERT INTO notifications (user_id, type, title, message, order_id, action_url, action_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, n.type, n.title, n.message, n.orderId ?? null, n.actionUrl ?? null, n.actionType ?? null]
      );
    }
  } catch (err) {
    logger.warn('notifyCustomer inbox insert failed', { error: (err as Error).message, type: n.type });
  }
  emitToUser(userId, 'notification:new', {
    type: n.type,
    title: n.title,
    message: n.message,
    orderId: n.orderId ?? null,
    actionUrl: n.actionUrl ?? null,
  });
  await pushToCustomers([userId], {
    title: n.title,
    body: n.message,
    data: { type: n.type, ...(n.orderId ? { orderId: n.orderId } : {}), ...(n.data || {}) },
  });
}

/**
 * Push text for an admin-made order status change. Wording matches the DB
 * trigger's inbox rows (migration 39). null = no customer push for it.
 */
export function orderStatusNotice(
  status: string,
  orderNumber: string,
  reason?: string | null
): { type: CustomerNotificationType; title: string; message: string } | null {
  const no = `#${orderNumber}`;
  switch (status) {
    case 'confirmed':
      return { type: 'order_confirmed', title: 'Order confirmed', message: `Your order ${no} has been confirmed!` };
    case 'preparing':
      return { type: 'order_confirmed', title: 'Order being prepared', message: `We are preparing your order ${no}.` };
    case 'ready_for_pickup':
      return { type: 'order_ready', title: 'Order packed', message: `Your order ${no} is packed and will leave with a rider soon.` };
    case 'out_for_delivery':
      return { type: 'out_for_delivery', title: 'Out for delivery', message: `Your order ${no} is on the way!` };
    case 'delivered':
      return { type: 'delivered', title: 'Order delivered', message: `Your order ${no} has been delivered. Enjoy!` };
    case 'cancelled': {
      const why = reason && String(reason).trim() ? ` Reason: ${String(reason).trim().slice(0, 140)}` : '';
      return { type: 'cancelled', title: 'Order cancelled', message: `Your order ${no} has been cancelled.${why}` };
    }
    case 'refunded':
      return { type: 'cancelled', title: 'Order refunded', message: `Your order ${no} has been refunded.` };
    default:
      return null;
  }
}

/** Statuses whose inbox row the DB trigger already writes (no second row). */
const TRIGGER_INBOX_STATUSES = new Set(['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']);

/** Admin changed an order's status → push (+ inbox where the trigger doesn't). */
export async function notifyOrderStatus(
  order: { id: string; user_id?: string | null; order_number: string },
  status: string,
  reason?: string | null
): Promise<void> {
  if (!order?.user_id) return;
  const notice = orderStatusNotice(status, order.order_number, reason);
  if (!notice) return;
  await notifyCustomer(order.user_id, {
    ...notice,
    orderId: order.id,
    data: { orderNumber: order.order_number, status },
    inbox: !TRIGGER_INBOX_STATUSES.has(status),
  });
}
