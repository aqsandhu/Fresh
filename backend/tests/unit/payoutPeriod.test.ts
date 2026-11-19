/**
 * Bug A26 (round 6): a shareholder payout records the Pakistan days it pays
 * for, and the payout cap counts every payout whose period overlaps the one
 * being paid. These pin down how a request's period turns into those days.
 */
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

import { periodRange, payoutPeriodClause } from '../../src/utils/profitCalc';

const TODAY = '2026-11-17';

describe('periodRange', () => {
  it('a day is that one day', () => {
    expect(periodRange({ date: '2026-10-10' }, TODAY)).toEqual({ start: '2026-10-10', end: '2026-10-10' });
  });

  it('a month with its year is the whole month, leap years included', () => {
    expect(periodRange({ month: 10, year: 2026 }, TODAY)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(periodRange({ month: 2, year: 2028 }, TODAY)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodRange({ month: 2, year: 2026 }, TODAY)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('today and this month are Pakistan days', () => {
    expect(periodRange({ period: 'today' }, TODAY)).toEqual({ start: TODAY, end: TODAY });
    expect(periodRange({ period: 'month' }, TODAY)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
  });

  it('the most specific period wins (same order as the profit numbers)', () => {
    expect(periodRange({ date: '2026-10-10', month: 9, year: 2026, period: 'month' }, TODAY)).toEqual({ start: '2026-10-10', end: '2026-10-10' });
    expect(periodRange({ month: 9, year: 2026, period: 'today' }, TODAY)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('no period, or one that does not exist, is null (never "all time" by accident)', () => {
    expect(periodRange({}, TODAY)).toBeNull();
    expect(periodRange({ month: 10 }, TODAY)).toBeNull(); // month without a year was paid against all-time profit
    expect(periodRange({ month: 13, year: 2026 }, TODAY)).toBeNull();
    expect(periodRange({ month: 10, year: 99999 }, TODAY)).toBeNull();
    expect(periodRange({ date: '2026-02-31' }, TODAY)).toBeNull();
    expect(periodRange({ date: '10-10-2026' }, TODAY)).toBeNull();
    expect(periodRange({ period: 'year' }, TODAY)).toBeNull();
  });
});

describe('payoutPeriodClause', () => {
  it('matches payouts whose period overlaps the one asked for', () => {
    const c = payoutPeriodClause({ month: 10, year: 2026 }, 2);
    expect(c.params).toEqual(['2026-10-31', '2026-10-01']);
    expect(c.sql).toContain('period_start');
    expect(c.sql).toContain('<= $2::date');
    expect(c.sql).toContain('period_end');
    expect(c.sql).toContain('>= $3::date');
  });

  it('no period = every payout', () => {
    expect(payoutPeriodClause({}, 2)).toEqual({ sql: '', params: [] });
  });
});
