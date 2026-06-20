// ============================================================================
// CART ROUTES — REAL integration tests
// Cart routes sit behind `authenticate`, so these verify the real auth gate,
// request validation, and ownership/return-shape behaviour with a mocked DB.
// ============================================================================

import { jest } from '@jest/globals';
import request from 'supertest';
import { query, withTransaction } from '@/config/database';
import cartRoutes from '@/routes/cart.routes';
import { buildApp, signAccessToken } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const app = buildApp('/api/cart', cartRoutes);

function ok<T>(rows: T[], command = 'SELECT'): any {
  return { rows, rowCount: rows.length, command, oid: 0, fields: [] };
}

const VALID_PRODUCT = '11111111-1111-1111-1111-111111111111';
const VALID_CITY = '22222222-2222-2222-2222-222222222222';

// Cart routes run `verifyUserActive` (a top-level `query`) after validation,
// so every request that reaches a controller first looks up the active user.
const ACTIVE_USER_ROW = {
  id: 'user-1',
  phone: '+923001234567',
  role: 'customer',
  status: 'active',
  full_name: 'Test User',
};
function mockActiveUser(): void {
  mockQuery.mockResolvedValueOnce(ok([ACTIVE_USER_ROW]));
}

function mockActiveUserAndLegacyCatalog(): void {
  mockQuery.mockImplementation(((sql: any) => {
    const text = String(sql);
    if (text.includes('FROM users')) return Promise.resolve(ok([ACTIVE_USER_ROW]));
    if (text.includes('information_schema')) return Promise.resolve(ok([]));
    return Promise.resolve(ok([]));
  }) as any);
}

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
      // verifyUserActive → active user lookup
      .mockResolvedValueOnce(ok([ACTIVE_USER_ROW]))
      // getOrCreateCart → existing active cart
      .mockResolvedValueOnce(ok([{ id: 'cart-1', user_id: 'user-1', status: 'active' }]))
      // hasQualityCatalogColumns probe (migration 34) → not present → legacy path
      .mockResolvedValueOnce(ok([]))
      // cart items
      .mockResolvedValueOnce(
        ok([{ id: 'item-1', product_id: VALID_PRODUCT, quantity: 2, unit_price: '150', total_price: '300' }])
      );

    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Both the active-user re-check and the cart lookup are scoped to the
    // authenticated user id, not a client-supplied one.
    expect(mockQuery.mock.calls[0][1]).toEqual(['user-1']);
    expect(mockQuery.mock.calls[1][1]).toEqual(['user-1']);
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

describe('POST /api/cart/sync', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unauthenticated sync with 401', async () => {
    const res = await request(app)
      .post('/api/cart/sync')
      .send({ items: [{ product_id: VALID_PRODUCT, quantity: 1 }] });
    expect(res.status).toBe(401);
  });

  it('rejects an empty items array with 422 before touching the DB', async () => {
    const res = await request(app)
      .post('/api/cart/sync')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ items: [] });

    expect(res.status).toBe(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID product_id with 422', async () => {
    const res = await request(app)
      .post('/api/cart/sync')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ items: [{ product_id: 'nope', quantity: 1 }] });

    expect(res.status).toBe(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an oversized cart (>100 lines) with 422', async () => {
    const items = Array.from({ length: 101 }, () => ({
      product_id: VALID_PRODUCT,
      quantity: 1,
    }));
    const res = await request(app)
      .post('/api/cart/sync')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ items });

    expect(res.status).toBe(422);
  });

  it('replaces the cart atomically inside ONE transaction and returns the snapshot', async () => {
    const clientQuery = jest.fn<any>((sql: string) => {
      const text = String(sql);
      if (text.includes('FROM carts') && text.includes("status = 'active'")) {
        return Promise.resolve(ok([{ id: 'cart-1', user_id: 'user-1', status: 'active' }]));
      }
      if (text.startsWith('DELETE FROM cart_items')) {
        return Promise.resolve(ok([], 'DELETE'));
      }
      if (text.includes('FROM products')) {
        return Promise.resolve(
          ok([
            {
              id: VALID_PRODUCT,
              name_en: 'Tomatoes',
              price: '100',
              half_kg_price: null,
              quarter_kg_price: null,
              half_dozen_price: null,
              stock_quantity: 50,
              stock_status: 'active',
            },
          ])
        );
      }
      if (text.includes('INSERT INTO cart_items')) {
        return Promise.resolve(ok([], 'INSERT'));
      }
      if (text.includes('SELECT * FROM carts WHERE id')) {
        return Promise.resolve(
          ok([
            {
              id: 'cart-1',
              subtotal: '150',
              discount_amount: '0',
              delivery_charge: '0',
              total_amount: '150',
              coupon_code: null,
              coupon_discount: '0',
              item_count: 1,
              total_weight_kg: '0',
              expires_at: null,
            },
          ])
        );
      }
      // cart items snapshot
      return Promise.resolve(
        ok([
          {
            id: 'item-1',
            product_id: VALID_PRODUCT,
            quantity: 1,
            unit_price: '50',
            total_price: '50',
            unit: 'half_kg',
          },
        ])
      );
    });

    mockActiveUserAndLegacyCatalog();
    mockWithTransaction.mockImplementationOnce(async (cb: any) => cb({ query: clientQuery }));

    const res = await request(app)
      .post('/api/cart/sync')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ city_id: VALID_CITY, items: [{ product_id: VALID_PRODUCT, quantity: 1, unit: 'half_kg' }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cart.id).toBe('cart-1');
    expect(res.body.data.items).toHaveLength(1);
    // Whole replace happened within a single transaction.
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    // Server resolved the half_kg price itself (100 * 0.5) — client never sent a price.
    const insertCall = clientQuery.mock.calls.find((c: any[]) =>
      String(c[0]).includes('INSERT INTO cart_items')
    );
    expect((insertCall![1] as any[])[3]).toBe(50);
  });

  it('rejects the whole sync when any product is out of stock', async () => {
    const clientQuery = jest.fn<any>((sql: string) => {
      const text = String(sql);
      if (text.includes('FROM carts')) {
        return Promise.resolve(ok([{ id: 'cart-1', user_id: 'user-1', status: 'active' }]));
      }
      if (text.startsWith('DELETE FROM cart_items')) {
        return Promise.resolve(ok([], 'DELETE'));
      }
      if (text.includes('FROM products')) {
        return Promise.resolve(
          ok([
            {
              id: VALID_PRODUCT,
              name_en: 'Tomatoes',
              price: '100',
              stock_quantity: 0,
              stock_status: 'out_of_stock',
            },
          ])
        );
      }
      return Promise.resolve(ok([]));
    });

    mockActiveUserAndLegacyCatalog();
    mockWithTransaction.mockImplementationOnce(async (cb: any) => cb({ query: clientQuery }));

    const res = await request(app)
      .post('/api/cart/sync')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ city_id: VALID_CITY, items: [{ product_id: VALID_PRODUCT, quantity: 2 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Insufficient stock');
  });
});
