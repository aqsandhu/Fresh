// ============================================================================
// AUTH ROUTES — REAL integration tests
// Focus on the security-critical paths and the regressions fixed in this
// branch: cookie-mode token refresh (empty body must not 422), the socket
// handshake token endpoint, and PIN status lookup. DB is mocked by SQL shape
// so the tests don't depend on internal query ordering/caching.
// ============================================================================

import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { query } from '@/config/database';
import authRoutes from '@/routes/auth.routes';
import { buildApp, signAccessToken, signRefreshToken } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;
const app = buildApp('/api/auth', authRoutes);

function ok<T>(rows: T[], command = 'SELECT'): any {
  return { rows, rowCount: rows.length, command, oid: 0, fields: [] };
}

// Route DB calls by SQL shape so tests are robust to query ordering and the
// module-level column-existence cache in pinAuth.
function routeBySql(rows: Record<string, (sql: string) => any>): void {
  mockQuery.mockImplementation((async (sql: string) => {
    const text = String(sql);
    for (const [needle, build] of Object.entries(rows)) {
      if (text.includes(needle)) return build(text);
    }
    return ok([]);
  }) as never);
}

describe('POST /api/auth/refresh (cookie-mode regression)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts an EMPTY body when the refresh token rides in a cookie', async () => {
    routeBySql({
      'FROM refresh_tokens': () => ok([{ id: 'rt-1' }]), // token allowed
      'FROM users WHERE id': () =>
        ok([{ id: 'user-1', phone: '+923001234567', role: 'customer', status: 'active' }]),
      'UPDATE refresh_tokens': () => ok([], 'UPDATE'), // revoke previous
      'INSERT INTO refresh_tokens': () => ok([{ id: 'rt-2' }], 'INSERT'), // persist new
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${signRefreshToken()}`)
      .send({}); // website sends no body — must NOT 422

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 (not 422) when no token is present anywhere', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/refresh token required/i);
  });

  it('rejects a forged refresh token with 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'forged.jwt.value' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/socket-token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues a verifiable token to an authenticated user', async () => {
    const res = await request(app)
      .get('/api/auth/socket-token')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    const token = res.body.data.token as string;
    expect(typeof token).toBe('string');
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as Record<string, unknown>;
    expect(decoded.userId).toBe('user-1');
    expect(decoded.role).toBe('customer');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/auth/socket-token');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/pin-status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports an existing user with a PIN set without leaking their name', async () => {
    routeBySql({
      'information_schema.columns': () => ok([{ exists: 1 }]), // pin columns present
      'pin_hash IS NOT NULL': () => ok([{ has_pin: true, full_name: 'Aisha' }]),
    });

    const res = await request(app)
      .get('/api/auth/pin-status')
      .query({ phone: '+923001234567' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ exists: true, hasPin: true });
    // pin-status is unauthenticated — it must NOT leak the account holder's name.
    expect(res.body.data.fullName).toBeUndefined();
  });

  it('rejects an invalid phone number with 422', async () => {
    const res = await request(app).get('/api/auth/pin-status').query({ phone: 'abc' });
    expect(res.status).toBe(422);
  });
});
