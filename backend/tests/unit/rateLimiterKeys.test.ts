// ============================================================================
// RATE LIMITER KEYS — unit tests
// The order limiter must be keyed per authenticated USER (Pakistani carriers
// share one CGNAT IP across thousands of customers), falling back to the IP
// only when no identity is available.
// ============================================================================

import { userOrIpKey } from '@/middleware/rateLimiter';

function fakeReq(overrides: Record<string, unknown> = {}) {
  return { ip: '203.0.113.9', headers: {}, ...overrides } as any;
}

describe('userOrIpKey', () => {
  it('keys an authenticated request by user id, not by IP', () => {
    const key = userOrIpKey(fakeReq({ user: { id: 'user-1' } }));
    expect(key).toBe('u:user-1');
  });

  it('gives two customers on the same carrier IP different buckets', () => {
    const a = userOrIpKey(fakeReq({ user: { id: 'user-1' } }));
    const b = userOrIpKey(fakeReq({ user: { id: 'user-2' } }));
    expect(a).not.toBe(b);
  });

  it('falls back to the client IP when there is no authenticated user', () => {
    expect(userOrIpKey(fakeReq())).toBe('203.0.113.9');
  });

  it('never throws when the IP is missing', () => {
    expect(() => userOrIpKey(fakeReq({ ip: undefined }))).not.toThrow();
  });
});
