// The refresh limit is per SESSION (the token presented), not per IP: Pakistani
// mobile carriers put thousands of phones behind one address, and the old
// 60-per-15-min-per-IP limit signed the 61st customer on that address out.
import { refreshSessionKey } from '../../src/middleware/rateLimiter';

const req = (over: Record<string, unknown>) => ({ ip: '39.40.1.1', body: {}, cookies: {}, ...over }) as never;
const tokenA = 'a'.repeat(40);
const tokenB = 'b'.repeat(40);

describe('refreshSessionKey', () => {
  it('two customers behind the same IP get different keys', () => {
    const a = refreshSessionKey(req({ body: { refreshToken: tokenA } }));
    const b = refreshSessionKey(req({ body: { refreshToken: tokenB } }));
    expect(a).not.toBe(b);
    expect(a.startsWith('rt:')).toBe(true);
  });

  it('the same session keeps one key whichever way the token arrives and whatever its IP', () => {
    const body = refreshSessionKey(req({ body: { refreshToken: tokenA } }));
    const snake = refreshSessionKey(req({ body: { refresh_token: tokenA } }));
    const cookie = refreshSessionKey(req({ cookies: { refreshToken: tokenA }, ip: '10.0.0.9' }));
    expect(snake).toBe(body);
    expect(cookie).toBe(body);
  });

  it('never puts the token itself in the key', () => {
    expect(refreshSessionKey(req({ body: { refreshToken: tokenA } }))).not.toContain(tokenA);
  });

  it('falls back to the IP when no token is presented', () => {
    const k = refreshSessionKey(req({}));
    expect(k.startsWith('rt:')).toBe(false);
    expect(k).toContain('39.40.1.1');
  });
});
