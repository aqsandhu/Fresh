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
import { resetCouponsTableCache } from '@/utils/coupons';
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

// ============================================================================
// Cancel-reason contract: mobile sends `reason`, the website historically sent
// `cancellation_reason`. Both must reach the stored cancellation_reason —
// the website variant used to be silently dropped (stored NULL).
// ============================================================================
import { withTransaction } from '@/config/database';

const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

const ORDER_ID = '22222222-2222-2222-2222-222222222222';
const VALID_CITY = '55555555-5555-5555-5555-555555555555';

const ACTIVE_USER_ROW = {
  id: 'user-1',
  phone: '+923001234567',
  role: 'customer',
  status: 'active',
  full_name: 'A',
};

function cancellableOrderClient() {
  const clientQuery = jest.fn<any>((sql: string) => {
    const text = String(sql);
    if (text.includes('FROM orders') && text.includes('FOR UPDATE')) {
      return Promise.resolve(
        ok([
          {
            id: ORDER_ID,
            user_id: 'user-1',
            status: 'pending',
            order_number: 'FB-1001',
            placed_at: new Date().toISOString(),
            time_slot_id: null,
          },
        ])
      );
    }
    if (text.includes('FROM order_items')) {
      return Promise.resolve(ok([]));
    }
    return Promise.resolve(ok([]));
  });
  return clientQuery;
}

describe('PUT /api/orders/:id/cancel reason aliases', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['reason', { reason: 'changed my mind' }],
    ['cancellation_reason (website)', { cancellation_reason: 'changed my mind' }],
  ])('persists the reason sent as %s', async (_label, body) => {
    const clientQuery = cancellableOrderClient();
    mockQuery.mockImplementation(((sql: any) => {
      const text = String(sql);
      if (text.includes('FROM users')) return Promise.resolve(ok([ACTIVE_USER_ROW]));
      if (text.includes('information_schema')) return Promise.resolve(ok([]));
      return Promise.resolve(ok([]));
    }) as any);
    mockWithTransaction.mockImplementationOnce(async (cb: any) => cb({ query: clientQuery }));

    const res = await request(app)
      .put(`/api/orders/${ORDER_ID}/cancel`)
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send(body);

    expect(res.status).toBe(200);

    const updateCall = clientQuery.mock.calls.find((c: any[]) =>
      String(c[0]).includes("status = 'cancelled'")
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![1] as any[])[0]).toBe('changed my mind');
  });
});

// ============================================================================
// Money path: createOrder must persist coupon_discount and the stored row
// must satisfy subtotal - discount - coupon + delivery = total.
// (Before migration 18 the coupon portion was subtracted from the total but
// stored NOWHERE, so the persisted numbers never reconciled.)
// ============================================================================

const VALID_ADDRESS = '33333333-3333-3333-3333-333333333333';
const VALID_PRODUCT2 = '44444444-4444-4444-4444-444444444444';
const VALID_SLOT = '66666666-6666-6666-6666-666666666666';

