import { couponLimitError } from '@/controllers/coupon.controller';

const base = {
  code: 'X', description: null, discount_type: 'percentage', discount_value: 20,
  max_discount_amount: 300, min_order_amount: 0, usage_limit: 100, usage_limit_per_user: null,
  first_order_only: false, valid_from: null, valid_until: null, is_active: true,
  trigger_type: 'manual', inactivity_days: null, milestone_orders: null, auto_reusable: false,
} as any;

describe('coupon caps for non-super admins (K6)', () => {
  it('allows a capped, limited coupon', () => {
    expect(couponLimitError(base, 'admin')).toBeNull();
  });
  it('refuses 100 % off, no cap, or unlimited use', () => {
    expect(couponLimitError({ ...base, discount_value: 100 }, 'admin')).toMatch(/super admin/);
    expect(couponLimitError({ ...base, max_discount_amount: null }, 'admin')).toMatch(/maximum discount/);
    expect(couponLimitError({ ...base, usage_limit: null }, 'admin')).toMatch(/usage limit/);
    expect(couponLimitError({ ...base, discount_type: 'fixed', discount_value: 5000, max_discount_amount: null }, 'admin')).toMatch(/Fixed discounts/);
  });
  it('the super admin is not capped', () => {
    expect(couponLimitError({ ...base, discount_value: 100, max_discount_amount: null, usage_limit: null }, 'super_admin')).toBeNull();
  });
});
