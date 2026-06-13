// ============================================================================
// MONEY ROUNDING TESTS
// Covers the order-math rounding helper that keeps stored totals reconciling
// and the payment-webhook amount check free of float drift.
// ============================================================================

import { roundMoney } from '../../src/utils/money';

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(1.234)).toBe(1.23);
    expect(roundMoney(1.235)).toBe(1.24);
    expect(roundMoney(1.236)).toBe(1.24);
  });

  it('removes binary float residue', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    // A classic accumulation case
    expect(roundMoney(19.99 * 3)).toBe(59.97);
  });

  it('leaves clean amounts untouched', () => {
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(100)).toBe(100);
    expect(roundMoney(250.5)).toBe(250.5);
  });

  it('handles negative amounts symmetrically', () => {
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(-0.001)).toBe(-0);
  });

  it('coerces non-finite values to 0', () => {
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
    expect(roundMoney(-Infinity)).toBe(0);
  });

  it('keeps a reconciling order total exact', () => {
    // subtotal - discount - coupon + delivery === total, no residue
    const subtotal = roundMoney(333.33);
    const discount = roundMoney(33.333);
    const coupon = roundMoney(0);
    const delivery = roundMoney(100);
    const total = roundMoney(subtotal + delivery - discount - coupon);
    expect(total).toBe(400.0);
    expect(Number.isInteger(total * 100)).toBe(true);
  });
});