function createOrderClient() {
  const clientQuery = jest.fn<any>((sql: string) => {
    const text = String(sql);

    if (text.includes('FROM carts') && text.includes("status = 'active'")) {
      return Promise.resolve(
        ok([{
          id: 'cart-1', user_id: 'user-1', status: 'active',
          discount_amount: '30', coupon_discount: '20', coupon_code: 'SAVE20',
        }])
      );
    }
    if (text.includes('SELECT * FROM cart_items WHERE cart_id')) {
      return Promise.resolve(
        ok([{ id: 'ci-1', product_id: VALID_PRODUCT2, quantity: 2, unit: 'full', weight_kg: null, unit_price: '100' }])
      );
    }
    if (text.includes('FROM addresses')) {
      return Promise.resolve(
        ok([{
          id: VALID_ADDRESS, user_id: 'user-1', written_address: 'House 1, Street 2',
          landmark: '', house_number: 'H-12', area_name: 'Model Town',
          city: 'Gujrat', province: 'Punjab', postal_code: '', door_picture_url: '',
          location: null, zone_code: null,
        }])
      );
    }
    if (text.includes('service_cities')) {
      return Promise.resolve(ok([{ id: VALID_CITY, name: 'Gujrat' }]));
    }
    if (text.includes('SELECT city_id FROM products')) {
      return Promise.resolve(ok([{ city_id: null }]));
    }
    if (text.includes('FROM products') && text.includes('half_kg_price') && text.includes('FOR UPDATE')) {
      // Batched lock+fetch: WHERE id = ANY(...) FOR UPDATE — must include id so
      // createOrder can build its product map, plus the columns the second loop
      // reuses (primary_image, sku, stock_quantity).
      return Promise.resolve(
        ok([{
          id: VALID_PRODUCT2,
          price: '100', half_kg_price: null, quarter_kg_price: null, half_dozen_price: null,
          stock_status: 'active', is_active: true, name_en: 'Tomatoes', city_id: VALID_CITY,
          primary_image: null, sku: 'TOM-1', stock_quantity: 50,
        }])
      );
    }
    if (text.includes('UPDATE cart_items')) {
      return Promise.resolve(ok([]));
    }
    // Per-date slot validation + capacity claim.
    if (text.includes('FROM time_slots ts') && text.includes('disabled')) {
      return Promise.resolve(ok([{ max_orders: 50, disabled: false, past: false, wrong_day: false, passed: false }]));
    }
    if (text.includes('INSERT INTO time_slot_bookings')) {
      return Promise.resolve(ok([{ booked_count: 1 }]));
    }
    if (text.includes('UPDATE time_slots')) {
      return Promise.resolve(ok([{ id: VALID_SLOT }]));
    }
    if (text.includes('SELECT * FROM carts WHERE id')) {
      return Promise.resolve(
        ok([{
          id: 'cart-1', discount_amount: '30', coupon_discount: '20', coupon_code: 'SAVE20',
        }])
      );
    }
    if (text.includes('SELECT id FROM carts WHERE id')) {
      return Promise.resolve(ok([{ id: 'cart-1' }]));
    }
    if (text.includes('fresh_subtotal')) {
      return Promise.resolve(ok([{ fresh_subtotal: '200' }]));
    }
    if (text.includes('site_settings')) {
      return Promise.resolve(ok([
        { key: 'delivery_urgent_charge', value: '50' },
        { key: 'delivery_urgent_eta', value: '45-60 min' },
      ]));
    }
    if (text.includes('veg_fruit_total')) {
      return Promise.resolve(ok([{ veg_fruit_total: '0' }]));
    }
    if (text.includes('delivery_charges_config')) {
      return Promise.resolve(ok([]));
    }
    // Coupon engine: SAVE20 = flat Rs. 20 off, no conditions.
    if (text.includes('FROM coupons') && text.includes('FOR UPDATE')) {
      return Promise.resolve(
        ok([{
          id: 'coupon-1', code: 'SAVE20', description: null,
          discount_type: 'fixed', discount_value: '20', max_discount_amount: null,
          min_order_amount: '0', usage_limit: null, usage_limit_per_user: null,
          used_count: 0, first_order_only: false, valid_from: null, valid_until: null,
          is_active: true, city_id: null,
        }])
      );
    }
    if (text.includes('FROM coupon_redemptions')) {
      return Promise.resolve(ok([{ n: 0 }]));
    }
    if (text.includes('FROM orders') && text.includes("status <> 'cancelled'")) {
      return Promise.resolve(ok([])); // first order
    }
    if (text.includes('UPDATE coupons SET used_count')) {
      return Promise.resolve(ok([]));
    }
    if (text.includes('INSERT INTO coupon_redemptions')) {
      return Promise.resolve(ok([]));
    }
    if (text.includes('INSERT INTO orders')) {
      return Promise.resolve(
        ok([{ id: 'order-1', order_number: 'FB-1001', status: 'pending', total_amount: '250', user_id: 'user-1' }])
      );
    }
    if (text.includes('FROM products') && text.includes('primary_image')) {
      return Promise.resolve(
        ok([{ name_en: 'Tomatoes', primary_image: null, sku: 'TOM-1', stock_quantity: 50, stock_status: 'active' }])
      );
    }
    if (text.includes('INSERT INTO order_items')) {
      return Promise.resolve(ok([]));
    }
    if (text.includes('stock_quantity = stock_quantity -')) {
      return Promise.resolve(ok([{ id: VALID_PRODUCT2 }]));
    }
    return Promise.resolve(ok([]));
  });
  return clientQuery;
}

describe('POST /api/orders coupon accounting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists coupon_discount + coupon_code and the stored row reconciles', async () => {
    // The coupons-table probe caches across tests — reset so it re-probes here.
    resetCouponsTableCache();
    // Global (non-client) queries: verifyUserActive + the schema probes
    // (orders.coupon_discount column + the coupons table).
    mockQuery.mockImplementation(((sql: any) => {
      const text = String(sql);
      if (text.includes('information_schema')) {
        return Promise.resolve(ok([{ exists: 1 }]));
      }
      if (text.includes('FROM users')) {
        return Promise.resolve(ok([ACTIVE_USER_ROW]));
      }
      return Promise.resolve(ok([]));
    }) as any);

    const clientQuery = createOrderClient();
    mockWithTransaction.mockImplementationOnce(async (cb: any) => cb({ query: clientQuery }));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({
        address_id: VALID_ADDRESS,
        payment_method: 'cash_on_delivery',
        city_id: VALID_CITY,
        time_slot_id: VALID_SLOT,
        requested_delivery_date: '2026-06-19',
      });

    expect(res.status).toBe(201);

    const insertCall = clientQuery.mock.calls.find((c: any[]) =>
      String(c[0]).includes('INSERT INTO orders')
    );
    expect(insertCall).toBeDefined();
    const insertSql = String(insertCall![0]);
    expect(insertSql).toContain('coupon_discount');
    expect(insertSql).toContain('coupon_code');

    const params = insertCall![1] as any[];
    // [user, address, snapshot, slot, date, subtotal, discount, coupon, code, delivery, tax, total, ...]
    const subtotal = params[5];
    const discount = params[6];
    const coupon = params[7];
    const couponCode = params[8];
    const delivery = params[9];
    const tax = params[10];
    const total = params[11];

    expect(subtotal).toBe(200);
    // Cart-level discount is unused now; the discount comes from the coupon
    // table (SAVE20 = Rs. 20 off), recomputed server-side under a row lock.
    expect(discount).toBe(0);
    expect(coupon).toBe(20);
    expect(couponCode).toBe('SAVE20');
    expect(tax).toBe(0);
    // The stored row reconciles: subtotal - discount - coupon + delivery = total.
    expect(subtotal - discount - coupon + delivery + tax).toBeCloseTo(total, 2);

    // The redemption is recorded + the usage counter bumped in the same txn.
    expect(
      clientQuery.mock.calls.some((c: any[]) => String(c[0]).includes('UPDATE coupons SET used_count'))
    ).toBe(true);
    expect(
      clientQuery.mock.calls.some((c: any[]) => String(c[0]).includes('INSERT INTO coupon_redemptions'))
    ).toBe(true);
  });
});
