// ============================================================================
// OPEN WORK — orders (and atta requests) that are still on their way.
//
// An account must not be deleted while it has one (round 6, bug A27): the
// order stayed with no name or phone for the rider, and a restaurant's delete
// wiped the delivery address of its open orders. The customer or restaurant
// is asked to wait until the order is delivered, or to cancel it, first.
// ============================================================================

import { query } from '../config/database';

/** Order statuses that still need a delivery (or a decision) — not finished. */
export const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'] as const;

export interface OpenWork {
  orders: number;
  atta: number;
}

export async function openWorkForCustomer(userId: string): Promise<OpenWork> {
  const r = await query(
    `SELECT (SELECT COUNT(*) FROM orders
              WHERE user_id = $1 AND deleted_at IS NULL AND status::text = ANY($2::text[]))::int AS orders,
            (SELECT COUNT(*) FROM atta_requests
              WHERE user_id = $1 AND status::text NOT IN ('delivered', 'cancelled'))::int AS atta`,
    [userId, OPEN_ORDER_STATUSES]
  );
  return { orders: Number(r.rows[0]?.orders) || 0, atta: Number(r.rows[0]?.atta) || 0 };
}

export async function openOrdersForRestaurant(restaurantId: string): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM orders
      WHERE restaurant_id = $1 AND deleted_at IS NULL AND status::text = ANY($2::text[])`,
    [restaurantId, OPEN_ORDER_STATUSES]
  );
  return Number(r.rows[0]?.n) || 0;
}

/** "You have 2 orders and 1 atta request in progress…" — null when nothing is open. */
export function openWorkMessage(open: OpenWork): string | null {
  const parts: string[] = [];
  if (open.orders > 0) parts.push(`${open.orders} order${open.orders === 1 ? '' : 's'}`);
  if (open.atta > 0) parts.push(`${open.atta} atta request${open.atta === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  return `You have ${parts.join(' and ')} in progress. The account can be deleted once ${open.orders + open.atta === 1 ? 'it is' : 'they are'} delivered or cancelled.`;
}
