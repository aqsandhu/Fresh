// ============================================================================
// REAL-DATABASE WRITE FLOWS (W18, round 10) — the app booted in this process
// against a real Postgres (E2E_DATABASE_URL), driven over HTTP like the apps
// and the admin panel drive it. Each step checks what the customer / staff
// would see afterwards (D11: no test that only calls a route).
//
// Kept apart from realDb.e2e.ts (its own port) so the GET smoke and the
// regression scripts stay one readable file each.
// ============================================================================
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.E2E_DATABASE_URL;
const PORT = process.env.E2E_WRITES_PORT || '3996';
const BASE = `http://localhost:${PORT}`;
const OTP = '123789';
const WEBHOOK_SECRET = 'e2e-webhook-secret-0123456789';
const suite = DATABASE_URL ? describe : describe.skip;

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const BM = path.join(__dirname, '..', '..', 'node_modules');

type Res = { status: number; body: any; data: any };
async function api(method: string, url: string, token?: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, data: parsed?.data };
}

const phone = () => `0349${String(Math.floor(1000000 + Math.random() * 8999999))}`;

suite('real database — write flows', () => {
  let db: any;
  let owner = '';
  let cityId = '';
  let H: Record<string, string> = {};
  const one = async (sql: string, params: unknown[] = []) => {
    const r = await db.query(sql, params);
    return r.rows[0] ? Object.values(r.rows[0])[0] as any : null;
  };

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL,
      DB_SSL: 'false',
      PORT,
      NODE_ENV: 'development',
      JWT_SECRET: process.env.JWT_SECRET || 'e'.repeat(64),
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'f'.repeat(64),
      ADMIN_PHONE: '03001112222',
      ADMIN_PASSWORD: 'Admin12345',
      OTP_BYPASS_ENABLED: 'true',
      OTP_BYPASS_CODE: OTP,
      WEBHOOK_SECRET: WEBHOOK_SECRET,
    });
    await import('../../src/app');
    for (let i = 0; i < 240; i++) {
      try { if ((await fetch(`${BASE}/ready`)).status === 200) break; } catch { /* not yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    const { Client } = require(path.join(BM, 'pg'));
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    cityId = await one(`select id from service_cities where name = 'Gujrat' limit 1`);
    H = { 'X-City-Id': cityId };
    let s = await api('POST', '/admin/login', null, { phone: '03001112222', password: 'Admin12345' });
    if (s.data?.requires_otp) s = await api('POST', '/admin/login', null, { phone: '03001112222', password: 'Admin12345', otp: OTP });
    owner = s.data.tokens.accessToken;
  });

  afterAll(async () => {
    await db?.end().catch(() => undefined);
  });

  describe('a customer account: OTP sign-up, PIN, password', () => {
    const p = phone();
    let access = '';
    let refresh = '';

    it('signs up with the one-time code; a wrong code is refused', async () => {
      expect((await api('POST', '/auth/send-otp', null, { phone: p })).status).toBe(200);
      expect((await api('POST', '/auth/verify-register', null, { phone: p, code: '000000', full_name: 'E2E Writer' })).status).toBeGreaterThanOrEqual(400);
      const reg = await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Writer', password: 'Secret123' });
      expect(reg.status).toBeLessThan(300);
      access = reg.data.tokens.accessToken;
      refresh = reg.data.tokens.refreshToken;
      const me = await api('GET', '/auth/me', access);
      expect(me.data?.user?.full_name ?? me.data?.full_name).toBe('E2E Writer');
    });

    it('sets a PIN (a weak one refused) and signs in with it; a wrong PIN is refused', async () => {
      expect((await api('POST', '/auth/set-pin', access, { pin: '1234' })).status).toBe(400);
      expect((await api('POST', '/auth/set-pin', access, { pin: '4826' })).status).toBe(200);
      expect((await api('POST', '/auth/verify-pin', null, { phone: p, pin: '4826' })).data?.tokens?.accessToken).toBeTruthy();
      expect((await api('POST', '/auth/verify-pin', null, { phone: p, pin: '5937' })).status).toBe(401);
    });

    it('a forgotten PIN is reset with the code; the old PIN stops working', async () => {
      expect((await api('POST', '/auth/reset-pin', null, { phone: p, code: OTP, newPin: '5937' })).status).toBe(200);
      expect((await api('POST', '/auth/verify-pin', null, { phone: p, pin: '5937' })).status).toBe(200);
      expect((await api('POST', '/auth/verify-pin', null, { phone: p, pin: '4826' })).status).toBe(401);
    });

    it('changing the password needs the current one and ends the other sessions', async () => {
      expect((await api('PUT', '/auth/change-password', access, { current_password: 'Wrong999', new_password: 'Secret456' })).status).toBeGreaterThanOrEqual(400);
      expect((await api('PUT', '/auth/change-password', access, { current_password: 'Secret123', new_password: 'Secret456' })).status).toBe(200);
      expect((await api('POST', '/auth/refresh', null, { refreshToken: refresh })).status).toBe(401);
    });

    it('the profile name can be changed', async () => {
      const fresh = (await api('POST', '/auth/verify-pin', null, { phone: p, pin: '5937' })).data.tokens.accessToken;
      expect((await api('PUT', '/auth/profile', fresh, { full_name: 'E2E Writer Two' })).status).toBe(200);
      expect(await one(`select full_name from users where phone = $1 or phone = $2`, [p, `+92${p.slice(1)}`])).toBe('E2E Writer Two');
    });
  });

  describe('addresses and the cart', () => {
    let token = '';
    let first = '';
    let second = '';

    beforeAll(async () => {
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      token = (await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Cart' })).data.tokens.accessToken;
    });

    it('adds, edits, makes default and deletes addresses', async () => {
      const add = (written: string) => api('POST', '/addresses', token, { written_address: written, area_name: 'Model Town', city: 'Gujrat', latitude: 32.5742, longitude: 74.0754 });
      first = (await add('House 12, Street 4')).data?.id;
      second = (await add('Shop 3, Main Bazar')).data?.id;
      expect(first && second).toBeTruthy();
      expect((await api('PUT', `/addresses/${first}`, token, { landmark: 'Near the mosque' })).status).toBe(200);
      expect(await one(`select landmark from addresses where id = $1`, [first])).toBe('Near the mosque');
      expect((await api('PUT', `/addresses/${second}/set-default`, token)).status).toBe(200);
      expect(await one(`select count(*)::int from addresses where user_id = (select user_id from addresses where id = $1) and is_default`, [second])).toBe(1);
      expect(await one(`select is_default from addresses where id = $1`, [second])).toBe(true);
      expect((await api('DELETE', `/addresses/${first}`, token)).status).toBe(200);
      const list = (await api('GET', '/addresses', token)).data as any[];
      expect(list.map((a) => a.id)).toEqual([second]);
    });

    it("another customer's address cannot be edited or deleted", async () => {
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      const other = (await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Other' })).data.tokens.accessToken;
      expect((await api('PUT', `/addresses/${second}`, other, { landmark: 'hijack' })).status).toBe(404);
      expect((await api('DELETE', `/addresses/${second}`, other)).status).toBe(404);
    });

    it('cart: add, change the quantity, delivery charge, remove', async () => {
      const product = await one(
        `select p.id from products p where p.is_active and coalesce(p.stock_quantity, 0) > 10 and p.price > 0
           and (p.city_id = $1 or p.city_id is null) order by p.created_at desc limit 1`, [cityId]);
      expect(product).toBeTruthy();
      const add = await api('POST', '/cart/add', token, { product_id: product, quantity: 1, city_id: cityId });
      expect(add.status).toBeLessThan(300);
      const cart = async () => (await api('GET', `/cart?city_id=${cityId}`, token)).data;
      const itemId = ((await cart()).items || []).find((i: any) => i.product_id === product)?.id;
      expect(itemId).toBeTruthy();
      expect((await api('PUT', `/cart/update/${itemId}`, token, { quantity: 3 })).status).toBe(200);
      expect(((await cart()).items || []).find((i: any) => i.id === itemId)?.quantity).toBe(3);
      const charge = await api('POST', '/cart/delivery-charge', token, {});
      expect(charge.status).toBe(200);
      expect(typeof (charge.data?.delivery_charge ?? charge.data?.deliveryCharge)).toBe('number');
      expect((await api('DELETE', `/cart/remove/${itemId}`, token)).status).toBe(200);
      expect(((await cart()).items || []).find((i: any) => i.id === itemId)).toBeUndefined();
    });
  });

  describe('a city of its own: delivery, banner, WhatsApp, on / off', () => {
    let city = '';
    let CH: Record<string, string> = {};
    const name = `E2E Town ${Math.floor(Math.random() * 1e6)}`;

    beforeAll(async () => {
      const made = await api('POST', '/admin/cities', owner, { name, province: 'Punjab' });
      expect(made.status).toBeLessThan(300);
      city = made.data?.id || (await one(`select id from service_cities where name = $1`, [name]));
      CH = { 'X-City-Id': city };
    });

    afterAll(async () => {
      await api('DELETE', `/admin/cities/${city}`, owner);
    });

    it("the city's own delivery charge is what customers there are quoted; reset goes back to the general one", async () => {
      const general = (await api('GET', '/site-settings/delivery')).data;
      expect((await api('PUT', '/admin/settings/delivery', owner, { base_charge: 0, free_delivery_threshold: 1500, urgent_charge: 250, urgent_eta: '45 min' }, CH)).status).toBe(200);
      const quoted = (await api('GET', `/site-settings/delivery?city_id=${city}`)).data;
      expect(quoted).toMatchObject({ base_charge: 0, free_delivery_threshold: 1500, urgent_charge: 250, urgent_enabled: true, urgent_eta: '45 min' });
      expect((await api('GET', `/site-settings/delivery?city_id=${cityId}`)).data.base_charge).toBe(general.base_charge);
      expect((await api('PUT', '/admin/settings/delivery', owner, { reset_to_global: true }, CH)).status).toBe(200);
      expect((await api('GET', `/site-settings/delivery?city_id=${city}`)).data.base_charge).toBe(general.base_charge);
    });

    it('banner and WhatsApp order link per city; a bad link is refused', async () => {
      const banner = { banner_left_text: '0300 1234567', banner_middle_text: 'Fresh daily', banner_right_text_en: 'Free delivery', banner_right_text_ur: 'مفت ڈیلیوری', banner_ticker_items: ['Aloo', 'Tamatar'] };
      expect((await api('PUT', '/admin/site-settings/banner', owner, banner, CH)).status).toBe(200);
      const read = (await api('GET', '/admin/site-settings/banner', owner, undefined, CH)).data;
      expect(JSON.stringify(read)).toContain('0300 1234567');
      expect((await api('PUT', '/admin/site-settings/whatsapp-order', owner, { whatsapp_order_url: 'not a link' }, CH)).status).toBe(400);
      expect((await api('PUT', '/admin/site-settings/whatsapp-order', owner, { whatsapp_order_url: 'https://wa.me/923001234567' }, CH)).status).toBe(200);
      expect(JSON.stringify((await api('GET', '/admin/site-settings/whatsapp-order', owner, undefined, CH)).data)).toContain('wa.me/923001234567');
    });

    it('switching the city off hides it from customers; on brings it back', async () => {
      const listed = async () => ((await api('GET', '/site-settings/cities')).data as any[]).some((c) => c.id === city);
      expect(await listed()).toBe(true);
      expect((await api('PUT', `/admin/cities/${city}/toggle`, owner)).status).toBe(200);
      expect(await listed()).toBe(false);
      expect((await api('PUT', `/admin/cities/${city}/toggle`, owner)).status).toBe(200);
      expect(await listed()).toBe(true);
    });
  });

  describe('catalogue: category, product, moving products', () => {
    const tag = Math.floor(Math.random() * 1e6);
    let catA = '';
    let catB = '';
    let product = '';

    afterAll(async () => {
      // Test rows must not show in the real shop menu.
      if (product) await db.query(`update products set is_active = false where id = $1`, [product]);
      await db.query(`update categories set is_active = false where id = any($1::uuid[])`, [[catA, catB].filter(Boolean)]);
    });

    it('a category needs both names; then it is created', async () => {
      expect((await api('POST', '/admin/categories', owner, { name_en: `E2E Veg ${tag}` }, H)).status).toBe(400);
      catA = (await api('POST', '/admin/categories', owner, { name_en: `E2E Veg ${tag}`, name_ur: 'سبزی', slug: `e2e-veg-${tag}` }, H)).data?.id;
      catB = (await api('POST', '/admin/categories', owner, { name_en: `E2E Fruit ${tag}`, name_ur: 'پھل', slug: `e2e-fruit-${tag}` }, H)).data?.id;
      expect(catA && catB).toBeTruthy();
    });

    it('a product: price required and above 0; created with its prices; starts with no stock', async () => {
      expect((await api('POST', '/admin/products', owner, { name_en: `E2E Aloo ${tag}`, category_id: catA, price: 0 }, H)).status).toBe(422);
      const made = await api('POST', '/admin/products', owner, { name_en: `E2E Aloo ${tag}`, name_ur: 'آلو', category_id: catA, price: 120, price_b: 100, unit_type: 'kg' }, H);
      expect(made.status).toBeLessThan(300);
      product = made.data?.id;
      const row = (await db.query(`select price, price_b, coalesce(stock_quantity, 0)::float as stock, category_id from products where id = $1`, [product])).rows[0];
      expect(Number(row.price)).toBe(120);
      expect(Number(row.price_b)).toBe(100);
      expect(row.stock).toBe(0);
      expect(row.category_id).toBe(catA);
    });

    it('products move to another category together; an unknown category is refused', async () => {
      expect((await api('PATCH', '/admin/products/move-category', owner, { product_ids: [product], category_id: '00000000-0000-4000-8000-000000000000' }, H)).status).toBe(404);
      expect((await api('PATCH', '/admin/products/move-category', owner, { product_ids: [product], category_id: catB }, H)).status).toBe(200);
      expect(await one(`select category_id from products where id = $1`, [product])).toBe(catB);
    });
  });

  describe('page tips and staff roles', () => {
    it('a tip is added for a page, edited, shown to customers, then removed', async () => {
      expect((await api('POST', '/admin/tips', owner, { page: 'nowhere', text_ur: 'کچھ بھی' }, H)).status).toBe(400);
      const id = (await api('POST', '/admin/tips', owner, { page: 'cart', text_ur: 'ٹوکری میں چیز شامل کریں', priority: 5 }, H)).data?.id;
      expect(id).toBeTruthy();
      expect((await api('PUT', `/admin/tips/${id}`, owner, { text_ur: 'ٹوکری دیکھیں اور آرڈر کریں' }, H)).status).toBe(200);
      expect(JSON.stringify((await api('GET', `/tips?page=cart&city_id=${cityId}`)).data)).toContain('ٹوکری دیکھیں');
      expect((await api('DELETE', `/admin/tips/${id}`, owner, undefined, H)).status).toBe(200);
      expect(JSON.stringify((await api('GET', `/tips?page=cart&city_id=${cityId}`)).data)).not.toContain('ٹوکری دیکھیں');
    });

    it('a role needs a name, a city and a permission; a staff member with it can do only that', async () => {
      expect((await api('POST', '/admin/roles', owner, { name: 'X', city_id: cityId, permissions: ['orders.view'] })).status).toBe(400);
      expect((await api('POST', '/admin/roles', owner, { name: 'E2E Viewer', city_id: cityId, permissions: [] })).status).toBe(400);
      const role = (await api('POST', '/admin/roles', owner, { name: `E2E Viewer ${Date.now()}`, city_id: cityId, permissions: ['orders.view'] })).data?.id;
      expect(role).toBeTruthy();
      const staffPhone = phone();
      const staff = await api('POST', '/admin/roles/users', owner, { phone: staffPhone, password: 'Staff12345', full_name: 'E2E Staff', role_id: role });
      expect(staff.status).toBeLessThan(300);
      let s = await api('POST', '/admin/login', null, { phone: staffPhone, password: 'Staff12345' });
      if (s.data?.requires_otp) s = await api('POST', '/admin/login', null, { phone: staffPhone, password: 'Staff12345', otp: OTP });
      const t = s.data?.tokens?.accessToken;
      expect(t).toBeTruthy();
      expect((await api('GET', '/admin/orders', t, undefined, H)).status).toBe(200);
      expect((await api('POST', '/admin/tips', t, { page: 'cart', text_ur: 'اجازت نہیں' }, H)).status).toBe(403);
      // the role now also edits products — the permission takes effect
      expect((await api('PUT', `/admin/roles/${role}`, owner, { permissions: ['orders.view', 'products.view'] })).status).toBe(200);
      expect((await api('GET', '/admin/products', t, undefined, H)).status).toBe(200);
    });
  });

  describe('an order from cart to door: rider, delivery, reviews, cash', () => {
    const bcrypt = require(path.join(BM, 'bcryptjs'));
    const tag = Math.floor(Math.random() * 1e6);
    let customer = '';
    let address = '';
    let productId = '';
    let slotId = '';
    let rider = { id: '', token: '' };
    const tomorrow = new Date(Date.now() + (5 + 24) * 3600 * 1000).toISOString().slice(0, 10);

    const placeOrder = async (qty = 2) => {
      expect((await api('POST', '/cart/add', customer, { product_id: productId, quantity: qty, unit: 'full', city_id: cityId })).status).toBeLessThan(300);
      const placed = await api('POST', '/orders', customer, { address_id: address, city_id: cityId, time_slot_id: slotId, requested_delivery_date: tomorrow, payment_method: 'cash_on_delivery' });
      expect(placed.status).toBe(201);
      return placed.data?.id || placed.data?.order?.id;
    };
    const toReady = async (orderId: string) => {
      for (const s of ['confirmed', 'preparing', 'ready_for_pickup']) {
        expect((await api('PUT', `/admin/orders/${orderId}/status`, owner, { status: s }, H)).status).toBe(200);
      }
      expect((await api('PUT', `/admin/orders/${orderId}/assign-rider`, owner, { rider_id: rider.id }, H)).status).toBe(200);
      return (await api('GET', '/rider/tasks/active', rider.token)).data.find((t: any) => t.order_id === orderId)?.id;
    };

    beforeAll(async () => {
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      customer = (await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Buyer' })).data.tokens.accessToken;
      address = (await api('POST', '/addresses', customer, { written_address: 'House 7, Street 2', area_name: 'Model Town', city: 'Gujrat', latitude: 32.57, longitude: 74.07 })).data.id;
      const cat = await one(`select id from categories order by created_at limit 1`);
      productId = await one(
        `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type)
         values ($1, $1, $2, $3, 300, 50, $4, true, 'kg') returning id`, [`E2E Order Aloo ${tag}`, `e2e-order-aloo-${tag}`, cat, cityId]);
      slotId = await one(`insert into time_slots (slot_name, start_time, end_time, status, max_orders) values ($1, '00:00', '23:59', 'available', 500) returning id`, [`E2E ${tag}`]);
      const rp = phone();
      const user = await one(`insert into users (phone, full_name, role, is_phone_verified, password_hash) values ($1, 'E2E Rider', 'rider', true, $2) returning id`,
        [`+92${rp.slice(1)}`, bcrypt.hashSync('rider123', 4)]);
      rider.id = await one(`insert into riders (user_id, cnic, vehicle_type, vehicle_number, status, verification_status, city_id) values ($1, $2, 'bike', $3, 'available', 'verified', $4) returning id`,
        [user, `35202${String(tag).padStart(8, '0')}`, `E2E-${tag}`, cityId]);
      const login = await api('POST', '/rider/login', null, { phone: rp, password: 'rider123' });
      rider.token = login.data?.tokens?.accessToken || login.data?.token || login.data?.accessToken;
    });

    afterAll(async () => {
      await db.query(`update products set is_active = false where id = $1`, [productId]);
      await db.query(`update time_slots set status = 'unavailable' where id = $1`, [slotId]).catch(() => undefined);
    });

    // F4 (W20): the website and the app read products, categories and orders
    // through one contract — packages/shared-types/src/apiRows.ts. This holds
    // the server to it: every snake_case field the contract declares must be in
    // the answer, except the few listed below with the reason. A renamed or
    // dropped column fails here instead of turning into a silent `undefined`.
    it('the shared wire contract is what the server sends (products, categories, orders)', async () => {
      const ts = require(path.join(BM, 'typescript'));
      const contractFile = path.join(__dirname, '..', '..', '..', 'packages', 'shared-types', 'src', 'apiRows.ts');
      const src = ts.createSourceFile(contractFile, fs.readFileSync(contractFile, 'utf8'), ts.ScriptTarget.Latest, true);
      const declared: Record<string, string[]> = {};
      src.forEachChild((n: any) => {
        if (ts.isInterfaceDeclaration(n)) {
          declared[n.name.text] = n.members.map((m: any) => m.name?.getText(src)).filter((k: string | undefined) => k && !/[A-Z]/.test(k));
        }
      });
      const notSent = (name: string, rows: Record<string, unknown>[], allowed: Record<string, string>) => {
        expect(rows.length).toBeGreaterThan(0);
        const keys = new Set(rows.flatMap((r) => Object.keys(r)));
        return declared[name].filter((k) => !keys.has(k) && !(k in allowed));
      };
      const LEGACY = 'older answers only';

      // Products: the list and one product.
      const listed = await api('GET', `/products?limit=50&city_id=${cityId}`);
      const productRows = Array.isArray(listed.data) ? listed.data : listed.data.products;
      const detail = await api('GET', `/products/${productId}?city_id=${cityId}`);
      expect(notSent('ApiProductRow', productRows, {
        name: LEGACY, image_url: LEGACY, is_fresh: LEGACY,
        tags: 'only the single-product answer',
        consumer_enabled_b: 'the list sends price_b = null instead', consumer_enabled_c: 'the list sends price_c = null instead',
      })).toEqual([]);
      expect(notSent('ApiProductRow', [detail.data.product || detail.data], {
        name: LEGACY, image_url: LEGACY, is_fresh: LEGACY,
        consumer_enabled_b: 'price_b = null instead', consumer_enabled_c: 'price_c = null instead',
        order_count: 'list only', rating_average: 'list only', review_count: 'list only',
      })).toEqual([]);

      // Categories: the list and one category.
      const cats = await api('GET', `/categories?city_id=${cityId}`);
      const catRows = Array.isArray(cats.data) ? cats.data : cats.data.categories;
      expect(notSent('ApiCategoryRow', catRows, {
        name: LEGACY, description: LEGACY, meta_description: 'only the single-category answer', subcategories: 'only the single-category answer',
      })).toEqual([]);

      // Orders: one placed order, as the customer sees it — in the list and on its own.
      const orderId = await placeOrder(1);
      const order = (await api('GET', `/orders/${orderId}`, customer)).data;
      const orderRow = order.order || order;
      const myOrders = (await api('GET', '/orders', customer)).data;
      const listRows = Array.isArray(myOrders) ? myOrders : myOrders.orders;
      expect(notSent('ApiOrderRow', [orderRow, ...listRows], {})).toEqual([]);
      expect(notSent('ApiOrderItemRow', orderRow.items, { name: LEGACY, product: LEGACY, price: LEGACY })).toEqual([]);
      expect(notSent('ApiAddressSnapshot', [orderRow.delivery_address_snapshot], {})).toEqual([]);
    });

    it('the rider goes off duty and back, and reports where they are', async () => {
      expect((await api('PUT', '/rider/status', rider.token, { status: 'sleeping' })).status).toBe(400);
      expect((await api('PUT', '/rider/status', rider.token, { status: 'offline' })).status).toBe(200);
      expect(await one(`select status from riders where id = $1`, [rider.id])).toBe('offline');
      expect((await api('PUT', '/rider/status', rider.token, { status: 'available' })).status).toBe(200);
      expect((await api('PUT', '/rider/location', rider.token, { latitude: 32.5742, longitude: 74.0754, accuracy: 12 })).status).toBe(200);
      expect(await one(`select location_updated_at is not null from riders where id = $1`, [rider.id])).toBe(true);
    });

    it('order → ready → assigned; the rider accepts, picks up and delivers; stock leaves once', async () => {
      const before = Number(await one(`select stock_quantity from products where id = $1`, [productId]));
      const orderId = await placeOrder(2);
      const task = await toReady(orderId);
      expect(task).toBeTruthy();
      expect((await api('POST', `/rider/tasks/${task}/accept`, rider.token)).status).toBe(200);
      expect((await api('PATCH', `/rider/tasks/${task}/status`, rider.token, { status: 'in_progress' })).status).toBe(200);
      expect((await api('PUT', `/rider/tasks/${task}/pickup`, rider.token, {})).status).toBe(200);
      expect(await one(`select status from orders where id = $1`, [orderId])).toBe('out_for_delivery');
      expect((await api('PUT', `/rider/tasks/${task}/deliver`, rider.token, { notes: 'e2e' })).status).toBe(200);
      expect(await one(`select status from orders where id = $1`, [orderId])).toBe('delivered');
      expect(Number(await one(`select stock_quantity from products where id = $1`, [productId]))).toBe(before - 2);

      // reviews: only after delivery, only your own order, the rider's rating follows
      const r1 = await api('POST', '/reviews', customer, { target_type: 'rider', order_id: orderId, rating: 4, comment: 'Polite rider' });
      expect(r1.status).toBeLessThan(300);
      expect(await one(`select rating_count from riders where id = $1`, [rider.id])).toBe(1);
      expect(Number(await one(`select rating from riders where id = $1`, [rider.id]))).toBe(4);
      expect((await api('POST', '/reviews', customer, { target_type: 'product', order_id: orderId, product_id: productId, rating: 5 })).status).toBeLessThan(300);
      expect((await api('POST', '/reviews', customer, { target_type: 'product', order_id: orderId, product_id: '00000000-0000-4000-8000-000000000000', rating: 5 })).status).toBe(400);
      expect((await api('POST', '/reviews', customer, { target_type: 'service', order_id: orderId, rating: 9 })).status).toBe(400);
      const p2 = phone();
      await api('POST', '/auth/send-otp', null, { phone: p2 });
      const stranger = (await api('POST', '/auth/verify-register', null, { phone: p2, code: OTP, full_name: 'E2E Stranger' })).data.tokens.accessToken;
      expect((await api('POST', '/reviews', stranger, { target_type: 'service', order_id: orderId, rating: 1 })).status).toBe(403);
    });

    it('an order not yet delivered cannot be reviewed; returned to the store it goes back to ready', async () => {
      const orderId = await placeOrder(1);
      expect((await api('POST', '/reviews', customer, { target_type: 'service', order_id: orderId, rating: 5 })).status).toBe(400);
      const task = await toReady(orderId);
      await api('PUT', `/rider/tasks/${task}/pickup`, rider.token, {});
      expect(await one(`select status from orders where id = $1`, [orderId])).toBe('out_for_delivery');
      // the rider is still on it → not yet
      expect((await api('POST', `/admin/orders/${orderId}/return-to-store`, owner, { reason: 'customer not home' }, H)).status).toBe(409);
      expect((await api('POST', `/rider/tasks/${task}/cancel`, rider.token, { reason: 'Customer not at home' })).status).toBe(200);
      const back = await api('POST', `/admin/orders/${orderId}/return-to-store`, owner, { reason: 'customer not home' }, H);
      expect(back.status).toBe(200);
      expect(await one(`select status from orders where id = $1`, [orderId])).toBe('ready_for_pickup');
      expect(await one(`select rider_id from orders where id = $1`, [orderId])).toBeNull();
      expect((await api('POST', `/admin/orders/${orderId}/return-to-store`, owner, { reason: 'again' }, H)).status).toBe(409);
    });

    it('cash received at the office marks the order paid and delivered — once', async () => {
      const orderId = await placeOrder(1);
      expect((await api('PUT', `/admin/orders/${orderId}/payment-received`, owner, { password: 'Admin12345', otp: OTP }, H)).status).toBe(200);
      const row = (await db.query(`select payment_status, status, paid_amount::float as paid, total_amount::float as total from orders where id = $1`, [orderId])).rows[0];
      expect(row).toMatchObject({ payment_status: 'completed', status: 'delivered' });
      expect(row.paid).toBe(row.total);
    });
  });

  describe('signed webhooks: order status and payment', () => {
    const crypto = require('crypto');
    const signed = async (url: string, body: Record<string, unknown>, key?: string, sig?: string) => {
      const raw = JSON.stringify(body);
      const res = await fetch(`${BASE}/api/webhooks${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-source': 'e2e',
          ...(sig !== '' ? { 'x-webhook-signature': sig ?? crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex') } : {}),
          ...(key ? { 'x-idempotency-key': key } : {}),
        },
        body: raw,
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
    };
    let orderId = '';

    beforeAll(async () => {
      orderId = await one(`select id from orders where status = 'pending' and payment_method = 'cash_on_delivery' and deleted_at is null order by created_at desc limit 1`);
    });

    it('no signature or a wrong one is refused', async () => {
      expect((await signed('/order-status', { order_id: orderId, status: 'confirmed' }, undefined, '')).status).toBe(401);
      expect((await signed('/order-status', { order_id: orderId, status: 'confirmed' }, undefined, 'ab'.repeat(32))).status).toBe(401);
    });

    it('a signed status update applies once; the same message again changes nothing', async () => {
      expect(orderId).toBeTruthy();
      expect((await signed('/order-status', { order_id: orderId, status: 'shipped' })).status).toBe(400);
      const key = `e2e-${Date.now()}`;
      expect((await signed('/order-status', { order_id: orderId, status: 'confirmed' }, key)).status).toBe(200);
      expect(await one(`select status from orders where id = $1`, [orderId])).toBe('confirmed');
      const again = await signed('/order-status', { order_id: orderId, status: 'confirmed' }, key);
      expect(again.status).toBe(200);
      expect(again.body?.data?.alreadyProcessed).toBe(true);
    });

    it('a payment is accepted only for the exact order total', async () => {
      const total = Number(await one(`select total_amount from orders where id = $1`, [orderId]));
      const base = { order_id: orderId, transaction_id: `tx-${Date.now()}`, status: 'completed' };
      expect((await signed('/payment', { ...base, amount: total + 50 })).status).toBe(409);
      expect((await signed('/payment', { ...base, transaction_id: `${base.transaction_id}-ok`, amount: total })).status).toBe(200);
      expect(await one(`select payment_status from orders where id = $1`, [orderId])).toBe('completed');
      expect(await one(`select count(*)::int from payments where order_id = $1`, [orderId])).toBe(1);
    });
  });

  describe('stock between the store and the collection points (OCPs)', () => {
    const tag = Math.floor(Math.random() * 1e6);
    let productId = '';
    let ocp1 = '';
    let ocp2 = '';
    const ocpQty = async (ocp: string) => Number(await one(`select coalesce(sum(quantity), 0) from ocp_stock where ocp_id = $1 and product_id = $2`, [ocp, productId]));
    const mkOcp = async (n: string) => (await api('POST', '/admin/ocp', owner, { name: `E2E OCP ${n} ${tag}`, phone: phone(), pin: '4826', city_id: cityId }, H)).data?.id;

    beforeAll(async () => {
      const cat = await one(`select id from categories order by created_at limit 1`);
      productId = await one(
        `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type)
         values ($1, $1, $2, $3, 200, 20, $4, true, 'kg') returning id`, [`E2E Stock ${tag}`, `e2e-stock-${tag}`, cat, cityId]);
      ocp1 = await mkOcp('A');
      ocp2 = await mkOcp('B');
      expect(ocp1 && ocp2).toBeTruthy();
    });

    afterAll(async () => {
      await db.query(`update products set is_active = false where id = $1`, [productId]);
    });

    it('send to an OCP (never more than the store has), move between OCPs, take back', async () => {
      const move = (url: string, body: Record<string, unknown>) => api('POST', `/admin/stock/${url}`, owner, { product_id: productId, quality: 'A', ...body }, H);
      expect((await move('shift', { ocp_id: ocp1, quantity: 25 })).status).toBe(400);
      expect((await move('shift', { ocp_id: ocp1, quantity: 8 })).status).toBe(200);
      expect(await ocpQty(ocp1)).toBe(8);
      expect((await move('shift', { ocp_id: ocp1, quantity: 13 })).status).toBe(400); // only 12 left at the store
      expect((await move('transfer', { from_ocp_id: ocp1, to_ocp_id: ocp1, quantity: 1 })).status).toBe(400);
      expect((await move('transfer', { from_ocp_id: ocp1, to_ocp_id: ocp2, quantity: 3 })).status).toBe(200);
      expect([await ocpQty(ocp1), await ocpQty(ocp2)]).toEqual([5, 3]);
      expect((await move('transfer', { from_ocp_id: ocp2, to_ocp_id: ocp1, quantity: 6 })).status).toBe(400);
      expect((await move('return', { ocp_id: ocp2, quantity: 2 })).status).toBe(200);
      expect(await ocpQty(ocp2)).toBe(1);
      // the store's own count never moved: OCP stock is part of it
      expect(Number(await one(`select stock_quantity from products where id = $1`, [productId]))).toBe(20);
    });

    it('a shelf count pressed 3 times at once adjusts the stock once (W24)', async () => {
      const before = Number(await one(`select stock_quantity from products where id = $1`, [productId]));
      const atOcp = Number(await one(`select coalesce(sum(quantity), 0) from ocp_stock where product_id = $1 and quality = 'A'`, [productId]));
      // the store's own shelf shows 2 more than the books (found extra)
      const counted = before - atOcp + 2;
      const rs = await Promise.all([1, 2, 3].map(() => api('POST', '/admin/stock/count', owner, { product_id: productId, quality: 'A', counted_quantity: counted, note: 'e2e count' }, H)));
      expect(rs.every((r) => r.status === 200)).toBe(true);
      expect(Number(await one(`select stock_quantity from products where id = $1`, [productId]))).toBe(before + 2);
      expect(rs.filter((r) => Math.abs(Number(r.data?.variance)) > 0).length).toBe(1);
    });

    it('quality conversions pressed at once never move more than there is (W24)', async () => {
      // Past the day's Rs 5,000 of unapproved changes a second admin's one-time
      // code is needed (J1 / Q7) — made on the approver's own device.
      const bcrypt = require(path.join(BM, 'bcryptjs'));
      const apPhone = phone();
      const apRole = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`E2E Approver ${Date.now()}`, cityId]);
      await db.query(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions`, [apRole]);
      const apId = await one(`insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ($1, 'E2E Approver', 'admin', $2, $3, true) returning id`,
        [`+92${apPhone.slice(1)}`, bcrypt.hashSync('Approve123', 4), apRole]);
      await db.query(`insert into admins (user_id) values ($1)`, [apId]);
      let ap = await api('POST', '/admin/login', null, { phone: apPhone, password: 'Approve123' });
      if (ap.data?.requires_otp) ap = await api('POST', '/admin/login', null, { phone: apPhone, password: 'Approve123', otp: OTP });
      const code = (await api('POST', '/admin/approval-codes', ap.data.tokens.accessToken, {})).data?.code;
      expect(code).toBeTruthy();
      const approval = { approval_phone: apPhone, approval_password: code };
      const a = Number(await one(`select stock_quantity - coalesce(reserved_quantity, 0) from products where id = $1`, [productId]));
      const atOcp = Number(await one(`select coalesce(sum(quantity), 0) from ocp_stock where product_id = $1 and quality = 'A'`, [productId]));
      const movable = a - atOcp;
      const each = Math.floor(movable / 2) + 1; // two of these together are more than movable
      const rs = await Promise.all([1, 2, 3].map((n) => api('POST', '/admin/stock/convert', owner, { product_id: productId, from_quality: 'A', to_quality: 'B', quantity: each, note: `e2e convert ${n}`, ...approval }, H)));
      const ok = rs.filter((r) => r.status === 200).length;
      expect(ok).toBe(1);
      expect(Number(await one(`select stock_quantity from products where id = $1`, [productId]))).toBeGreaterThanOrEqual(atOcp);
      expect(Number(await one(`select coalesce(stock_quantity_b, 0) from products where id = $1`, [productId]))).toBe(each);
    });

    it('five transfers out of one OCP at the same moment never take more than it holds', async () => {
      const amounts = [1, 2, 3, 4, 5];
      const rs = await Promise.all(amounts.map((q) => api('POST', '/admin/stock/transfer', owner, { product_id: productId, quality: 'A', from_ocp_id: ocp1, to_ocp_id: ocp2, quantity: q }, H)));
      const moved = amounts.filter((_, i) => rs[i].status === 200).reduce((a, b) => a + b, 0);
      expect(moved).toBeLessThanOrEqual(5);
      expect(await ocpQty(ocp1)).toBe(5 - moved);
      expect(await ocpQty(ocp2)).toBe(1 + moved);
    });
  });

  describe('riders and delivery zones (office side)', () => {
    const tag = String(Math.floor(1000000 + Math.random() * 8999999));
    let riderId = '';

    it('a rider needs every required detail and a real CNIC; then can sign in', async () => {
      const riderPhone = phone();
      const base = { full_name: 'E2E Office Rider', phone: riderPhone, password: 'rider123', vehicle_type: 'bike', vehicle_number: `E2E-${tag.slice(0, 4)}` };
      expect((await api('POST', '/admin/riders', owner, base, H)).status).toBe(400);
      expect((await api('POST', '/admin/riders', owner, { ...base, cnic: '12345' }, H)).status).toBe(400);
      const made = await api('POST', '/admin/riders', owner, { ...base, cnic: `35202-${tag}-1` }, H);
      expect(made.status).toBeLessThan(300);
      riderId = made.data?.id || made.data?.rider?.id;
      expect(riderId).toBeTruthy();
      const login = await api('POST', '/rider/login', null, { phone: riderPhone, password: 'rider123' });
      expect(login.status).toBe(200);
    });

    it('rider details and per-order pay are saved; a negative pay is refused', async () => {
      expect((await api('PUT', `/admin/riders/${riderId}`, owner, { vehicle_number: `E2E-NEW-${tag.slice(0, 3)}` }, H)).status).toBe(200);
      expect(await one(`select vehicle_number from riders where id = $1`, [riderId])).toBe(`E2E-NEW-${tag.slice(0, 3)}`);
      expect((await api('PUT', `/admin/riders/${riderId}/delivery-charges`, owner, { charges: [], urgent_charge: -5 }, H)).status).toBe(400);
      const slot = await one(`select id from time_slots order by created_at desc limit 1`);
      const saved = await api('PUT', `/admin/riders/${riderId}/delivery-charges`, owner, { charges: [{ time_slot_id: slot, charge_per_order: 60 }], urgent_charge: 90 }, H);
      expect(saved.status).toBe(200);
      expect(Number(saved.data?.urgent_delivery_charge)).toBe(90);
      expect(Number(await one(`select charge_per_order from rider_delivery_charges where rider_id = $1 and time_slot_id = $2 order by created_at desc limit 1`, [riderId, slot]))).toBe(60);
    });

    it('a delivery zone is created, switched off, and deleted', async () => {
      expect((await api('POST', '/admin/delivery-zones', owner, { name: 'No code' }, H)).status).toBe(400);
      const zone = await api('POST', '/admin/delivery-zones', owner, { name: `E2E Zone ${tag}`, code: `E2E${tag}`, cities: ['Gujrat'], areas: ['Model Town'], standard_delivery_charge: 80, minimum_order_value: 300 }, H);
      expect(zone.status).toBeLessThan(300);
      const id = zone.data?.id;
      expect((await api('PUT', `/admin/delivery-zones/${id}/toggle`, owner, undefined, H)).status).toBe(200);
      expect(await one(`select is_active from delivery_zones where id = $1`, [id])).toBe(false);
      expect((await api('DELETE', `/admin/delivery-zones/${id}`, owner, undefined, H)).status).toBe(200);
      expect(await one(`select count(*)::int from delivery_zones where id = $1`, [id])).toBe(0);
    });
  });

  describe('office settings: AI chat, atta charges, staff accounts, OTP sign-in', () => {
    it('the super admin can switch the support chat off and on; an unknown AI company is refused (G33)', async () => {
      const before = (await api('GET', '/admin/settings/ai-chat', owner)).data;
      try {
        expect((await api('PUT', '/admin/settings/ai-chat', owner, { provider: 'nobody-ai' })).status).toBe(400);
        expect((await api('GET', '/admin/settings/ai-chat', owner)).data?.provider).toBe(before?.provider);
        expect((await api('PUT', '/admin/settings/ai-chat', owner, { disabled: true })).status).toBe(200);
        expect((await api('GET', '/ai-chat/status')).data?.enabled).toBe(false);
      } finally {
        await api('PUT', '/admin/settings/ai-chat', owner, { disabled: Boolean(before?.disabled), ...(before?.provider ? { provider: before.provider } : {}) });
      }
      expect(Boolean((await api('GET', '/admin/settings/ai-chat', owner)).data?.disabled)).toBe(Boolean(before?.disabled));
    });

    it("atta charges for this city are saved and read back; nothing to save is refused", async () => {
      const before = (await api('GET', '/admin/settings/atta-charges', owner, undefined, H)).data || {};
      try {
        expect((await api('PUT', '/admin/settings/atta-charges', owner, {}, H)).status).toBe(422);
        expect((await api('PUT', '/admin/settings/atta-charges', owner, { milling_charge_per_kg: 7, free_delivery_threshold_kg: 25 }, H)).status).toBe(200);
        const now = (await api('GET', '/admin/settings/atta-charges', owner, undefined, H)).data;
        expect(JSON.stringify(now)).toMatch(/"?milling_charge_per_kg"?:\s*"?7/);
      } finally {
        const restore: Record<string, number> = {};
        for (const k of ['service_charge', 'milling_charge_per_kg', 'delivery_charge', 'free_delivery_threshold_kg']) {
          if (before[k] !== undefined && before[k] !== null) restore[k] = Number(before[k]);
        }
        if (Object.keys(restore).length) await api('PUT', '/admin/settings/atta-charges', owner, restore, H);
      }
    });

    it("a staff member's name and role are changed by the owner", async () => {
      const mkRole = async (n: string) => (await api('POST', '/admin/roles', owner, { name: `E2E ${n} ${Date.now()}`, city_id: cityId, permissions: ['orders.view'] })).data?.id;
      const r1 = await mkRole('Desk');
      const r2 = await mkRole('Store');
      const staff = await api('POST', '/admin/roles/users', owner, { phone: phone(), password: 'Staff12345', full_name: 'E2E Desk Staff', role_id: r1 });
      const userId = staff.data?.id || staff.data?.user?.id;
      expect(userId).toBeTruthy();
      expect((await api('PUT', `/admin/roles/users/${userId}`, owner, { full_name: 'E2E Desk Staff Two' })).status).toBe(200);
      expect(await one(`select full_name from users where id = $1`, [userId])).toBe('E2E Desk Staff Two');
      expect((await api('PUT', `/admin/roles/assign/${userId}`, owner, { role_id: r2 })).status).toBe(200);
      expect(await one(`select admin_role_id from users where id = $1`, [userId])).toBe(r2);
    });

    it('a customer signs in with the one-time code; a wrong code does not', async () => {
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Code Login' });
      expect((await api('POST', '/auth/verify-login', null, { phone: p, code: '000000' })).status).toBeGreaterThanOrEqual(400);
      const ok = await api('POST', '/auth/verify-login', null, { phone: p, code: OTP });
      expect(ok.status).toBe(200);
      expect(ok.data?.tokens?.accessToken).toBeTruthy();
    });
  });

  describe('wishlist kept with the account (W22)', () => {
    const tag = Math.floor(Math.random() * 1e6);
    let token = '';
    let p1 = '';
    let p2 = '';
    let off = '';

    beforeAll(async () => {
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      token = (await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Wishes' })).data.tokens.accessToken;
      const cat = await one(`select id from categories order by created_at limit 1`);
      const mk = (n: string, active = true) => one(
        `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type)
         values ($1, $1, $2, $3, 150, 10, $4, $5, 'kg') returning id`, [`E2E Wish ${n} ${tag}`, `e2e-wish-${n}-${tag}`, cat, cityId, active]);
      p1 = await mk('a');
      p2 = await mk('b');
      off = await mk('off', false);
    });

    afterAll(async () => {
      await db.query(`update products set is_active = false where id = any($1::uuid[])`, [[p1, p2]]);
    });

    const ids = async (t = token) => ((await api('GET', '/wishlist', t)).data?.product_ids || []) as string[];

    it('signed out: no wishlist; signed in: empty to start', async () => {
      expect((await api('GET', '/wishlist')).status).toBe(401);
      expect(await ids()).toEqual([]);
    });

    it('add and remove one at a time; adding twice keeps one; a switched-off or unknown product is refused', async () => {
      expect((await api('POST', `/wishlist/${p1}`, token)).status).toBe(200);
      expect((await api('POST', `/wishlist/${p1}`, token)).status).toBe(200);
      expect(await ids()).toEqual([p1]);
      expect((await api('POST', `/wishlist/${off}`, token)).status).toBe(404);
      expect((await api('POST', '/wishlist/00000000-0000-4000-8000-000000000000', token)).status).toBe(404);
      expect((await api('POST', '/wishlist/not-a-uuid', token)).status).toBe(400);
      expect((await api('DELETE', `/wishlist/${p1}`, token)).status).toBe(200);
      expect(await ids()).toEqual([]);
    });

    it("signing in on a device joins its list to the account's (nothing lost, nothing doubled)", async () => {
      await api('POST', `/wishlist/${p1}`, token);
      const merged = await api('POST', '/wishlist/merge', token, { product_ids: [p2, p1, off, 'junk'] });
      expect(merged.status).toBe(200);
      expect([...merged.data.product_ids].sort()).toEqual([p1, p2].sort());
      expect([...(await ids())].sort()).toEqual([p1, p2].sort());
    });

    it('a product removed on one device does not come back; another customer never sees mine', async () => {
      expect((await api('DELETE', `/wishlist/${p2}`, token)).status).toBe(200);
      expect(await ids()).toEqual([p1]);
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      const other = (await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Other Wishes' })).data.tokens.accessToken;
      expect(await ids(other)).toEqual([]);
      expect((await api('DELETE', `/wishlist/${p1}`, other)).status).toBe(200); // nothing of mine to remove
      expect(await ids()).toEqual([p1]);
    });

    it('deleting the account removes its wishlist', async () => {
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      const t = (await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Leaving' })).data.tokens.accessToken;
      await api('POST', `/wishlist/${p2}`, t);
      const userId = await one(`select user_id from wishlist_items where product_id = $1 order by created_at desc limit 1`, [p2]);
      expect((await api('POST', '/auth/delete-account', t, {})).status).toBe(200);
      expect(await one(`select count(*)::int from wishlist_items where user_id = $1`, [userId])).toBe(0);
    });

    it('a product switched off later drops out of the list', async () => {
      await db.query(`update products set is_active = false where id = $1`, [p1]);
      expect(await ids()).toEqual([]);
      await db.query(`update products set is_active = true where id = $1`, [p1]);
    });
  });

  describe('finance input (W24, G36)', () => {
    it('an expense: a huge number gets a clear 400 (was a 500), 0 is refused, a real one saves once', async () => {
      const big = await api('POST', '/finance/expenses', owner, { category: 'E2E Fuel', amount: 1e12, password: 'Admin12345', otp: OTP }, H);
      expect(big.status).toBe(400);
      expect(big.body.message).toMatch(/too large/i);
      expect((await api('POST', '/finance/expenses', owner, { category: 'E2E Fuel', amount: 0 }, H)).status).toBe(400);
      const note = `e2e fuel ${Date.now()}`;
      const rs = await Promise.all([1, 2, 3].map(() => api('POST', '/finance/expenses', owner, { category: 'E2E Fuel', amount: 250, comment: note, password: 'Admin12345', otp: OTP }, H)));
      expect(rs.filter((r) => r.status === 200 || r.status === 201).length).toBe(1);
      expect(await one(`select count(*)::int from expenses where comment = $1`, [note])).toBe(1);
    });

    it('a worker with a huge salary gets a clear 400', async () => {
      const w = await api('POST', '/finance/workers', owner, { name: 'E2E Big Salary', basic_salary: 1e13, designation: 'helper' }, H);
      expect(w.status).toBe(400);
      expect(w.body.message).toMatch(/too large/i);
    });
  });

  describe('the permission map (W24): a staff member with only "orders.view"', () => {
    let staff = '';

    beforeAll(async () => {
      const role = (await api('POST', '/admin/roles', owner, { name: `E2E Only View ${Date.now()}`, city_id: cityId, permissions: ['orders.view'] })).data?.id;
      const staffPhone = phone();
      await api('POST', '/admin/roles/users', owner, { phone: staffPhone, password: 'Staff12345', full_name: 'E2E Viewer Only', role_id: role });
      let s = await api('POST', '/admin/login', null, { phone: staffPhone, password: 'Staff12345' });
      if (s.data?.requires_otp) s = await api('POST', '/admin/login', null, { phone: staffPhone, password: 'Staff12345', otp: OTP });
      staff = s.data.tokens.accessToken;
    });

    it('cannot change anything anywhere in the office API (no write succeeds, nothing crashes)', async () => {
      const { listExpressRoutes } = await import('../../src/config/openapiRoutes');
      const app = (await import('../../src/app')).default;
      const NIL = '00000000-0000-4000-8000-000000000000';
      const writes = listExpressRoutes(app as any)
        .filter((r: any) => r.method !== 'GET' && /^\/api\/(admin|finance)\//.test(r.path))
        // signing in / out and asking for one's own approval code are not office writes
        .filter((r: any) => !/\/admin\/(login|logout|refresh|verify-otp|me|change-password|approval-codes?)(\/|$)/.test(r.path));
      expect(writes.length).toBeGreaterThan(80);
      const succeeded: string[] = [];
      const crashed: string[] = [];
      for (const r of writes) {
        const url = r.path.replace(/^\/api/, '').replace(/:[A-Za-z]+/g, NIL);
        const res = await api(r.method, url, staff, {}, H);
        if (res.status >= 200 && res.status < 300) succeeded.push(`${r.method} ${r.path} → ${res.status}`);
        if (res.status >= 500) crashed.push(`${r.method} ${r.path} → ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
      }
      // eslint-disable-next-line no-console
      console.log(`permission map: ${writes.length} office write routes tried as a view-only staff member`);
      expect(crashed).toEqual([]);
      expect(succeeded).toEqual([]);
    });

    it('reads: only what "orders.view" allows (the list is printed for review)', async () => {
      const { listExpressRoutes } = await import('../../src/config/openapiRoutes');
      const app = (await import('../../src/app')).default;
      const NIL = '00000000-0000-4000-8000-000000000000';
      const reads = listExpressRoutes(app as any).filter((r: any) => r.method === 'GET' && /^\/api\/(admin|finance)\//.test(r.path) && !/\/export$/.test(r.path));
      const open: string[] = [];
      for (const r of reads) {
        const res = await api('GET', r.path.replace(/^\/api/, '').replace(/:[A-Za-z]+/g, NIL), staff, undefined, H);
        expect(res.status).toBeLessThan(500);
        if (res.status === 200) open.push(r.path);
      }
      // eslint-disable-next-line no-console
      console.log(`READS OPEN TO orders.view ONLY (${open.length}/${reads.length}):\n${open.join('\n')}`);
      expect(open.some((p) => p === '/api/admin/orders')).toBe(true);
      // money, people and settings stay closed
      for (const closed of ['/api/finance/profit', '/api/finance/expenses', '/api/admin/roles/users', '/api/admin/customers', '/api/admin/settings/ai-chat']) {
        expect(open).not.toContain(closed);
      }
    });
  });

  describe('round B (W25): hostile input on every write route', () => {
    it('no write route answers with a server error — as the owner and as a customer', async () => {
      const { listExpressRoutes } = await import('../../src/config/openapiRoutes');
      const app = (await import('../../src/app')).default;
      const NIL = '00000000-0000-4000-8000-000000000000';
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      const customer = (await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Fuzz' })).data.tokens.accessToken;
      const routes = listExpressRoutes(app as any)
        .filter((r: any) => r.method !== 'GET' && r.path.startsWith('/api/'))
        // these act on the caller's own session — fuzzing them would sign the fuzzer out
        .filter((r: any) => !/\/(logout|delete-account|webhooks)\b/.test(r.path));
      const big = 'x'.repeat(20000);
      const fields = ['amount', 'price', 'quantity', 'name', 'name_en', 'phone', 'status', 'city_id', 'product_id', 'items', 'note', 'pin', 'password', 'code', 'reason', 'rating', 'comment'];
      const bodies: Record<string, unknown>[] = [
        {},
        Object.fromEntries(fields.map((f) => [f, 1e15])),
        Object.fromEntries(fields.map((f) => [f, -1])),
        Object.fromEntries(fields.map((f) => [f, 'abc'])),
        Object.fromEntries(fields.map((f) => [f, big])),
        Object.fromEntries(fields.map((f) => [f, "' OR 1=1 --\u0000<script>"])),
        Object.fromEntries(fields.map((f) => [f, { $gt: '' }])),
        Object.fromEntries(fields.map((f) => [f, [1, 'a', null]])),
      ];
      const crashes: string[] = [];
      let calls = 0;
      for (const r of routes) {
        const url = r.path.replace(/^\/api/, '').replace(/:[A-Za-z]+/g, NIL);
        for (const [who, token, headers] of [['owner', owner, H], ['customer', customer, {}]] as const) {
          for (const body of bodies) {
            const res = await api(r.method, url, token, body, headers as Record<string, string>);
            calls++;
            // 503 = a service switched off on purpose (AI chat without a key) — not a crash
            if (res.status >= 500 && res.status !== 503) crashes.push(`${who} ${r.method} ${r.path} ${JSON.stringify(body).slice(0, 60)} → ${res.status} ${String(res.body?.message || '').slice(0, 80)}`);
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log(`fuzz: ${routes.length} write routes, ${calls} calls, ${crashes.length} server error(s)${crashes.length ? `\n${crashes.slice(0, 40).join('\n')}` : ''}`);
      expect(crashes).toEqual([]);
    });
  });

  describe('round B (W25): hostile query strings on every read route', () => {
    it('no read route answers with a server error — as the owner and as a customer', async () => {
      const { listExpressRoutes } = await import('../../src/config/openapiRoutes');
      const app = (await import('../../src/app')).default;
      const NIL = '00000000-0000-4000-8000-000000000000';
      const p = phone();
      await api('POST', '/auth/send-otp', null, { phone: p });
      const customer = (await api('POST', '/auth/verify-register', null, { phone: p, code: OTP, full_name: 'E2E Query Fuzz' })).data.tokens.accessToken;
      const routes = listExpressRoutes(app as any).filter((r: any) => r.method === 'GET' && r.path.startsWith('/api/') && !/\/export$|\/docs|\/stream/.test(r.path));
      const queries = [
        'limit=1000000000000&page=-5&offset=-1',
        "sort=';drop table orders;--&order=sideways&sortBy=__proto__",
        'search=%00%27%22%3Cscript%3E&q=' + 'x'.repeat(5000),
        'from=2026-99-99&to=yesterday&date=31/31/2026&month=13&year=-1&period=forever',
        'city_id=abc&category=not-a-uuid&ids=a,b,%00&status=%25',
      ];
      const crashes: string[] = [];
      let calls = 0;
      for (const r of routes) {
        const path = r.path.replace(/^\/api/, '').replace(/:[A-Za-z]+/g, NIL);
        for (const [who, token, headers] of [['owner', owner, H], ['customer', customer, {}]] as const) {
          for (const q of queries) {
            const res = await api('GET', `${path}?${q}`, token, undefined, headers as Record<string, string>);
            calls++;
            if (res.status >= 500 && res.status !== 503) crashes.push(`${who} GET ${r.path}?${q.slice(0, 40)} → ${res.status} ${String(res.body?.message || '').slice(0, 80)}`);
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log(`query fuzz: ${routes.length} read routes, ${calls} calls, ${crashes.length} server error(s)${crashes.length ? `\n${crashes.slice(0, 40).join('\n')}` : ''}`);
      expect(crashes).toEqual([]);
    });
  });

  describe('AI Audit without AI', () => {
    it('a run over the last month finishes with the fixed-rule figures only', async () => {
      const to = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
      const from = new Date(Date.now() + 5 * 3600 * 1000 - 29 * 86400000).toISOString().slice(0, 10);
      expect((await api('POST', '/admin/corruption-audit/run', owner, { from: to, to: from, use_ai: false })).status).toBe(400);
      const started = await api('POST', '/admin/corruption-audit/run', owner, { from, to, use_ai: false });
      expect(started.status).toBe(200);
      const id = started.data.id;
      let status = 'running';
      for (let i = 0; i < 240 && status === 'running'; i++) {
        await new Promise((r) => setTimeout(r, 500));
        status = await one(`select status from corruption_audit_runs where id = $1`, [id]);
      }
      expect(status).toBe('done');
      const run = (await db.query(`select ai_used, evidence, result from corruption_audit_runs where id = $1`, [id])).rows[0];
      expect(run.ai_used).toBe(false);
      expect(Array.isArray(run.evidence?.signals)).toBe(true);
      expect(JSON.stringify(run.result)).toContain('without AI');
    });
  });
});
