#!/usr/bin/env node
/* eslint-disable no-console */
// ============================================================================
// Round 6 (16–17 Nov 2026) — the checks that came out CLEAN, kept so they stay
// clean: the same press twice / at the same moment on every money and stock
// path, another rider's task, coupons, and a city-B admin against every
// city-A write and read. (The round-6 BUGS have their own checks in
// regressions-2026-11.js, next to the other fixed bugs.)
//
//   JWT_SECRET=<same as the API> node docs/rider-e2e/regressions-round6.js
// Also importable: require(...).run({ api, databaseUrl, jwtSecret }) — the
// backend's real-database jest suite runs it in-process.
// ============================================================================
const path = require('path');
const BM = path.join(__dirname, '..', '..', 'backend', 'node_modules');
const { Client } = require(path.join(BM, 'pg'));
const bcrypt = require(path.join(BM, 'bcryptjs'));
const jwt = require(path.join(BM, 'jsonwebtoken'));

let API = process.env.API_URL || 'http://localhost:3999/api';
let DB = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:55432/fb';
let JWT_SECRET = process.env.JWT_SECRET;
const OTP = process.env.OTP_BYPASS_CODE || '123789';
// Its own phone range (03xx 33–49) so it never collides with the main script.
const rnd7 = () => String(Math.floor(1000000 + Math.random() * 8999999));
const TAG = rnd7();

let db = new Client({ connectionString: DB });
const sql = async (text, params = []) => (await db.query(text, params)).rows;
const one = async (text, params = []) => { const r = await sql(text, params); return r[0] ? Object.values(r[0])[0] : null; };

async function call(method, urlPath, token, body, headers = {}) {
  const res = await fetch(API + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json, data: json?.data, message: json?.message };
}

