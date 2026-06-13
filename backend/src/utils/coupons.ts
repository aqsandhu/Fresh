// ============================================================================
// COUPON LOGIC — pure, server-authoritative validation + discount math.
// ----------------------------------------------------------------------------
// Discount and every eligibility check live here so the cart-preview path and
// the order-placement path (which holds the FOR UPDATE lock) agree exactly.
// The client never computes its own discount.
// ============================================================================

import { query } from '../config/database';
import { roundMoney } from './money';
import logger from './logger';

export type DiscountType = 'percentage' | 'fixed' | 'free_delivery';

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: string | number;
  max_discount_amount: string | number | null;
  min_order_amount: string | number;
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  used_count: number;
  first_order_only: boolean;
  valid_from: string | Date | null;
  valid_until: string | Date | null;
  is_active: boolean;
  city_id: string | null;
}

export interface CouponContext {
  /** Cart product subtotal (server-computed, fresh from products). */
  subtotal: number;
  now?: Date;
  /** coupons.used_count at check time. */
  totalUsed: number;
  /** Redemptions already recorded for this user. */
  userUsed: number;
  /** True when the user has no prior non-cancelled order. */
  isFirstOrder: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Returns a customer-facing reason string if the coupon cannot be applied in
 * this context, or null when it is valid. Order of checks matches what a
 * customer most needs to know first.
 */
export function couponValidationError(
  coupon: CouponRow,
  ctx: CouponContext
): string | null {
  const now = ctx.now ?? new Date();

  if (!coupon.is_active) return 'This coupon is not active.';

  if (coupon.valid_from && new Date(coupon.valid_from).getTime() > now.getTime()) {
    return 'This coupon is not active yet.';
  }
  if (coupon.valid_until && new Date(coupon.valid_until).getTime() < now.getTime()) {
    return 'This coupon has expired.';
  }

  const minOrder = num(coupon.min_order_amount);
  if (minOrder > 0 && ctx.subtotal < minOrder) {
    const remaining = roundMoney(minOrder - ctx.subtotal);
    return `Add Rs. ${remaining} more to use this coupon (minimum order Rs. ${roundMoney(minOrder)}).`;
  }

  if (coupon.usage_limit != null && ctx.totalUsed >= coupon.usage_limit) {
    return 'This coupon has reached its usage limit.';
  }

  if (
    coupon.usage_limit_per_user != null &&
    ctx.userUsed >= coupon.usage_limit_per_user
  ) {
    return 'You have already used this coupon the maximum number of times.';
  }

  if (coupon.first_order_only && !ctx.isFirstOrder) {
    return 'This coupon is valid on your first order only.';
  }

  return null;
}

export interface CouponDiscount {
  /** Money taken off the product subtotal. */
  productDiscount: number;
  /** When true, the delivery charge is waived for this order. */
  freeDelivery: boolean;
}

/**
 * Compute the discount a (already-validated) coupon yields for a subtotal.
 * Never returns more than the subtotal, and never negative.
 */
export function computeCouponDiscount(
  coupon: CouponRow,
  subtotal: number
): CouponDiscount {
  const safeSubtotal = Math.max(0, num(subtotal));

  if (coupon.discount_type === 'free_delivery') {
    return { productDiscount: 0, freeDelivery: true };
  }

  if (coupon.discount_type === 'percentage') {
    let d = (safeSubtotal * num(coupon.discount_value)) / 100;
    const cap = coupon.max_discount_amount;
    if (cap != null && cap !== '') {
      d = Math.min(d, num(cap));
    }
    return { productDiscount: roundMoney(Math.min(Math.max(0, d), safeSubtotal)), freeDelivery: false };
  }

  // fixed
  const fixed = Math.min(Math.max(0, num(coupon.discount_value)), safeSubtotal);
  return { productDiscount: roundMoney(fixed), freeDelivery: false };
}

/**
 * A single human-readable "logic sentence" describing what the coupon does and
 * the conditions under which it applies. Shown in the admin list and returned
 * to the storefront so customers understand the offer.
 */
export function buildCouponSummary(coupon: CouponRow): string {
  const parts: string[] = [];
  const value = num(coupon.discount_value);
  const minOrder = num(coupon.min_order_amount);

  if (coupon.discount_type === 'percentage') {
    let head = `${value}% off`;
    if (coupon.max_discount_amount != null && coupon.max_discount_amount !== '') {
      head += ` (up to Rs. ${num(coupon.max_discount_amount)})`;
    }
    parts.push(head);
  } else if (coupon.discount_type === 'fixed') {
    parts.push(`Rs. ${value} off`);
  } else {
    parts.push('Free delivery');
  }

  if (minOrder > 0) parts.push(`on orders of Rs. ${minOrder} or more`);

  const conditions: string[] = [];
  if (coupon.first_order_only) conditions.push('first order only');
  if (coupon.usage_limit_per_user != null) {
    conditions.push(
      `${coupon.usage_limit_per_user} use${coupon.usage_limit_per_user === 1 ? '' : 's'} per customer`
    );
  }
  if (coupon.usage_limit != null) {
    conditions.push(`${coupon.usage_limit} total use${coupon.usage_limit === 1 ? '' : 's'}`);
  }

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (coupon.valid_from && coupon.valid_until) {
    conditions.push(`valid ${fmtDate(coupon.valid_from)}–${fmtDate(coupon.valid_until)}`);
  } else if (coupon.valid_until) {
    conditions.push(`until ${fmtDate(coupon.valid_until)}`);
  } else if (coupon.valid_from) {
    conditions.push(`from ${fmtDate(coupon.valid_from)}`);
  }

  let sentence = parts.join(' ');
  if (conditions.length > 0) sentence += ` — ${conditions.join(', ')}`;
  return `${sentence}.`;
}

// ─── schema readiness probe (graceful degradation before migration 21) ──────
let couponsTableCached: boolean | null = null;

export async function hasCouponsTable(): Promise<boolean> {
  if (couponsTableCached !== null) return couponsTableCached;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'coupons' LIMIT 1`
    );
    couponsTableCached = (r.rowCount ?? 0) > 0;
  } catch (err: any) {
    logger.warn('Could not probe coupons table', { error: err?.message });
    couponsTableCached = false;
  }
  return couponsTableCached;
}

/** Reset the cached probe (used after creating the table at runtime / tests). */
export function resetCouponsTableCache(): void {
  couponsTableCached = null;
}
