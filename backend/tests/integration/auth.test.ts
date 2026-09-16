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
import { query, withTransaction } from '@/config/database';
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
    mockQuery.mockResolvedValueOnce(
      ok([{ id: 'user-1', phone: '+923001234567', role: 'customer', status: 'active', full_name: 'Aisha' }])
    );

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

describe('POST /api/auth/delete-account', () => {
  const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

  beforeEach(() => jest.clearAllMocks());

  it('soft-deletes + scrubs addresses instead of hard-deleting them (orders keep a valid address FK)', async () => {
    routeBySql({
      'FROM users': () =>
        ok([{ id: 'user-1', phone: '+923001234567', role: 'customer', status: 'active', full_name: 'Aisha' }]),
      'UPDATE refresh_tokens': () => ok([], 'UPDATE'),
    });
    const client = {
      query: jest.fn(async (sql: string) =>
        String(sql).includes('door_picture_url FROM addresses')
          ? ok([{ door_picture_url: 'https://x.supabase.co/storage/v1/object/public/uploads/addresses/door-pictures/a.jpg' }])
          : ok([], 'UPDATE')
      ),
    };
    mockWithTransaction.mockImplementationOnce((async (cb: any) => cb(client)) as never);

    const res = await request(app)
      .post('/api/auth/delete-account')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({});

    expect(res.status).toBe(200);
    const sqls = client.query.mock.calls.map((c) => String(c[0]));
    // A hard DELETE violated orders.address_id (NO ACTION) for anyone who had ordered.
    expect(sqls.some((s) => /DELETE FROM addresses/i.test(s))).toBe(false);
    const scrub = sqls.find((s) => /UPDATE addresses SET/i.test(s));
    expect(scrub).toBeDefined();
    expect(scrub).toMatch(/deleted_at = NOW\(\)/);
    expect(scrub).toMatch(/written_address = 'Deleted'/);
    expect(scrub).toMatch(/door_picture_url = NULL/);
    expect(scrub).toMatch(/location = NULL/);
    expect(scrub).toMatch(/delivery_instructions = NULL/);
    // The user row is anonymised in the same transaction.
    expect(sqls.some((s) => /UPDATE users SET/i.test(s) && /status = 'deleted'/i.test(s))).toBe(true);
  });

  it('refuses to delete workforce (non-customer) accounts', async () => {
    routeBySql({
      'FROM users': () =>
        ok([{ id: 'rider-1', phone: '+923001234567', role: 'rider', status: 'active', full_name: 'R' }]),
    });
    const res = await request(app)
      .post('/api/auth/delete-account')
      .set('Authorization', `Bearer ${signAccessToken({ userId: 'rider-1', role: 'rider' })}`)
      .send({});
    expect(res.status).toBe(403);
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });
});