let pass = 0; let fail = 0;
function check(label, got, want) {
  const ok = String(got) === String(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` — expected [${want}] got [${got}]`}`);
  if (ok) pass++; else fail++;
}

async function adminLogin(phone, password) {
  let r = await call('POST', '/admin/login', null, { phone, password });
  if (r.data?.requires_otp) r = await call('POST', '/admin/login', null, { phone, password, otp: OTP });
  if (!r.data?.tokens?.accessToken) throw new Error(`admin login failed for ${phone}: ${JSON.stringify(r.body)}`);
  return r.data.tokens.accessToken;
}

async function run(opts = {}) {
  if (opts.api) API = opts.api;
  if (opts.jwtSecret) JWT_SECRET = opts.jwtSecret;
  if (opts.databaseUrl && opts.databaseUrl !== DB) { DB = opts.databaseUrl; db = new Client({ connectionString: DB }); }
  pass = 0; fail = 0;
  await db.connect();
  if (!JWT_SECRET) {
    console.log('SKIP round-6 checks — JWT_SECRET is not exported, cannot sign customer tokens');
    await db.end();
    return { pass, fail };
  }

  const A = await adminLogin('03001112222', 'Admin12345');
  const city = await one(`select id from service_cities where name = 'Gujrat' limit 1`);
  const H = { 'X-City-Id': city };
  const cat = (await one(`select id from categories where city_id = $1 order by name_en limit 1`, [city])) ?? (await one(`select id from categories order by name_en limit 1`));
  const tomorrow = new Date(Date.now() + 29 * 3600 * 1000).toISOString().slice(0, 10); // Pakistan date + 1
  let phoneSeq = 33;
  const nextPhone = () => `03${phoneSeq++}${rnd7()}`; // 03 33..49 + 7 digits

  const makeCustomer = async (cityName = 'Gujrat') => {
    const phone = `+92${nextPhone().slice(1)}`;
    const id = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'R6 Customer', 'customer', true) returning id`, [phone]);
    const addr = await one(`insert into addresses (user_id, written_address, city) values ($1, 'R6 house', $2) returning id`, [id, cityName]);
    return { id, phone, addr, token: jwt.sign({ userId: id, phone, role: 'customer' }, JWT_SECRET, { expiresIn: '30m' }) };
  };
  const makeAdmin = async (label, cityId) => {
    const phone = nextPhone();
    const role = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`${label} ${TAG}${phone.slice(-4)}`, cityId]);
    await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions`, [role]);
    const id = await one(`insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ($1, $2, 'admin', $3, $4, true) returning id`,
      [`+92${phone.slice(1)}`, label, bcrypt.hashSync('Manager123', 4), role]);
    await sql(`insert into admins (user_id) values ($1)`, [id]);
    return { id, token: await adminLogin(phone, 'Manager123') };
  };
  const product = (name, stock) => one(
    `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type)
     values ($1, $1, $2, $3, 1000, $4, $5, true, 'kg') returning id`,
    [`${name}${TAG}`, `${name.toLowerCase()}-${TAG}-${rnd7()}`, cat, stock, city]);
  const slot = (max) => one(`insert into time_slots (slot_name, start_time, end_time, status, max_orders) values ($1, '00:00', '23:59', 'available', $2) returning id`, [`R6 ${TAG} ${rnd7()}`, max]);
  const stock = async (id) => (await sql(`select stock_quantity::float as s, reserved_quantity::float as r from products where id = $1`, [id]))[0];
  const checkout = (c, s) => call('POST', '/orders', c.token, { address_id: c.addr, city_id: city, time_slot_id: s, requested_delivery_date: tomorrow, payment_method: 'cash_on_delivery' });
  const addToCart = (c, p, qty) => call('POST', '/cart/add', c.token, { product_id: p, quantity: qty, unit: 'full', city_id: city });
  const orderIdOf = (r) => r.data?.id || r.data?.order?.id || null;
  const statuses = (rs) => rs.map((x) => x.status).join(',');
  const wide = await slot(500);

  // ── The same press at the same moment: once ──────────────────────────────────
  {
    const c = await makeCustomer();
    const p = await product('R6Dbl', 100);
    await addToCart(c, p, 2);
    const rs = await Promise.all([1, 2, 3, 4].map(() => checkout(c, wide)));
    check(`checkout pressed 4 times at once → one order (${statuses(rs)})`, `${await one(`select count(*) from orders where user_id = $1`, [c.id])}/${(await stock(p)).r}`, '1/2');
  }
  {
    const p = await product('R6Last', 3);
    const cs = [];
    for (let i = 0; i < 6; i++) { const c = await makeCustomer(); await addToCart(c, p, 1); cs.push(c); }
    const rs = await Promise.all(cs.map((c) => checkout(c, wide)));
    check('the last 3 units, 6 buyers at once → 3 orders, never more stock promised than there is', `${rs.filter((x) => x.status === 201).length}/${(await stock(p)).r}`, '3/3');
  }
  {
    const s2 = await slot(2);
    const p = await product('R6Slot', 100);
    const cs = [];
    for (let i = 0; i < 6; i++) { const c = await makeCustomer(); await addToCart(c, p, 1); cs.push(c); }
    const rs = await Promise.all(cs.map((c) => checkout(c, s2)));
    check('a slot for 2 orders, 6 buyers at once → 2', rs.filter((x) => x.status === 201).length, 2);
  }
  {
    const code = `R6ONE${TAG}`;
    await call('POST', '/admin/coupons', A, { code, discount_type: 'fixed', discount_value: 100, usage_limit: 1 }, H);
    const p = await product('R6Coup', 100);
    const cs = [];
    for (let i = 0; i < 5; i++) { const c = await makeCustomer(); await addToCart(c, p, 1); await call('POST', '/cart/apply-coupon', c.token, { code, city_id: city }); cs.push(c); }
    await Promise.all(cs.map((c) => checkout(c, wide)));
    check('a single-use coupon, 5 buyers at once → used once', Number(await one(`select count(*) from orders where coupon_code = $1 and coalesce(coupon_discount, 0) > 0`, [code])), 1);
  }
  {
    const c = await makeCustomer();
    const p = await product('R6Cancel', 50);
    await addToCart(c, p, 4);
    const o = orderIdOf(await checkout(c, wide));
    await Promise.all([1, 2, 3, 4, 5].map(() => call('PUT', `/orders/${o}/cancel`, c.token, { reason: 'changed my mind' })));
    const st = await stock(p);
    check('customer cancel pressed 5 times at once → stock released once', `${st.s}/${st.r}`, '50/0');
  }
  {
    const c = await makeCustomer();
    const p = await product('R6Both', 50);
    await addToCart(c, p, 4);
    const o = orderIdOf(await checkout(c, wide));
    await Promise.all([
      call('PUT', `/orders/${o}/cancel`, c.token, { reason: 'x' }), call('PUT', `/admin/orders/${o}/status`, A, { status: 'cancelled', reason: 'r6' }, H),
      call('PUT', `/orders/${o}/cancel`, c.token, { reason: 'x' }), call('PUT', `/admin/orders/${o}/status`, A, { status: 'cancelled', reason: 'r6' }, H),
    ]);
    const st = await stock(p);
    check('customer and office cancel at the same moment → stock released once', `${st.s}/${st.r}`, '50/0');
  }
  {
    const c = await makeCustomer();
    const p = await product('R6Deliv', 50);
    await addToCart(c, p, 4);
    const o = orderIdOf(await checkout(c, wide));
    for (const s of ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery']) await call('PUT', `/admin/orders/${o}/status`, A, { status: s }, H);
    await Promise.all([1, 2, 3, 4, 5].map(() => call('PUT', `/admin/orders/${o}/status`, A, { status: 'delivered' }, H)));
    const st = await stock(p);
    check('office "delivered" pressed 5 times at once → stock taken once', `${st.s}/${st.r}`, '46/0');
  }
  {
    const c = await makeCustomer();
    const p = await product('R6Out', 50);
    await addToCart(c, p, 2);
    const o = orderIdOf(await checkout(c, wide));
    for (const s of ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery']) await call('PUT', `/admin/orders/${o}/status`, A, { status: s }, H);
    check('the customer cannot cancel once the rider is on the way', (await call('PUT', `/orders/${o}/cancel`, c.token, { reason: 'x' })).status, 409);
  }

  // ── Riders: someone else's task; delivered / cash pressed many times ─────────
  {
    const mkRider = async () => {
      const phone = nextPhone();
      const user = await one(`insert into users (phone, full_name, role, is_phone_verified, password_hash) values ($1, 'R6 Rider', 'rider', true, $2) returning id`,
        [`+92${phone.slice(1)}`, bcrypt.hashSync('rider123', 4)]);
      const id = await one(`insert into riders (user_id, cnic, vehicle_type, vehicle_number, status, verification_status, city_id) values ($1, $2, 'bike', $3, 'available', 'verified', $4) returning id`,
        [user, `3520${rnd7()}${rnd7().slice(0, 2)}`, `R6-${rnd7().slice(0, 4)}`, city]);
      const login = await call('POST', '/rider/login', null, { phone, password: 'rider123' });
      return { id, token: login.data?.tokens?.accessToken || login.data?.token || login.data?.accessToken };
    };
    const r1 = await mkRider();
    const r2 = await mkRider();
    const c = await makeCustomer();
    const p = await product('R6RD', 50);
    await addToCart(c, p, 4);
    const o = orderIdOf(await checkout(c, wide));
    for (const s of ['confirmed', 'preparing', 'ready_for_pickup']) await call('PUT', `/admin/orders/${o}/status`, A, { status: s }, H);
    await call('PUT', `/admin/orders/${o}/assign-rider`, A, { rider_id: r1.id }, H);
    const task = (await call('GET', '/rider/tasks/active', r1.token)).data?.[0]?.id;
    await call('PUT', `/rider/tasks/${task}/pickup`, r1.token, {});
    const others = [];
    for (const [m, p2, body] of [
      ['GET', `/rider/tasks/${task}`], ['PUT', `/rider/tasks/${task}/pickup`, {}], ['PUT', `/rider/tasks/${task}/deliver`, { notes: 'r6' }],
      ['POST', `/rider/tasks/${task}/cancel`, { reason: 'r6' }], ['POST', `/rider/tasks/${task}/arrived`, {}],
      ['PUT', `/rider/tasks/${task}/pin-location`, { latitude: 32.5, longitude: 74.0 }], ['POST', '/rider/call-request', { order_id: o }],
      ['GET', `/chat/${o}`], ['POST', `/chat/${o}`, { message: 'r6' }],
    ]) others.push((await call(m, p2, r2.token, body)).status);
    check('another rider cannot touch my task (9 ways in)', others.filter((s) => s >= 200 && s < 300).length, 0);
    check('…and my task is untouched', await one(`select status from rider_tasks where id = $1`, [task]), 'in_progress');
    await Promise.all([1, 2, 3, 4, 5].map(() => call('PUT', `/rider/tasks/${task}/deliver`, r1.token, { notes: 'r6' })));
    const st = await stock(p);
    check('rider "delivered" pressed 5 times at once → stock taken once, one delivery counted',
      `${st.s}/${st.r}/${await one(`select total_deliveries from riders where id = $1`, [r1.id])}`, '46/0/1');
    check('…a delivered task cannot be delivered or reported again', `${(await call('PUT', `/rider/tasks/${task}/deliver`, r1.token, {})).status}/${(await call('POST', `/rider/tasks/${task}/cancel`, r1.token, { reason: 'late' })).status}`, '409/409');
    await Promise.all([1, 2, 3, 4].map(() => call('POST', `/admin/riders/${r1.id}/cash-settlements/receive`, A, { password: 'Admin12345', otp: OTP }, H)));
    check('office "cash received" pressed 4 times at once → one hand-over for the order\'s amount',
      await one(`select count(*)::text || '/' || coalesce(sum(amount), 0)::int::text from rider_cash_settlements where rider_id = $1`, [r1.id]), '1/4000');
  }

  // ── OCP: receive stock / office receives cash — pressed many times ───────────
  {
    const ocpPhone = nextPhone();
    const ocp = (await call('POST', '/admin/ocp', A, { name: `R6 OCP ${TAG}`, phone: ocpPhone, pin: '4826', city_id: city }, H)).data?.id;
    const OT = (await call('POST', '/ocp/login', null, { phone: ocpPhone, pin: '4826' })).data?.token;
    const p = await product('R6OC', 50);
    const req = (await call('POST', `/admin/ocp/${ocp}/stock-requests`, A, { items: [{ product_id: p, quality: 'A', quantity: 5 }] }, H)).data?.id;
    await Promise.all([1, 2, 3].map(() => call('POST', `/ocp/stock-requests/${req}/receive`, OT, {})));
    check('OCP "receive stock" pressed 3 times at once → received once', Number(await one(`select coalesce(sum(quantity), 0) from ocp_stock where ocp_id = $1 and product_id = $2`, [ocp, p])), 5);
    const c = await makeCustomer();
    await one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id, ocp_id, delivered_at)
       values ('R6' || floor(random() * 1e9)::text, $1, $2, 'delivered', 900, 0, 900, 'cash_on_delivery', 'completed', 900, '{}'::jsonb, $3, $4, now()) returning id`, [c.id, c.addr, city, ocp]);
    await call('POST', '/ocp/settlements', OT, {});
    const set = await one(`select id from ocp_settlements where ocp_id = $1 and status = 'pending' limit 1`, [ocp]);
    await Promise.all([1, 2, 3].map(() => call('POST', `/admin/ocp/settlements/${set}/receive`, A, { password: 'Admin12345', otp: OTP }, H)));
    check('office "settlement received" pressed 3 times at once → received once', Number(await one(`select count(*) from ocp_settlements where ocp_id = $1 and status = 'received'`, [ocp])), 1);
  }

  // ── Coupons: earned once, used once ─────────────────────────────────────────
  {
    const code = `R6MILE${TAG}`;
    await call('POST', '/admin/coupons', A, { code, discount_type: 'fixed', discount_value: 100, trigger_type: 'order_milestone', milestone_orders: 1 }, H);
    const c = await makeCustomer();
    await sql(`insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id, delivered_at)
               values ('R6' || floor(random() * 1e9)::text, $1, $2, 'delivered', 1000, 0, 1000, 'cash_on_delivery', 'completed', 1000, '{}'::jsonb, $3, now())`, [c.id, c.addr, city]);
    await Promise.all([1, 2, 3, 4, 5, 6].map(() => call('GET', `/coupons/mine?city_id=${city}`, c.token)));
    check('a milestone coupon is granted once, even when "My coupons" opens 6 times at once',
      Number(await one(`select count(*) from user_coupons uc join coupons k on k.id = uc.coupon_id where uc.user_id = $1 and k.code = $2`, [c.id, code])), 1);
    const p = await product('R6CP', 500);
    for (let i = 0; i < 2; i++) { await addToCart(c, p, 1); await call('POST', '/cart/apply-coupon', c.token, { code, city_id: city }); await checkout(c, wide); }
    check('…and used on one order only', Number(await one(`select count(*) from orders where user_id = $1 and coupon_code = $2 and coalesce(coupon_discount, 0) > 0`, [c.id, code])), 1);
    const per = `R6PER${TAG}`;
    await call('POST', '/admin/coupons', A, { code: per, discount_type: 'fixed', discount_value: 100, usage_limit: 50, usage_limit_per_user: 1 }, H);
    const c2 = await makeCustomer();
    for (let i = 0; i < 2; i++) { await addToCart(c2, p, 1); await call('POST', '/cart/apply-coupon', c2.token, { code: per, city_id: city }); await checkout(c2, wide); await call('DELETE', '/cart/clear', c2.token); }
    check('a coupon limited to once per customer is used once', Number(await one(`select count(*) from orders where user_id = $1 and coupon_code = $2 and coalesce(coupon_discount, 0) > 0`, [c2.id, per])), 1);
  }

  // ── Small privacy checks ─────────────────────────────────────────────────────
  {
    const c1 = await makeCustomer();
    const c2 = await makeCustomer();
    const n = await one(`insert into notifications (user_id, type, title, message) values ($1, 'promotion', 'R6', 'R6 private') returning id`, [c1.id]);
    check('another customer\'s notification can be neither read nor deleted', `${(await call('PATCH', `/notifications/${n}/read`, c2.token, {})).status}/${(await call('DELETE', `/notifications/${n}`, c2.token)).status}`, '404/404');
    const unsigned = [];
    for (const [p2, b] of [['/webhooks/order-status', { order_id: n, status: 'delivered' }], ['/webhooks/payment', { order_id: n, status: 'completed', amount: 1 }], ['/webhooks/rider-location', { rider_id: n, latitude: 1, longitude: 1 }], ['/webhooks/sms', { from: '+923001234567', message: 'r6' }]]) {
      unsigned.push((await call('POST', p2, null, b)).status);
    }
    check('a webhook without a signature is refused (4 of 4)', unsigned.filter((s) => s === 401).length, 4);
  }

  // ── A city-B admin against city A: every write refused, nothing read ─────────
  {
    const cityB = await one(`insert into service_cities (name, province) values ($1, 'Punjab') returning id`, [`R6B${TAG}`]);
    const B = (await makeAdmin('R6 City B', cityB)).token;
    const cust = await makeCustomer();
    const prod = await product('R6X', 100);
    const mkOrder = (status) => one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id)
       values ('R6' || floor(random() * 1e9)::text, $1, $2, $3, 1000, 0, 1000, 'cash_on_delivery', $4, $5, '{}'::jsonb, $6) returning id`,
      [cust.id, cust.addr, status, status === 'delivered' ? 'completed' : 'pending', status === 'delivered' ? 1000 : 0, city]);
    const delivered = await mkOrder('delivered');
    const item = await one(`insert into order_items (order_id, product_id, product_name, unit_price, quantity, total_price, unit, quality) values ($1, $2, 'R6 item', 1000, 1, 1000, 'full', 'A') returning id`, [delivered, prod]);
    const pending = await mkOrder('ready_for_pickup');
    const complaint = await one(`insert into complaints (ticket_number, user_id, order_id, city_id, subject, message) values ($1, $2, $3, $4, 'R6', 'R6') returning id`, [`R6T${TAG}`, cust.id, delivered, city]);
    const review = await one(`insert into reviews (user_id, target_type, product_id, order_id, city_id, rating, comment) values ($1, 'product', $2, $3, $4, 5, 'R6 review') returning id`, [cust.id, prod, delivered, city]);
    const riderApp = await one(`insert into rider_applications (full_name, phone, city, city_id) values ('R6 Applicant', $1, 'Gujrat', $2) returning id`, [`+92${nextPhone().slice(1)}`, city]);
    const basket = await one(`insert into baskets (city_id, name, total_price) values ($1, 'R6 basket', 500) returning id`, [city]);
    const atta = await one(`insert into atta_requests (request_number, user_id, address_id, wheat_quantity_kg, total_amount) values ($1, $2, $3, 20, 250) returning id`, [`R6ATTA${TAG}`, cust.id, cust.addr]);
    const riderUser = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'R6 X Rider', 'rider', true) returning id`, [`+92${nextPhone().slice(1)}`]);
    const rider = await one(`insert into riders (user_id, cnic, vehicle_type, vehicle_number, status, verification_status, city_id) values ($1, $2, 'bike', 'R6-X', 'available', 'verified', $3) returning id`, [riderUser, `3520${rnd7()}${rnd7().slice(0, 2)}`, city]);
    const ocp = (await call('POST', '/admin/ocp', A, { name: `R6 X OCP ${TAG}`, phone: nextPhone(), pin: '4826', city_id: city }, H)).data?.id;
    const coupon = (await call('POST', '/admin/coupons', A, { code: `R6X${TAG}`, discount_type: 'fixed', discount_value: 50, usage_limit: 5 }, H)).data?.id;
    const worker = (await call('POST', '/finance/workers', A, { name: 'R6 Worker', basic_salary: 30000 }, H)).data?.id;
    const rest = (await call('POST', '/restaurant/register', null, { business_name: `R6 X Dhaba ${TAG}`, phone: nextPhone(), pin: '4826', city_id: city })).data?.id;

    const writes = [
      ['PUT', `/admin/orders/${pending}/status`, { status: 'cancelled', reason: 'r6' }], ['PUT', `/admin/orders/${pending}/assign-rider`, { rider_id: rider }],
      ['PUT', `/admin/orders/${pending}/payment-received`, {}], ['PUT', `/admin/orders/${pending}/toggle-phone`, {}],
      ['PATCH', `/admin/orders/${pending}/assign-ocp`, { ocp_id: ocp }], ['PATCH', `/admin/orders/${pending}/ocp-phone`, { visible: true }],
      ['POST', `/admin/orders/${pending}/return-to-store`, { reason: 'r6' }], ['PUT', `/admin/orders/${delivered}/items/${item}/weight`, { weight_kg: 0.5 }],
      ['DELETE', `/admin/orders/${delivered}`], ['DELETE', `/admin/customers/${cust.id}`, { password: 'Manager123' }],
      ['PUT', `/admin/riders/${rider}`, { vehicle_number: 'HACK-1' }], ['PATCH', `/admin/riders/${rider}/status`, { status: 'offline' }],
      ['PATCH', `/admin/riders/${rider}/verify`, { verification_status: 'rejected' }], ['POST', `/admin/riders/${rider}/cash-settlements/receive`, { password: 'Manager123' }],
      ['DELETE', `/admin/riders/${rider}`], ['PUT', `/admin/products/${prod}`, { price: 1 }], ['PATCH', `/admin/products/${prod}/toggle-active`, {}],
      ['DELETE', `/admin/products/${prod}`], ['PUT', `/admin/categories/${cat}`, { name_en: 'Hacked' }], ['PATCH', `/admin/categories/${cat}/toggle-active`, {}],
      ['PUT', `/admin/addresses/${cust.addr}/house-number`, { house_number: 'HACK' }], ['DELETE', `/admin/addresses/${cust.addr}/location`],
      ['DELETE', `/admin/addresses/${cust.addr}`], ['PUT', `/admin/baskets/${basket}`, { name: 'Hacked', items: [] }], ['DELETE', `/admin/baskets/${basket}`],
      ['PUT', `/admin/coupons/${coupon}`, { code: `R6X${TAG}`, discount_type: 'fixed', discount_value: 60, usage_limit: 5 }], ['PATCH', `/admin/coupons/${coupon}/toggle`, {}],
      ['DELETE', `/admin/coupons/${coupon}`], ['PUT', `/admin/reviews/${review}`, { is_published: false }],
      ['PUT', `/admin/complaints/${complaint}`, { status: 'resolved', admin_response: 'r6' }], ['POST', `/admin/complaints/${complaint}/refund`, { amount: 100, reason: 'r6' }],
      ['PUT', `/admin/rider-applications/${riderApp}`, { status: 'rejected' }], ['POST', `/admin/restaurants/${rest}/approve`, {}],
      ['POST', `/admin/restaurants/${rest}/ban`, { reason: 'r6' }], ['PUT', `/admin/restaurants/${rest}`, { business_name: 'Hacked' }], ['DELETE', `/admin/restaurants/${rest}`],
      ['POST', `/admin/ocp/${ocp}/stock-requests`, { items: [{ product_id: prod, quality: 'A', quantity: 5 }] }], ['PUT', `/admin/ocp/${ocp}`, { name: 'Hacked' }],
      ['DELETE', `/admin/ocp/${ocp}`], ['POST', '/admin/ocp', { name: 'R6 planted OCP', phone: nextPhone(), pin: '4826', city_id: city }],
      ['POST', '/admin/stock/add', { product_id: prod, quantity: 5, quality: 'A', note: 'r6' }], ['POST', '/admin/stock/count', { product_id: prod, quality: 'A', counted_quantity: 1, note: 'r6' }],
      ['POST', '/admin/stock/convert', { product_id: prod, from_quality: 'A', to_quality: 'B', quantity: 1, note: 'r6' }],
      ['PUT', `/admin/atta-requests/${atta}/status`, { status: 'cancelled' }], ['PUT', `/admin/atta-requests/${atta}/assign-rider`, { rider_id: rider, task_type: 'atta_pickup' }],
      ['PUT', `/finance/workers/${worker}`, { name: 'Hacked' }], ['POST', `/finance/workers/${worker}/pay`, { amount: 100, category: 'bonus' }],
      ['POST', `/finance/workers/${worker}/increment`, { new_basic_salary: 999999 }],
      ['POST', '/finance/stock-purchase', { product_id: prod, purchase_price: 100, raw_weight: 1, grade_a: 1, supplier_name: 'r6' }],
      ['POST', '/finance/rider-payment', { rider_id: rider, category: 'other', amount: 100 }],
    ];
    const leaked = [];
    for (const [m, p2, body] of writes) {
      const r = await call(m, p2, B, body);
      if (r.status < 400 || r.status >= 500) leaked.push(`${m} ${p2.replace(/[0-9a-f-]{36}/g, ':id')} → ${r.status}`);
    }
    check(`city-B admin: all ${writes.length} writes on city A are refused${leaked.length ? ` (${leaked.slice(0, 3).join('; ')})` : ''}`, leaked.length, 0);
    check('…and city A\'s product is untouched', await one(`select price::int::text || '/' || is_active::text || '/' || stock_quantity::int::text from products where id = $1`, [prod]), '1000/true/100');

    const markers = [delivered, pending, cust.id, rider, prod, complaint, review, riderApp, basket, atta, ocp, coupon, worker, rest, cust.phone].filter(Boolean);
    const reads = [
      '/admin/orders?limit=100', `/admin/orders/${delivered}`, '/admin/customers?limit=100', `/admin/customers/${cust.id}/addresses`, `/admin/customers/lookup?phone=${encodeURIComponent(cust.phone)}`,
      '/admin/riders?limit=100', `/admin/riders/${rider}`, `/admin/riders/${rider}/stats`, `/admin/riders/${rider}/tasks`, `/admin/riders/${rider}/location`, `/admin/riders/${rider}/cash-settlements`,
      '/admin/products?limit=100', `/admin/products/${prod}`, '/admin/addresses?limit=100', '/admin/baskets', '/admin/coupons', '/admin/coupons/redemptions',
      '/admin/reviews?limit=100', '/admin/complaints?limit=100', `/admin/complaints/${complaint}`, '/admin/rider-applications', '/admin/restaurants', '/admin/restaurants/orders',
      '/admin/ocp', `/admin/ocp/${ocp}/stock-requests`, '/admin/ocp/settlements', '/admin/ocp/shortages', '/admin/stock', `/admin/stock/${prod}/movements`, '/admin/stock/counts',
      '/admin/atta-requests', '/admin/marketing/abandoned-carts', '/finance/workers', `/finance/workers/${worker}`, '/finance/expenses', '/finance/riders', '/finance/products', '/finance/purchase-requests',
    ];
    const seen = [];
    for (const p2 of reads) {
      const res = await fetch(API + p2, { headers: { Authorization: `Bearer ${B}` } });
      const text = await res.text();
      if (res.status >= 500 || (res.status === 200 && markers.some((mk) => text.includes(mk)))) seen.push(`${p2.replace(/[0-9a-f-]{36}/g, ':id').split('?')[0]} → ${res.status}`);
    }
    check(`city-B admin: none of ${reads.length} reads shows city A's data (customer lookup by phone included — B31)${seen.length ? ` (${seen.slice(0, 3).join('; ')})` : ''}`, seen.length, 0);
    const lookup = (token, hdr) => call('GET', `/admin/customers/lookup?phone=${encodeURIComponent(cust.phone)}`, token, undefined, hdr);
    check("customer lookup: another city's admin gets 'no customer' (it gave the name — B31)", (await lookup(B)).data?.customer ?? null, null);
    check('…the owner, in that city, finds the customer', (await lookup(A, H)).data?.customer?.id, cust.id);
  }

  // A34 (round 7): the same money request pressed 3 times at once was booked
  // 3 times (refund, expense, rider payment). Now booked once, repeats 409;
  // a failed attempt does not block the corrected retry.
  {
    const cust = await makeCustomer();
    const ord = await one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id, delivered_at)
       values ('R6D' || floor(random() * 1e9)::text, $1, $2, 'delivered', 1000, 0, 1000, 'cash_on_delivery', 'completed', 1000, '{}'::jsonb, $3, NOW()) returning id`,
      [cust.id, cust.addr, city]);
    const comp = await one(`insert into complaints (ticket_number, user_id, order_id, city_id, subject, message) values ($1, $2, $3, $4, 'R6D', 'R6D') returning id`, [`R6D${TAG}`, cust.id, ord, city]);
    const riderUser = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'R6 D Rider', 'rider', true) returning id`, [`+92${nextPhone().slice(1)}`]);
    const rider = await one(`insert into riders (user_id, cnic, vehicle_type, vehicle_number, status, verification_status, city_id) values ($1, $2, 'bike', 'R6-D', 'available', 'verified', $3) returning id`, [riderUser, `3520${rnd7()}${rnd7().slice(0, 2)}`, city]);
    const three = (p, body) => Promise.all([0, 1, 2].map(() => call('POST', p, A, body, H)));
    const codes = (rs) => rs.map((r) => r.status).sort().join(',');

    const over = await call('POST', `/admin/complaints/${comp}/refund`, A, { amount: 5000, reason: 'R6 triple', source: 'admin' }, H);
    const rf = await three(`/admin/complaints/${comp}/refund`, { amount: 100, reason: 'R6 triple', source: 'admin' });
    check('refund pressed 3 times at once → booked once, repeats 409 (A34)',
      `${codes(rf)}/${await one(`select count(*) from refunds where complaint_id = $1`, [comp])}`, '200,409,409/1');
    check('…a refund over the limit is refused and not booked', over.status, 400);

    const note = `R6D expense ${TAG}`;
    const ex = await three('/finance/expenses', { category: 'other', amount: 123, comment: note });
    check('expense saved 3 times at once → booked once (A34)',
      `${codes(ex)}/${await one(`select count(*) from expenses where comment = $1`, [note])}`, '200,409,409/1');

    const rp = await three('/finance/rider-payment', { rider_id: rider, amount: 111, category: 'rider_payment' });
    check('rider payment 3 times at once → booked once (A34)',
      `${codes(rp)}/${await one(`select count(*) from expenses where ref_id = $1`, [rider])}`, '200,409,409/1');
  }

  // A34 (customer side, round 8): three taps on "submit" made three
  // complaints, three wheat pickups and three addresses.
  {
    const c = await makeCustomer();
    const ord = await one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id, delivered_at)
       values ('R6C' || floor(random() * 1e9)::text, $1, $2, 'delivered', 500, 0, 500, 'cash_on_delivery', 'completed', 500, '{}'::jsonb, $3, NOW()) returning id`,
      [c.id, c.addr, city]);
    const three = (p, body) => Promise.all([0, 1, 2].map(() => call('POST', p, c.token, body, H)));
    const codes = (rs) => rs.map((r) => r.status).sort().join(',');
    const cp = await three('/complaints', { order_id: ord, subject: 'R6 triple', message: 'Three taps on submit', category: 'other' });
    check('complaint sent 3 times at once → one complaint (A34)', `${codes(cp)}/${await one(`select count(*) from complaints where user_id = $1`, [c.id])}`, '201,409,409/1');
    const attaWas = (await call('GET', '/admin/settings/platform', A)).data?.atta_chakki_enabled === true;
    // A36: with the owner's switch OFF, no atta request is created.
    await call('PUT', '/admin/settings/platform', A, { atta_chakki_enabled: false });
    const off = await call('POST', '/atta-requests', c.token, { address_id: c.addr, wheat_quantity_kg: 20, wheat_quality: 'desi' }, H);
    check('Atta Chakki switched off → a request is refused and nothing is saved (A36)',
      `${off.status}/${await one(`select count(*) from atta_requests where user_id = $1`, [c.id])}`, '403/0');
    await call('PUT', '/admin/settings/platform', A, { atta_chakki_enabled: true });
    const at = await three('/atta-requests', { address_id: c.addr, wheat_quantity_kg: 20, wheat_quality: 'desi' });
    await call('PUT', '/admin/settings/platform', A, { atta_chakki_enabled: attaWas });
    check('…atta request 3 times at once → one wheat pickup', `${codes(at)}/${await one(`select count(*) from atta_requests where user_id = $1`, [c.id])}`, '201,409,409/1');
    const ad = await three(`/addresses?city_id=${city}`, { written_address: 'R6 house 12, street 4', address_type: 'home' });
    check('…address saved 3 times at once → one new address', `${codes(ad)}/${await one(`select count(*) from addresses where user_id = $1`, [c.id])}`, '201,409,409/2');
  }

  // A39 (round 9): the delivery area was only checked by the website / app;
  // the server saved an address pinned outside it.
  {
    const cityArea = await one(`insert into service_cities (name, province) values ($1, 'Punjab') returning id`, [`R6Area${TAG}`]);
    const made = await call('POST', '/admin/service-areas', A, { city_id: cityArea, name: 'R6 square', polygon: [[74.0, 32.5], [74.1, 32.5], [74.1, 32.6], [74.0, 32.6]] });
    const c = await makeCustomer(`R6Area${TAG}`);
    const save = (lat, lng) => call('POST', `/addresses?city_id=${cityArea}`, c.token, { written_address: 'R6 area house 1', address_type: 'home', ...(lat != null ? { latitude: lat, longitude: lng } : {}) });
    check('a pin outside the city\'s delivery area is refused (A39)', `${made.status}/${(await save(32.8, 74.3)).status}`, '201/422');
    check('…inside it is saved', (await save(32.55, 74.05)).status, 201);
    check('…an address without a pin is not checked (same as the app)', (await save(null)).status, 201);
    const free = await makeCustomer();
    check('…a city with no drawn area stays open everywhere', (await call('POST', `/addresses?city_id=${city}`, free.token, { written_address: 'R6 open house 2', address_type: 'home', latitude: 10.1, longitude: 10.1 })).status, 201);
  }

  // A38 (round 9): sending "delivered" again for an order delivered yesterday
  // re-stamped delivered_at = now — the delivery moved to another day in rider
  // earnings and period reports.
  {
    const c = await makeCustomer();
    const ord = await one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id, delivered_at)
       values ('R6Y' || floor(random() * 1e9)::text, $1, $2, 'delivered', 100, 0, 100, 'cash_on_delivery', 'completed', 100, '{}'::jsonb, $3, NOW() - interval '1 day') returning id`,
      [c.id, c.addr, city]);
    const stamp = () => one(`select to_char(delivered_at, 'YYYY-MM-DD HH24:MI:SS') from orders where id = $1`, [ord]);
    const before = await stamp();
    await call('PUT', `/admin/orders/${ord}/status`, A, { status: 'delivered' }, H);
    check('"delivered" sent again keeps yesterday\'s delivery time (A38)', await stamp(), before);
    await call('PUT', '/admin/orders/bulk-status', A, { order_ids: [ord], status: 'delivered' }, H);
    check('…and so does a bulk "delivered"', await stamp(), before);
  }

  // A37 (round 9): the dashboard's "this week" was 8 days and "this month"
  // the last 31 days. Now: last 7 days (today included) and the calendar month.
  {
    const cityD = await one(`insert into service_cities (name, province) values ($1, 'Punjab') returning id`, [`R6Dash${TAG}`]);
    const c = await makeCustomer();
    const pkNoon = (dateSql) => `((${dateSql})::timestamp + interval '12 hours') at time zone 'Asia/Karachi'`;
    const today = `(now() at time zone 'Asia/Karachi')::date`;
    const mk = (when) => sql(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id, placed_at)
       values ('R6P' || floor(random() * 1e9)::text, $1, $2, 'delivered', 100, 0, 100, 'cash_on_delivery', 'completed', 100, '{}'::jsonb, $3, ${when})`,
      [c.id, c.addr, cityD]);
    await mk(pkNoon(`${today} - 6`));
    await mk(pkNoon(`${today} - 7`));
    await mk(pkNoon(`date_trunc('month', ${today})::date - 1`));
    const inMonth = Number(await one(`select count(*) from orders where city_id = $1 and placed_at >= (date_trunc('month', ${today})::timestamp at time zone 'Asia/Karachi')`, [cityD]));
    const d = (await call('GET', '/admin/dashboard', A, undefined, { 'X-City-Id': cityD })).data;
    check('dashboard "last 7 days": 6 days ago counts, 7 days ago does not (A37)', Number(d?.weekly?.total_orders), 1);
    check('…"this month" counts only orders since the 1st', Number(d?.monthly?.total_orders), inMonth);
  }

  // B33 (round 8): a new PIN may not be one anyone would try first; an old
  // easy PIN still logs in (only setting / changing is checked).
  {
    const weakRest = await call('POST', '/restaurant/register', null, { business_name: `R6 Weak ${TAG}`, phone: nextPhone(), pin: '1234', city_id: city, address: 'R6 road' });
    check('restaurant sign-up with PIN 1234 is refused (B33)', weakRest.status, 400);
    const weakOcp = await call('POST', '/admin/ocp', A, { name: `R6 weak OCP ${TAG}`, phone: nextPhone(), pin: '0000', city_id: city }, H);
    check('…an OCP with PIN 0000 is refused', weakOcp.status, 400);
    const c = await makeCustomer();
    check('…a customer setting PIN 1111 is refused', (await call('POST', '/auth/set-pin', c.token, { pin: '1111' })).status, 400);
    check('…a good PIN is accepted', (await call('POST', '/auth/set-pin', c.token, { pin: '4826' })).status, 200);
    const old = await makeCustomer();
    await sql(`update users set pin_hash = $1, pin_set_at = NOW() where id = $2`, [bcrypt.hashSync('1234', 4), old.id]);
    check('…an account that already has PIN 1234 still logs in with it', (await call('POST', '/auth/verify-pin', null, { phone: old.phone, pin: '1234' })).status, 200);
  }

  // W13 (round 8): a one-time coupon — used once, refused again, given back
  // when the order is cancelled (not covered before).
  {
    const c = await makeCustomer();
    const p = await product('R6Cpn', 50);
    const code = `R6REL${TAG}`;
    await call('POST', '/admin/coupons', A, { code, discount_type: 'fixed', discount_value: 50, usage_limit: 1 }, H);
    const used = () => one(`select used_count from coupons where code = $1`, [code]);
    await addToCart(c, p, 1);
    await call('POST', '/cart/apply-coupon', c.token, { code, city_id: city });
    const placed = await checkout(c, wide);
    const o1 = orderIdOf(placed);
    check('one-time coupon: first order gets Rs 50 off', `${Number(await one(`select coupon_discount from orders where id = $1`, [o1]))}/${await used()}`, '50/1');
    await addToCart(c, p, 1);
    check('…a second use is refused', (await call('POST', '/cart/apply-coupon', c.token, { code, city_id: city })).status, 400);
    await call('PUT', `/orders/${o1}/cancel`, c.token, { reason: 'R6 coupon' });
    check('…cancelling the order gives the coupon back', Number(await used()), 0);
    check('…and it can be used again', (await call('POST', '/cart/apply-coupon', c.token, { code, city_id: city })).status, 200);
  }

  // A35 (round 7): the basket price shown to customers was a number typed
  // once (stale as prices move; even Rs 0), while "Add basket to cart" charges
  // today's item prices; a basket made in "All cities" view had no city and
  // showed in every city.
  {
    const p = await product('R6Bsk', 50); // Rs 1,000 a kg
    const made = await call('POST', '/admin/baskets', A, { name: `R6 basket live ${TAG}`, total_price: 0, items: [{ product_id: p, quality: 'A', quantity: 2, unit: 'full' }] });
    const bid = made.data?.id;
    check('basket made in "All cities" view belongs to its products\' city (A35)', await one(`select city_id from baskets where id = $1`, [bid]), city);
    const shown = async (c) => ((await call('GET', `/site-settings/baskets?city_id=${c}`)).data || []).find((b) => b.id === bid);
    check('…customers see today\'s price of the items (2 kg × Rs 1,000), not the typed Rs 0', (await shown(city))?.total_price, 2000);
    await sql(`update products set price = 1200 where id = $1`, [p]);
    check('…and it follows a price change (2 × Rs 1,200)', (await shown(city))?.total_price, 2400);
    const other = await one(`select id from service_cities where id <> $1 and is_active = true limit 1`, [city]);
    check('…another city does not see it', (await shown(other)) ?? null, null);
    const otherCat = await one(`select id from categories limit 1`);
    const foreign = await one(
      `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type)
       values ($1, $1, $2, $3, 100, 5, $4, true, 'kg') returning id`,
      [`R6Far${TAG}`, `r6far-${TAG}-${rnd7()}`, otherCat, other]);
    const mixed = await call('POST', '/admin/baskets', A, { name: `R6 mixed ${TAG}`, total_price: 100, items: [{ product_id: p, quality: 'A', quantity: 1, unit: 'full' }, { product_id: foreign, quality: 'A', quantity: 1, unit: 'full' }] });
    check('…a basket mixing two cities\' products is refused', mixed.status, 400);
  }

  // A33 (round 7): a stock count below what open orders hold must warn —
  // it used to pass silently and those orders could not be packed in full.
  {
    const c = await makeCustomer();
    const p = await one(
      `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type)
       values ($1, $1, $2, $3, 10, 10, $4, true, 'kg') returning id`,
      [`R6Cnt${TAG}`, `r6cnt-${TAG}-${rnd7()}`, cat, city]);
    await addToCart(c, p, 4);
    await checkout(c, wide);
    const r = await call('POST', '/admin/stock/count', A, { product_id: p, quality: 'A', counted_quantity: 1 }, H);
    check('stock count of 1 while open orders hold 4 → saved with a "3 short" warning (A33)',
      `${r.status}/${r.data?.shortForOpenOrders}/${/open orders need 4/.test(r.message || '')}`, '200/3/true');
    const ok = await call('POST', '/admin/stock/count', A, { product_id: p, quality: 'A', counted_quantity: 4 }, H);
    check('…a count that covers the open orders gives no warning', `${ok.status}/${ok.data?.shortForOpenOrders}`, '200/0');
  }

  // B32 (round 7): text a customer typed must not run as a spreadsheet formula
  // when the office opens the customers CSV.
  {
    const c = await makeCustomer();
    await sql(`update users set full_name = $1 where id = $2`, [`=HYPERLINK("http://x.example","R6${TAG}")`, c.id]);
    const res = await fetch(`${API}/admin/customers/export?search=${encodeURIComponent(`R6${TAG}`)}`, { headers: { Authorization: `Bearer ${A}`, ...H } });
    const line = (await res.text()).split('\n').find((l) => l.includes(`R6${TAG}`)) || '';
    check('customers CSV: a name written as a formula stays plain text (B32)', line.startsWith(`"'=HYPERLINK`), true);
  }

  // B37 (round 10): an optional price box set to 0 sold that unit for Rs. 0.
  // The server refuses 0 (blank still means "automatic") and nothing changes.
  {
    const p = await product('ZeroHalf', 10);
    for (const field of ['half_kg_price', 'restaurant_price_a', 'price_b', 'quarter_kg_price_c']) {
      const r = await call('PUT', `/admin/products/${p}`, A, { [field]: 0 }, H);
      check(`product ${field} = 0 is refused, naming the field (B37)`, `${r.status}/${new RegExp(`${field}.*greater than 0`).test(JSON.stringify(r))}`, '422/true');
    }
    const blank = await call('PUT', `/admin/products/${p}`, A, { half_kg_price: null, price_b: 450 }, H);
    check('…blank ½ kg (automatic) and a real Quality B price still save', blank.status, 200);
    check('…and no 0 was stored', await one(`select count(*)::int from products where id = $1 and (half_kg_price = 0 or price_b = 0)`, [p]), 0);
  }

  // I22 (round 10): a restaurant delivery charge of 0 (free delivery) was saved
  // but read back as Rs 100 — the screen and the bill ignored it.
  {
    const before = (await call('GET', '/admin/restaurants/settings', A)).data || {};
    try {
      const put = await call('PUT', '/admin/restaurants/settings', A, { base_charge: 0, free_delivery_threshold: 0 });
      check('restaurant delivery charge 0 saves (I22)', put.status, 200);
      const after = (await call('GET', '/admin/restaurants/settings', A)).data || {};
      check('…and reads back as 0 / 0, not Rs 100 / 2000', `${after.base_charge}/${after.free_delivery_threshold}`, '0/0');
    } finally {
      await call('PUT', '/admin/restaurants/settings', A, { base_charge: before.base_charge ?? 100, free_delivery_threshold: before.free_delivery_threshold ?? 2000 });
    }
  }

  // B38 (round 10): a portal password / PIN change left every older session
  // working for up to 12 hours (no refresh token to revoke).
  {
    const ocpPhone = nextPhone();
    const ocp = (await call('POST', '/admin/ocp', A, { name: `R6 OCP pin ${TAG}`, phone: ocpPhone, pin: '4826', city_id: city }, H)).data?.id;
    const oldOcp = (await call('POST', '/ocp/login', null, { phone: ocpPhone, pin: '4826' })).data?.token;
    await new Promise((r) => setTimeout(r, 1100)); // tokens carry whole seconds
    check('OCP: the PIN changes (B38)', (await call('PUT', `/admin/ocp/${ocp}`, A, { pin: '5937' }, H)).status, 200);
    check('…the session signed in with the old PIN has ended', (await call('GET', '/ocp/orders', oldOcp)).status, 401);
    const newOcp = (await call('POST', '/ocp/login', null, { phone: ocpPhone, pin: '5937' })).data?.token;
    check('…a new login works', (await call('GET', '/ocp/orders', newOcp)).status, 200);

    const email = `r6b38${TAG}@example.com`;
    const sid = (await call('POST', '/finance/shareholders', A, { name: 'R6 Holder', email, password: 'Holder123', share_percent: 0 }, H)).data?.id;
    const other = (await call('POST', '/shareholder/login', null, { email, password: 'Holder123' })).data?.token;
    const mine = (await call('POST', '/shareholder/login', null, { email, password: 'Holder123' })).data?.token;
    await new Promise((r) => setTimeout(r, 1100));
    const changed = await call('POST', '/shareholder/change-password', mine, { current_password: 'Holder123', new_password: 'Holder456' });
    check('shareholder: password changed, this device gets a new session', `${changed.status}/${Boolean(changed.data?.token)}`, '200/true');
    check('…the other device\'s old session has ended', (await call('GET', '/shareholder/me', other)).status, 401);
    check('…the new session works', (await call('GET', '/shareholder/me', changed.data?.token)).status, 200);
    const fresh = (await call('POST', '/shareholder/login', null, { email, password: 'Holder456' })).data?.token;
    await new Promise((r) => setTimeout(r, 1100));
    check('super admin sets a new password', (await call('PUT', `/finance/shareholders/${sid}`, A, { password: 'Holder789' }, H)).status, 200);
    check('…the shareholder\'s earlier session has ended', (await call('GET', '/shareholder/me', fresh)).status, 401);
  }

  // N2 + N4 (session 10): delivery dates. A customer could book a date a year
  // away (holding stock), an impossible date was a 500, and a restaurant order
  // took a past date, a far date — no date gate at all.
  {
    const far = new Date(Date.now() + 5 * 3600e3 + 40 * 864e5).toISOString().slice(0, 10);
    const c = await makeCustomer();
    const p = await product('R6Date', 50);
    const at = async (date) => {
      await addToCart(c, p, 1);
      const r = await call('POST', '/orders', c.token, { address_id: c.addr, city_id: city, time_slot_id: wide, requested_delivery_date: date, payment_method: 'cash_on_delivery' });
      if (r.status < 300) await call('PUT', `/orders/${orderIdOf(r)}/cancel`, c.token, { reason: 'test' });
      return r.status;
    };
    check('customer: a delivery date 40 days ahead is refused (N2)', await at(far), 400);
    check('customer: an impossible date (2026-02-30) is refused, not a 500 (N2)', await at('2026-02-30'), 422);
    check('customer: tomorrow still works', await at(tomorrow), 201);

    const rPhone = nextPhone();
    await one(`insert into restaurants (business_name, owner_name, phone, pin_hash, status, city_id, city) values ($1, 'R6 Owner', $2, $3, 'approved', $4, 'Gujrat') returning id`,
      [`R6 Rest ${TAG}`, `+92${rPhone.slice(1)}`, bcrypt.hashSync('4826', 4), city]);
    const rTok = (await call('POST', '/restaurant/login', null, { phone: rPhone, pin: '4826' })).data?.token;
    const rp = await one(
      `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type, available_for_restaurants, restaurant_enabled_a, restaurant_price_a)
       values ($1, $1, $2, $3, 300, 500, $4, true, 'kg', true, true, 280) returning id`, [`R6RestDate${TAG}`, `r6restdate-${TAG}-${rnd7()}`, cat, city]);
    const rSlot = await one(`insert into time_slots (slot_name, start_time, end_time, status, audience, city_id) values ($1, '00:00', '23:59', 'available', 'restaurant', $2) returning id`, [`R6 rest ${TAG} ${rnd7()}`, city]);
    const rOrder = async (date, n) => (await call('POST', '/restaurant/orders', rTok, { items: [{ product_id: rp, quantity: n }], time_slot_id: rSlot, requested_delivery_date: date, customer_notes: `r6 ${n}` })).status;
    check('restaurant: a past date is refused (N4 — it was 201)', await rOrder('2020-01-01', 1), 400);
    check('restaurant: a date 40 days ahead is refused (N4)', await rOrder(far, 2), 400);
    check('restaurant: an impossible date is refused, not a 500 (N4)', await rOrder('2026-02-30', 3), 422);
    check('restaurant: tomorrow still works', await rOrder(tomorrow, 4), 201);
    const mine = ((await call('GET', '/restaurant/orders', rTok)).data || [])[0] || {};
    check('restaurant "My Orders" says when it comes: day + slot (N9)', `${mine.requested_delivery_date}/${mine.slot_start}-${mine.slot_end}`, `${tomorrow}/00:00-23:59`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.end();
  return { pass, fail };
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(({ fail: failed }) => process.exit(failed ? 1 : 0))
    .catch(async (e) => { console.error('ROUND 6 SCRIPT ERROR', e); try { await db.end(); } catch { /* closed */ } process.exit(1); });
}
