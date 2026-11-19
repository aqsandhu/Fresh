/**
 * May the customer still cancel this order? The SAME rule the server applies
 * (backend order.controller cancelOrder). The list offered Cancel on
 * pending / confirmed / preparing and the detail on pending / confirmed, both
 * with no time limit — the server then refused older ones (I17):
 *  - never once it is out for delivery, delivered, cancelled or refunded;
 *  - any time while still pending;
 *  - otherwise only within 30 minutes of placing it.
 */
export const CANCELLATION_WINDOW_MINUTES = 30;

const NOT_CANCELLABLE = new Set(['out_for_delivery', 'out-for-delivery', 'delivered', 'cancelled', 'refunded']);

export function canCustomerCancel(
  status: string | null | undefined,
  placedAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!status || NOT_CANCELLABLE.has(status)) return false;
  if (status === 'pending') return true;
  const placed = placedAt ? Date.parse(placedAt) : NaN;
  if (!Number.isFinite(placed)) return false;
  return (now - placed) / 60000 <= CANCELLATION_WINDOW_MINUTES;
}
