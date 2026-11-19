// W17 (round 10) — I17: the app offers "Cancel Order" only when the server
// would accept it (pending any time, otherwise within 30 minutes, never once
// it is on the road). List and detail used to disagree and had no time limit.
import { canCustomerCancel, CANCELLATION_WINDOW_MINUTES } from '../src/utils/orderCancel';

const now = Date.parse('2026-11-19T12:00:00Z');
const ago = (m: number) => new Date(now - m * 60000).toISOString();

describe('canCustomerCancel', () => {
  it.each([
    ['pending', 600, true],
    ['confirmed', 10, true],
    ['confirmed', CANCELLATION_WINDOW_MINUTES + 1, false],
    ['preparing', 29, true],
    ['ready_for_pickup', 45, false],
    ['out_for_delivery', 1, false],
    ['out-for-delivery', 1, false],
    ['delivered', 1, false],
    ['cancelled', 1, false],
    ['refunded', 1, false],
  ])('%s placed %d min ago → %s', (status, mins, allowed) => {
    expect(canCustomerCancel(status, ago(mins), now)).toBe(allowed);
  });

  it('no status or no placing time → not offered', () => {
    expect(canCustomerCancel(undefined, ago(1), now)).toBe(false);
    expect(canCustomerCancel('confirmed', undefined, now)).toBe(false);
  });
});
