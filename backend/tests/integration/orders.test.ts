// ============================================================================
// ORDER ROUTES — REAL integration tests
// Order routes are behind `authenticate`; create also runs `verifyUserActive`
// + `validate(orderSchemas.create)`. These verify the real guard chain. The
// full transactional create path is covered by manual/e2e testing, not here.
// ============================================================================

import { jest } from '@jest/globals';
import request from 'supertest';
import { query } from '@/config/database';
import orderRoutes from '@/routes/order.routes';
import { buildApp, signAccessToken } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;
const app = buildApp('/api/orders', orderRoutes);

function ok<T>(rows: T[]): any {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

describe('Order auth gate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unauthenticated order list with 401', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated order create with 401', async () => {
    const res = await request(app).post('/api/orders').send({ address_id: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/orders validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a create with a missing address_id with 422', async () => {
    // verifyUserActive runs before validate, so the user must look active.
    mockQuery.mockResolvedValueOnce(
      ok([{ id: 'user-1', phone: '+923001234567', role: 'customer', status: 'active', full_name: 'A' }])
    );

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ payment_method: 'cod' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('rejects a non-UUID address_id with 422', async () => {
    mockQuery.mockResolvedValueOnce(
      ok([{ id: 'user-1', phone: '+923001234567', role: 'customer', status: 'active', full_name: 'A' }])
    );

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ address_id: 'not-a-uuid', payment_method: 'cod' });

    expect(res.status).toBe(422);
  });
});
