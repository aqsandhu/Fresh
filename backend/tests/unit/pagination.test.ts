// ============================================================================
// PAGINATION CLAMP TESTS
// Locks the safety net that keeps untrusted ?page/?limit query params from
// reaching LIMIT/OFFSET unbounded (cheap DoS) or as NaN (Postgres 500).
// ============================================================================

import { parsePagination } from '../../src/utils/validators';

describe('parsePagination', () => {
  it('uses defaults when params are missing', () => {
    expect(parsePagination(undefined, undefined)).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('parses valid numeric strings and derives offset', () => {
    expect(parsePagination('3', '10')).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('caps limit at the max ceiling (unbounded DoS guard)', () => {
    expect(parsePagination('1', '999999999').limit).toBe(100);
    expect(parsePagination('1', '250', { maxLimit: 50 }).limit).toBe(50);
  });

  it('falls back to defaults for non-numeric input (no NaN reaches SQL)', () => {
    const r = parsePagination('abc', 'xyz');
    expect(r.limit).toBe(20);
    expect(r.page).toBe(1);
    expect(Number.isFinite(r.offset)).toBe(true);
    expect(r.offset).toBe(0);
  });

  it('rejects zero/negative page and limit', () => {
    expect(parsePagination('0', '0')).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(parsePagination('-5', '-5')).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('honours custom default limit', () => {
    expect(parsePagination(undefined, undefined, { defaultLimit: 8 }).limit).toBe(8);
  });
});
