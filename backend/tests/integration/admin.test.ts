// ============================================================================
// ADMIN ROUTES — REAL integration tests
// The admin router is gated by authenticate → requireAdmin → verifyAdminActive.
// These verify the role gate actually blocks non-admins, and that a
// demoted/suspended admin is rejected even with a valid (admin-claim) JWT.
// ============================================================================

import { jest } from '@jest/globals';
import request from 'supertest';
import { query } from '@/config/database';
import adminRoutes from '@/routes/admin.routes';
import { buildApp, signAccessToken } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;
const app = buildApp('/api/admin', adminRoutes);

function ok<T>(rows: T[]): any {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

describe('Admin role gate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('rejects a customer token with 403 (insufficient permissions)', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${signAccessToken({ role: 'customer' })}`);
    expect(res.status).toBe(403);
  });

  it('rejects an admin whose DB account is suspended with 403', async () => {
    // requireAdmin passes on the JWT claim, but verifyAdminActive re-checks the
    // DB — a suspended admin must be locked out immediately.
    mockQuery.mockResolvedValueOnce(ok([{ id: 'admin-1', role: 'admin', status: 'suspended' }]));

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${signAccessToken({ role: 'admin', userId: 'admin-1' })}`);

    expect(res.status).toBe(403);
  });
});
