// Shared helpers for the orders handlers (moved from orders.controller.ts, W21).

import { evaluateMilestone } from '../../../utils/autoCoupons';
import { roundMoney } from '../../../utils/money';
import { computeCouponDiscount, hasCouponsTable } from '../../../utils/coupons';

/**
 * Fire-and-forget: when an order reaches `delivered`, check whether the
 * customer has earned an order-milestone coupon (grants + notifies). Never
 * blocks or fails the request that triggered the delivery.
 */
/**
 * Coupon discount for an order whose subtotal just changed (weigh-in).
 * The coupon row is looked up through the order's redemption (or its code) and
 * applied to the new subtotal with the normal rules (percentage, cap, fixed
 * amount never above the subtotal). When the coupon no longer exists the old
 * discount keeps its share of the subtotal, never growing past either.
 * The redemption row follows, so reports show what was really given.
 */
export async function couponDiscountForNewSubtotal(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  o: { orderId: string; couponCode: string | null; oldDiscount: number; oldSubtotal: number; newSubtotal: number }
): Promise<number> {
  if (!(o.oldDiscount > 0) && !o.couponCode) return 0;
  let discount: number;
  let coupon: any = null;
  if (await hasCouponsTable()) {
    const viaRedemption = await client.query(
      `SELECT c.* FROM coupon_redemptions cr JOIN coupons c ON c.id = cr.coupon_id WHERE cr.order_id = $1 LIMIT 1`,
      [o.orderId]
    );
    coupon = viaRedemption.rows[0] ?? null;
    if (!coupon && o.couponCode) {
      const viaCode = await client.query(
        `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) ORDER BY created_at DESC LIMIT 1`,
        [o.couponCode]
      );
      coupon = viaCode.rows[0] ?? null;
    }
  }
  if (coupon) {
    discount = computeCouponDiscount(coupon, o.newSubtotal).productDiscount;
  } else {
    const share = o.oldSubtotal > 0 ? o.oldDiscount / o.oldSubtotal : 0;
    discount = Math.min(o.oldDiscount, o.newSubtotal * Math.min(1, share));
  }
  discount = roundMoney(Math.max(0, Math.min(discount, o.newSubtotal)));
  if (coupon && discount !== roundMoney(o.oldDiscount)) {
    await client.query(`UPDATE coupon_redemptions SET discount_amount = $1 WHERE order_id = $2`, [discount, o.orderId]);
  }
  return discount;
}

export function gradeMilestoneOnDelivery(order: { user_id?: string; city_id?: string | null }): void {
  if (!order?.user_id) return;
  evaluateMilestone(order.user_id, order.city_id ?? null).catch(() => undefined);
}
