// ============================================================================
// CART ROUTES — REAL integration tests
// Cart routes sit behind `authenticate`, so these verify the real auth gate,
// request validation, and ownership/return-shape behaviour with a mocked DB.
// ============================================================================

import { jest } from '@jest/globals';
import request from 'supertest';
import { query } from '@/config/database';
import cartRoutes from '@/routes/cart.routes';
import { buildApp, signAccessToken } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;
const app = buildApp('/api/cart', cartRoutes);

function ok<T>(rows: T[], command = 'SELECT'): any {
  return { rows, rowCount: rows.length, command, oid: 0, fields: [] };
}

const VALID_PRODUCT = '11111111-1111-1111-1111-111111111111';

describe('Cart auth gate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unauthenticated GET /api/cart with 401', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects a tampered/invalid bearer token with 401', async () => {
    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/cart', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the cart and items for the authenticated user', async () => {
    mockQuery
      // getOrCreateCart → existing active cart
      .mockResolvedValueOnce(ok([{ id: 'cart-1', user_id: 'user-1', status: 'active' }]))
      // cart items
      .mockResolvedValueOnce(
        ok([{ id: 'item-1', product_id: VALID_PRODUCT, quantity: 2, unit_price: '150', total_price: '300' }])
      );

    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // First query is scoped to the authenticated user id, not a client-supplied one.
    expect(mockQuery.mock.calls[0][1]).toEqual(['user-1']);
  });
});

describe('POST /api/cart/add', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a missing product_id with 422 before touching the DB', async () => {
    const res = await request(app)
      .post('/api/cart/add')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ quantity: 2 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity with 422', async () => {
    const res = await request(app)
      .post('/api/cart/add')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ product_id: VALID_PRODUCT, quantity: 0 });

    expect(res.status).toBe(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID product_id with 422', async () => {
    const res = await request(app)
      .post('/api/cart/add')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ product_id: 'not-a-uuid', quantity: 1 });

    expect(res.status).toBe(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
