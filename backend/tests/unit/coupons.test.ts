// ============================================================================
// COUPON LOGIC TESTS — server-authoritative validation + discount math.
// ============================================================================

import {
  couponValidationError,
  computeCouponDiscount,
  buildCouponSummary,
  CouponRow,
} from '../../src/utils/coupons';

function makeCoupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: 'c1',
    code: 'SAVE20',
    description: null,
    discount_type: 'percentage',
    discount_value: 20,
    max_discount_amount: null,
    min_order_amount: 0,
    usage_limit: null,
    usage_limit_per_user: null,
    used_count: 0,
    first_order_only: false,
    valid_from: null,
    valid_until: null,
    is_active: true,
    city_id: null,
    ...overrides,
  };
}

const baseCtx = {
  subtotal: 1000,
  totalUsed: 0,
  userUsed: 0,
  isFirstOrder: true,
};

describe('computeCouponDiscount', () => {
  it('applies a percentage off the subtotal', () => {
    const d = computeCouponDiscount(makeCoupon({ discount_type: 'percentage', discount_value: 20 }), 1000);
    expect(d).toEqual({ productDiscount: 200, freeDelivery: false });
  });

  it('caps a percentage discount at max_discount_amount', () => {
    const d = computeCouponDiscount(
      makeCoupon({ discount_type: 'percentage', discount_value: 50, max_discount_amount: 100 }),
      1000
    );
    expect(d.productDiscount).toBe(100);
  });

  it('applies a fixed discount', () => {
    const d = computeCouponDiscount(makeCoupon({ discount_type: 'fixed', discount_value: 150 }), 1000);
    expect(d.productDiscount).toBe(150);
  });

  it('never discounts more than the subtotal', () => {
    const d = computeCouponDiscount(makeCoupon({ discount_type: 'fixed', discount_value: 5000 }), 1000);
    expect(d.productDiscount).toBe(1000);
  });

  it('flags free delivery and takes nothing off the subtotal', () => {
    const d = computeCouponDiscount(makeCoupon({ discount_type: 'free_delivery' }), 1000);
    expect(d).toEqual({ productDiscount: 0, freeDelivery: true });
  });

  it('rounds percentage discounts to 2dp', () => {
    const d = computeCouponDiscount(makeCoupon({ discount_type: 'percentage', discount_value: 33.33 }), 99.99);
    expect(Number.isInteger(d.productDiscount * 100)).toBe(true);
  });
});

describe('couponValidationError', () => {
  it('passes a valid coupon', () => {
    expect(couponValidationError(makeCoupon(), baseCtx)).toBeNull();
  });

  it('rejects an inactive coupon', () => {
    expect(couponValidationError(makeCoupon({ is_active: false }), baseCtx)).toMatch(/not active/i);
  });

  it('rejects a not-yet-started coupon', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(couponValidationError(makeCoupon({ valid_from: future }), baseCtx)).toMatch(/not active yet/i);
  });

  it('rejects an expired coupon', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(couponValidationError(makeCoupon({ valid_until: past }), baseCtx)).toMatch(/expired/i);
  });

  it('rejects when the minimum order is not met', () => {
    const err = couponValidationError(makeCoupon({ min_order_amount: 2000 }), baseCtx);
    expect(err).toMatch(/Add Rs\. 1000 more/);
  });

  it('rejects when the total usage limit is reached', () => {
    const err = couponValidationError(
      makeCoupon({ usage_limit: 5 }),
      { ...baseCtx, totalUsed: 5 }
    );
    expect(err).toMatch(/usage limit/i);
  });

  it('rejects when the per-user limit is reached', () => {
    const err = couponValidationError(
      makeCoupon({ usage_limit_per_user: 1 }),
      { ...baseCtx, userUsed: 1 }
    );
    expect(err).toMatch(/maximum number of times/i);
  });

  it('rejects a first-order-only coupon for a returning customer', () => {
    const err = couponValidationError(
      makeCoupon({ first_order_only: true }),
      { ...baseCtx, isFirstOrder: false }
    );
    expect(err).toMatch(/first order only/i);
  });

  it('allows a first-order-only coupon on a first order', () => {
    expect(
      couponValidationError(makeCoupon({ first_order_only: true }), { ...baseCtx, isFirstOrder: true })
    ).toBeNull();
  });
});

describe('buildCouponSummary', () => {
  it('summarises a capped percentage coupon with conditions', () => {
    const s = buildCouponSummary(
      makeCoupon({
        discount_type: 'percentage',
        discount_value: 20,
        max_discount_amount: 500,
        min_order_amount: 1000,
        first_order_only: true,
      })
    );
    expect(s).toContain('20% off');
    expect(s).toContain('up to Rs. 500');
    expect(s).toContain('Rs. 1000 or more');
    expect(s).toContain('first order only');
  });

  it('summarises a fixed coupon', () => {
    expect(buildCouponSummary(makeCoupon({ discount_type: 'fixed', discount_value: 150 }))).toContain(
      'Rs. 150 off'
    );
  });

  it('summarises a free-delivery coupon', () => {
    expect(buildCouponSummary(makeCoupon({ discount_type: 'free_delivery' }))).toContain(
      'Free delivery'
    );
  });

  it('describes a welcome-back coupon trigger', () => {
    const s = buildCouponSummary(
      makeCoupon({ trigger_type: 'welcome_back', inactivity_days: 30, auto_reusable: false })
    );
    expect(s).toContain('welcome-back reward after 30 days away');
    expect(s).toContain('one order only');
  });

  it('describes a reusable milestone coupon trigger', () => {
    const s = buildCouponSummary(
      makeCoupon({ trigger_type: 'order_milestone', milestone_orders: 10, auto_reusable: true })
    );
    expect(s).toContain('loyalty reward at 10 delivered orders');
    expect(s).toContain('reusable once earned');
  });
});

describe('auto coupons skip per-user / first-order checks (governed by the grant)', () => {
  it('does NOT reject an auto coupon for a returning customer on first_order_only', () => {
    const coupon = makeCoupon({
      trigger_type: 'welcome_back',
      inactivity_days: 30,
      first_order_only: true,
      usage_limit_per_user: 1,
    });
    // Returning customer who has used it before — a manual coupon would reject,
    // but the grant governs eligibility for auto coupons, so validation passes.
    expect(
      couponValidationError(coupon, { ...baseCtx, isFirstOrder: false, userUsed: 5 })
    ).toBeNull();
  });

  it('still enforces min order + expiry for auto coupons', () => {
    const coupon = makeCoupon({ trigger_type: 'welcome_back', inactivity_days: 30, min_order_amount: 2000 });
    expect(couponValidationError(coupon, baseCtx)).toMatch(/Add Rs\. 1000 more/);
  });
});
