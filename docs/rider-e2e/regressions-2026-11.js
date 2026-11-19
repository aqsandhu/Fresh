#!/usr/bin/env node
/* eslint-disable no-console */
// ============================================================================
// Real-DB regression checks for the bugs found and fixed in November 2026.
// Every check here failed against the code before its fix. Runs against the
// real API on :3999 and the real Postgres on :55432 (same setup as the other
// scripts in this folder — see README.md); used by run-all.sh and CI.
//
//   JWT_SECRET=<same as the API> node docs/rider-e2e/regressions-2026-11.js
// ============================================================================
const path = require('path');
const BM = path.join(__dirname, '..', '..', 'backend', 'node_modules');
const { Client } = require(path.join(BM, 'pg'));
const bcrypt = require(path.join(BM, 'bcryptjs'));
const jwt = require(path.join(BM, 'jsonwebtoken'));

// Also importable: `require(...).run({ api, databaseUrl, jwtSecret })` — the
// backend's real-database jest suite (backend/tests/e2e) runs these same checks
// in-process so they count towards measured code coverage.
let API = process.env.API_URL || 'http://localhost:3999/api';
let DB = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:55432/fb';
let JWT_SECRET = process.env.JWT_SECRET;
const OTP = process.env.OTP_BYPASS_CODE || '123789';
const TAG = String(Date.now()).slice(-7); // keeps phones / names unique across runs

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
  return { status: res.status, body: json, data: json?.data };
}

let pass = 0; let fail = 0;
function check(label, got, want) {
  const ok = String(got) === String(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` — expected [${want}] got [${got}]`}`);
  if (ok) pass++; else fail++;
}

/** Admin login; sends the one-time code when the server asks for the second step. */
async function adminLogin(phone, password) {
  let r = await call('POST', '/admin/login', null, { phone, password });
  const twoStep = Boolean(r.data?.requires_otp);
  if (twoStep) r = await call('POST', '/admin/login', null, { phone, password, otp: OTP });
  if (!r.data?.tokens?.accessToken) throw new Error(`admin login failed for ${phone}: ${JSON.stringify(r.body)}`);
  return { token: r.data.tokens.accessToken, twoStep };
}

async function run(opts = {}) {
  if (opts.api) API = opts.api;
  if (opts.jwtSecret) JWT_SECRET = opts.jwtSecret;
  if (opts.databaseUrl && opts.databaseUrl !== DB) { DB = opts.databaseUrl; db = new Client({ connectionString: DB }); }
  pass = 0; fail = 0;
  await db.connect();
  const city = await one(`select id from service_cities where name = 'Gujrat' limit 1`);
  // A category OF THIS CITY: "the first category anywhere" could be another
  // city's copy left by an earlier run's catalogue import.
  const cat = (await one(`select id from categories where city_id = $1 order by name_en limit 1`, [city]))
    ?? (await one(`select id from categories order by name_en limit 1`));
  const owner = await adminLogin('03001112222', 'Admin12345');
  const A = owner.token;
  const H = { 'X-City-Id': city };

  // A city admin who holds EVERY permission (but is not the super admin).
  const mgrPhone = `0300${TAG}`;
  const role = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`Regression Manager ${TAG}`, city]);
  await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions`, [role]);
  const mgrId = await one(
    `insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified)
     values ($1, 'Regression Manager', 'admin', $2, $3, true) returning id`,
    [`+92${mgrPhone.slice(1)}`, bcrypt.hashSync('Manager123', 10), role]
  );
  await sql(`insert into admins (user_id) values ($1)`, [mgrId]);
  const M = (await adminLogin(mgrPhone, 'Manager123')).token;
  // A second admin's approval = a ONE-TIME code the owner makes on their own
  // device (owner's decision Q7: approver passwords are no longer accepted).
  const approver = async () => {
    const issued = await call('POST', '/admin/approval-codes', A, {});
    return { approval_phone: '03001112222', approval_password: issued.data?.code };
  };

  // A customer with an address.
  const custPhone = `+92302${TAG}`;
  const cust = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'Regression Customer', 'customer', true) returning id`, [custPhone]);
  const addr = await one(`insert into addresses (user_id, written_address, city) values ($1, 'Regression house', 'Gujrat') returning id`, [cust]);
  const C = JWT_SECRET
    ? jwt.sign({ userId: cust, phone: custPhone, role: 'customer', type: 'access' }, JWT_SECRET, { expiresIn: '15m' })
    : null;

  const product = async (name, set = '') => {
    const id = await one(
      `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active)
       values ($1, $1, $2, $3, 1000, 100, $4, true) returning id`,
      [`${name}${TAG}`, `${name.toLowerCase()}-${TAG}`, cat, city]
    );
    if (set) await sql(`update products set ${set} where id = $1`, [id]);
    return id;
  };
  const order = (status, f = {}) => one(
    `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, coupon_discount, coupon_code,
                         payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id)
     values ('RG' || floor(random() * 1e9)::text, $1, $2, $3, $4, 0, $5, $6, $7, 'cash_on_delivery', $8, $9, '{}'::jsonb, $10) returning id`,
    [cust, addr, status, f.subtotal ?? 1000, f.total ?? 1000, f.coupon ?? 0, f.code ?? null, f.paid ? 'completed' : 'pending', f.paid ?? 0, city]
  );
  const line = (orderId, productId, f = {}) => one(
    `insert into order_items (order_id, product_id, product_name, unit_price, quantity, total_price, unit, quality, weight_kg)
     values ($1, $2, 'Regression item', $3, 1, $3, $4, 'A', $5) returning id`,
    [orderId, productId, f.price ?? 1000, f.unit ?? 'full', f.weight ?? null]
  );

  // ── Two-step admin login (same rule as every other OTP) ────────────────────
  if (owner.twoStep) {
    const r1 = await call('POST', '/admin/login', null, { phone: '03001112222', password: 'Admin12345' });
    check('2FA: password alone gives no tokens', r1.data?.tokens === undefined && r1.data?.requires_otp === true, true);
    const r2 = await call('POST', '/admin/login', null, { phone: '03001112222', password: 'Admin12345', otp: '000000' });
    check('2FA: wrong code is refused', r2.status, 401);
    await call('POST', '/admin/login', null, { phone: '03001112222', password: 'Admin12345', otp: OTP }); // clears the counter
  } else {
    console.log('SKIP 2FA checks — two-step login is off on this server (no OTP bypass / no delivery channel)');
  }

  // ── Logout really ends the session ────────────────────────────────────────
  {
    const fresh = async () => {
      let x = await call('POST', '/admin/login', null, { phone: mgrPhone, password: 'Manager123' });
      if (x.data?.requires_otp) x = await call('POST', '/admin/login', null, { phone: mgrPhone, password: 'Manager123', otp: OTP });
      return x.data.tokens;
    };
    let t = await fresh();
    await call('POST', '/auth/logout', t.accessToken, { refreshToken: t.refreshToken });
    check('logout revokes the refresh token it is given', (await call('POST', '/auth/refresh', null, { refreshToken: t.refreshToken })).status, 401);
    t = await fresh();
    const expired = await call('POST', '/auth/logout', 'an-expired-access-token', { refreshToken: t.refreshToken });
    check('logout works with an expired access token', `${expired.status}/${(await call('POST', '/auth/refresh', null, { refreshToken: t.refreshToken })).status}`, '200/401');
    t = await fresh();
    await call('POST', '/auth/logout', t.accessToken);
    check('old app builds (no token sent): the session is still ended', (await call('POST', '/auth/refresh', null, { refreshToken: t.refreshToken })).status, 401);
    t = await fresh();
    const rotated = await call('POST', '/auth/refresh', null, { refreshToken: t.refreshToken });
    const newRefresh = rotated.data?.tokens?.refreshToken || rotated.data?.refreshToken;
    check('refresh hands out a NEW refresh token', Boolean(newRefresh) && newRefresh !== t.refreshToken, true);
    check('…and the old one stops working (rotation)', (await call('POST', '/auth/refresh', null, { refreshToken: t.refreshToken })).status, 401);
    check('X-Request-Id is on every response', /^[0-9a-f-]{36}$/.test((await fetch(API.replace(/\/api$/, '') + '/live')).headers.get('x-request-id') || ''), true);
  }

  // ── Security posture (found by probing a production-mode instance) ────────
  {
    const raw = (p, init = {}) => fetch(API + p, init);
    let x = await raw('/products?limit=1', { headers: { Origin: 'https://not-our-site.example' } });
    check('a web page on a foreign site is refused with 403 (was a 500)', x.status, 403);
    x = await raw('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '03001234567', password: 'x'.repeat(3 * 1024 * 1024) }) });
    check('an oversized JSON body is a 413 (was a 500)', x.status, 413);
    x = await raw('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"phone": ' });
    check('malformed JSON is a 400', x.status, 400);
    x = await raw('/products?limit=1');
    check('responses carry nosniff and no X-Powered-By', `${x.headers.get('x-content-type-options')}/${x.headers.get('x-powered-by')}`, 'nosniff/null');
    x = await raw('/admin/orders?limit=1', { headers: { Authorization: `Bearer ${A}`, 'X-City-Id': city } });
    check('answers to a signed-in caller are never cached', x.headers.get('cache-control'), 'no-store');
    x = await raw('/atta-requests/track/00000000-0000-0000-0000-000000000000');
    check('atta tracking needs a signed-in user (it was open to anyone with the id)', x.status, 401);
  }

  // ── Weight edits ───────────────────────────────────────────────────────────
  const vw = await product('RegChicken', 'is_variable_weight = true');
  const code = `REG${TAG}`;
  const coupon = (await call('POST', '/admin/coupons', A, { code, discount_type: 'percentage', discount_value: 50 }, H)).data?.id;
  let o = await order('confirmed', { subtotal: 1000, coupon: 500, total: 500, code });
  let item = await line(o, vw, { weight: 1 });
  await sql(`insert into coupon_redemptions (coupon_id, user_id, order_id, discount_amount) values ($1, $2, $3, 500)`, [coupon, cust, o]);
  await call('PUT', `/admin/orders/${o}/items/${item}/weight`, A, { weight_kg: 0.2 }, H);
  let row = (await sql(`select subtotal::float, coupon_discount::float, total_amount::float from orders where id = $1`, [o]))[0];
  check('weight edit: a 50 % coupon is re-applied to the new subtotal (200 → 100 off, pay 100)', `${row.subtotal}/${row.coupon_discount}/${row.total_amount}`, '200/100/100');
  check('weight edit: the redemption record follows', await one(`select discount_amount::float from coupon_redemptions where order_id = $1`, [o]), 100);

  o = await order('confirmed', { subtotal: 500, total: 500 });
  item = await line(o, vw, { price: 500, unit: 'half_kg', weight: 0.5 });
  await call('PUT', `/admin/orders/${o}/items/${item}/weight`, A, { weight_kg: 0.5 }, H);
  check('weight edit: confirming 0.5 kg on a half-kg line keeps Rs 500', await one(`select total_price::float from order_items where id = $1`, [item]), 500);
  await call('PUT', `/admin/orders/${o}/items/${item}/weight`, A, { weight_kg: 0.6 }, H);
  check('weight edit: 0.6 kg on a half-kg line is Rs 600', await one(`select total_price::float from order_items where id = $1`, [item]), 600);

  const vw2 = await product('RegMutton', 'is_variable_weight = true');
  o = await order('confirmed');
  item = await line(o, vw2); // no stored weight, like a real order at placement
  await call('PUT', `/admin/orders/${o}/items/${item}/weight`, A, { weight_kg: 1.8 }, H);
  check('first weigh-in: 1 kg ordered, 1.8 kg packed → the extra 0.8 leaves stock', await one(`select stock_quantity::float from products where id = $1`, [vw2]), 99.2);
  check('first weigh-in: …and is written to the stock ledger', await one(`select coalesce(sum(delta), 0)::float from stock_movements where ref_order_id = $1`, [o]), -0.8);
  check('first weigh-in: bill follows the weight', await one(`select total_amount::float from orders where id = $1`, [o]), 1800);

  // ── Cancel after a partial refund ──────────────────────────────────────────
  o = await order('ready_for_pickup', { paid: 1000 });
  await sql(`insert into refunds (order_id, amount, reason) values ($1, 300, 'partial')`, [o]);
  await call('PUT', `/admin/orders/${o}/status`, A, { status: 'cancelled', reason: 'regression' }, H);
  check('cancel after a Rs 300 refund records Rs 700 more, not Rs 1000', await one(`select sum(amount)::float from refunds where order_id = $1`, [o]), 1000);

  o = await order('ready_for_pickup', { paid: 1000 });
  await sql(`insert into refunds (order_id, amount, reason) values ($1, 300, 'partial')`, [o]);
  await call('PUT', '/admin/orders/bulk-status', A, { order_ids: [o], status: 'cancelled', reason: 'regression bulk' }, H);
  check('bulk cancel of a paid order records the refund still owed (it recorded none before)', await one(`select sum(amount)::float from refunds where order_id = $1`, [o]), 1000);

  // ── The stock ledger records what really left ─────────────────────────────
  const thin = await product('RegThin', 'stock_quantity = 1, reserved_quantity = 2');
  o = await order('out_for_delivery');
  await sql(`update orders set stock_reserved = true where id = $1`, [o]);
  await sql(`insert into order_items (order_id, product_id, product_name, unit_price, quantity, total_price, unit, quality) values ($1, $2, 'Regression item', 500, 2, 1000, 'full', 'A')`, [o, thin]);
  await call('PUT', `/admin/orders/${o}/status`, A, { status: 'delivered' }, H);
  check('selling 2 when the books hold 1: stock stops at 0', await one(`select stock_quantity::float from products where id = $1`, [thin]), 0);
  check('…and the ledger says 1 left (not 2), so the watchdog sees no phantom drift', await one(`select sum(delta)::float from stock_movements where ref_order_id = $1 and reason = 'sale'`, [o]), -1);

  // ── Coupon history survives "delete" ──────────────────────────────────────
  let r = await call('DELETE', `/admin/coupons/${coupon}`, A, undefined, H);
  check('deleting a used coupon switches it off instead', `${r.status}/${r.data?.deactivated}`, '200/true');
  check('…its redemption history is still there', await one(`select count(*) from coupon_redemptions where coupon_id = $1`, [coupon]), 2 - 1);
  check('…and it can no longer be used', await one(`select is_active from coupons where id = $1`, [coupon]), false);
  const unused = (await call('POST', '/admin/coupons', A, { code: `REGU${TAG}`, discount_type: 'fixed', discount_value: 50, usage_limit: 5 }, H)).data?.id;
  r = await call('DELETE', `/admin/coupons/${unused}`, A, undefined, H);
  check('a never-used coupon is really deleted', `${r.data?.deactivated}/${await one('select count(*) from coupons where id = $1', [unused])}`, 'false/0');

  // ── Units a product is not sold in ────────────────────────────────────────
  if (C) {
    const piece = await product('RegMelon', `unit_type = 'piece'`);
    r = await call('POST', '/cart/add', C, { product_id: piece, quantity: 1, unit: 'half_kg', city_id: city });
    check('cart refuses "half kg" of a product sold per piece', r.status, 400);
    const kg = await product('RegOnion', `unit_type = 'kg', allow_half_kg = false`);
    r = await call('POST', '/cart/add', C, { product_id: kg, quantity: 1, unit: 'half_kg', city_id: city });
    check('cart refuses a half kg the admin switched off', r.status, 400);
    r = await call('POST', '/cart/add', C, { product_id: kg, quantity: 1, unit: 'quarter_kg', city_id: city });
    check('cart still accepts the quarter kg that is on', r.status, 200);
    r = await call('POST', '/cart/add', C, { product_id: kg, quantity: 1, unit: 'full', city_id: city });
    check('cart still accepts the full unit', r.status, 200);
  } else {
    console.log('SKIP cart unit checks — JWT_SECRET is not exported, cannot sign a customer token');
  }

  // ── Real orders still go through with the database rules of migration 63 on ─
  // (total adds up, paid ≤ total, stock ≥ 0). Placed through the real API so a
  // formula that disagrees with the rule would show up here as a 500.
  const adds = `abs(total_amount - greatest(0, coalesce(subtotal,0) + coalesce(delivery_charge,0) + coalesce(tax_amount,0) - coalesce(discount_amount,0) - coalesce(coupon_discount,0))) <= 0.05`;
  const slot = await one(`insert into time_slots (slot_name, start_time, end_time, status) values ($1, '00:00', '23:59', 'available') returning id`, [`Regression ${TAG}`]);
  const tomorrow = new Date(Date.now() + 29 * 3600 * 1000).toISOString().slice(0, 10); // Pakistan date + 1
  if (C) {
    const shop = await product('RegPotato', `unit_type = 'kg'`);
    const shopCode = `REGS${TAG}`;
    await call('POST', '/admin/coupons', A, { code: shopCode, discount_type: 'percentage', discount_value: 10 }, H);
    await call('DELETE', '/cart/clear', C);
    await sql(`delete from cart_items where cart_id in (select id from carts where user_id = $1)`, [cust]);
    await call('POST', '/cart/add', C, { product_id: shop, quantity: 3, unit: 'full', city_id: city });
    await call('POST', '/cart/add', C, { product_id: shop, quantity: 1, unit: 'half_kg', city_id: city });
    const applied = await call('POST', '/cart/apply-coupon', C, { code: shopCode, city_id: city });
    r = await call('POST', '/orders', C, { address_id: addr, city_id: city, time_slot_id: slot, requested_delivery_date: tomorrow, payment_method: 'cash_on_delivery' });
    check('consumer checkout (2 lines, 10 % coupon) is accepted', `${r.status}/${applied.status}`, '201/200');
    const placed = r.data?.id || r.data?.order?.id;
    if (placed) {
      row = (await sql(`select subtotal::float, coupon_discount::float, (${adds}) as adds_up from orders where id = $1`, [placed]))[0];
      check('…its total adds up (3 kg + ½ kg = 3500, 10 % off = 350)', `${row.subtotal}/${row.coupon_discount}/${row.adds_up}`, '3500/350/true');
      await call('PUT', `/admin/orders/${placed}/status`, A, { status: 'cancelled', reason: 'regression' }, H);
      check('…and cancelling it gives the reserved stock back', await one(`select reserved_quantity::float from products where id = $1`, [shop]), 0);
    }

    // A21: the cart changes (another phone) WHILE checkout runs. Fired together
    // eight times; every order that gets through must bill exactly its lines.
    const raceA = await product('RegRaceA', `unit_type = 'kg'`);
    const raceB = await product('RegRaceB', `unit_type = 'kg'`);
    const raced = [];
    const outcomes = [];
    for (let i = 0; i < 8; i++) {
      await call('DELETE', '/cart/clear', C);
      await call('POST', '/cart/add', C, { product_id: raceA, quantity: 1, unit: 'full', city_id: city });
      const [placedRace] = await Promise.all([
        call('POST', '/orders', C, { address_id: addr, city_id: city, time_slot_id: slot, requested_delivery_date: tomorrow, payment_method: 'cash_on_delivery' }),
        call('POST', '/cart/add', C, { product_id: raceB, quantity: 2, unit: 'full', city_id: city }),
      ]);
      outcomes.push(placedRace.status);
      const id = placedRace.data?.id || placedRace.data?.order?.id;
      if (id) raced.push(id);
    }
    const mismatched = raced.length
      ? await one(`select count(*) from orders o where o.id = any($1::uuid[])
                     and abs(o.subtotal - (select coalesce(sum(total_price), 0) from order_items i where i.order_id = o.id)) > 0.01`, [raced])
      : 0;
    check(`checkout racing a cart change: no order bills other than its lines (${raced.length} placed, statuses ${[...new Set(outcomes)].join('/')})`,
      `${Number(mismatched)}/${outcomes.every((s) => [201, 409, 400].includes(s))}/${raced.length > 0}`, '0/true/true');
    for (const id of raced) await call('PUT', `/admin/orders/${id}/status`, A, { status: 'cancelled', reason: 'regression' }, H);
  }
  const wa = await product('RegCarrot', `unit_type = 'kg'`);
  r = await call('POST', '/admin/whatsapp-orders', A, {
    whatsapp_number: `0304${TAG}`, customer_name: 'Regression WhatsApp', address_text: 'Regression street 1',
    items: [{ product_id: wa, quantity: 2, unit: 'full' }], time_slot_id: slot, requested_delivery_date: tomorrow,
  }, H);
  check('WhatsApp order placed by an admin is accepted', r.status, 201);
  if (r.data?.id) check('…its total adds up', await one(`select (${adds}) from orders where id = $1`, [r.data.id]), true);

  // ── Restaurant portal: honest stock, one order per press, its own slots ───
  await sql(`update categories set available_for_restaurants = true where id = $1`, [cat]);
  const rice = await product('RegRice', `unit_type = 'kg', available_for_restaurants = true, restaurant_price_a = 90, restaurant_enabled_a = true, stock_quantity = 10, reserved_quantity = 10`);
  const restPhone = `0305${TAG}`;
  r = await call('POST', '/restaurant/register', null, { business_name: `Regression Cafe ${TAG}`, phone: restPhone, pin: '4831', city_id: city, address: 'Regression road' });
  const restId = r.data?.id;
  await call('POST', `/admin/restaurants/${restId}/approve`, A, {}, H);
  const RT = (await call('POST', '/restaurant/login', null, { phone: restPhone, pin: '4831' })).data?.token;
  r = await call('GET', '/restaurant/products', RT);
  const listed = (Array.isArray(r.data) ? r.data : r.data?.products || []).find((p) => p.id === rice);
  check('restaurant catalogue shows what can be ordered (10 on hand, 10 reserved → 0)', listed ? Number(listed.stock_quantity ?? listed.stock ?? listed.stockQuantity) : 'not listed', 0);
  await sql(`update products set reserved_quantity = 0 where id = $1`, [rice]);
  const restSlot = await one(`insert into time_slots (slot_name, start_time, end_time, status, audience, is_free_delivery_slot) values ($1, '00:00', '23:59', 'available', 'restaurant', true) returning id`, [`Regression R ${TAG}`]);
  const restBody = { items: [{ product_id: rice, quantity: 2, unit: 'full', quality: 'A' }], time_slot_id: restSlot, requested_delivery_date: tomorrow };
  const presses = await Promise.all([1, 2, 3].map(() => call('POST', '/restaurant/orders', RT, restBody)));
  check('three identical restaurant orders sent at once create ONE order', await one(`select count(*) from orders where restaurant_id = $1`, [restId]), 1);
  check('…every press is answered with that same order', new Set(presses.map((x) => x.data?.id)).size, 1);
  check('…and stock is reserved once (2, not 6)', await one(`select reserved_quantity::float from products where id = $1`, [rice]), 2);
  r = await call('POST', '/restaurant/orders', RT, { ...restBody, items: [{ product_id: rice, quantity: 1, unit: 'full', quality: 'A' }] });
  check('a DIFFERENT order right afterwards is still accepted', `${r.status}/${await one('select count(*) from orders where restaurant_id = $1', [restId])}`, '201/2');

  if (C) {
    const dal = await product('RegDal', `unit_type = 'kg'`);
    await sql(`delete from cart_items where cart_id in (select id from carts where user_id = $1 and status = 'active')`, [cust]);
    await call('POST', '/cart/add', C, { product_id: dal, quantity: 2, unit: 'full', city_id: city });
    r = await call('POST', '/orders', C, { address_id: addr, city_id: city, time_slot_id: restSlot, requested_delivery_date: tomorrow, payment_method: 'cash_on_delivery' });
    check('a customer cannot book a restaurant-only (free delivery) slot', r.status, 400);

    // A coupon that stops being valid must not leave the checkout stuck.
    const deadCode = `REGD${TAG}`;
    const dead = (await call('POST', '/admin/coupons', A, { code: deadCode, discount_type: 'percentage', discount_value: 10 }, H)).data?.id;
    await call('POST', '/cart/apply-coupon', C, { code: deadCode, city_id: city });
    await sql(`update coupons set is_active = false where id = $1`, [dead]);
    const orderBody = { address_id: addr, city_id: city, time_slot_id: slot, requested_delivery_date: tomorrow, payment_method: 'cash_on_delivery' };
    r = await call('POST', '/orders', C, orderBody);
    check('checkout with a coupon that was switched off is refused once, with the reason', `${r.status}/${/removed from your cart/.test(r.body?.message || '')}`, '400/true');
    r = await call('POST', '/orders', C, orderBody);
    check('…and the next press goes through at the full price', `${r.status}/${Number(r.data?.coupon_discount ?? r.data?.order?.coupon_discount ?? 0)}`, '201/0');
  }

  // ── Copying a catalogue to a new city copies the list, not the goods ──────
  const newCity = (await call('POST', '/admin/cities', A, { name: `RegCity${TAG}`, province: 'Punjab' }, H)).data?.id;
  await sql(`update products set sku = $1 where id = $2`, [`REG-SKU-${TAG}`, rice]);
  // Columns the old import dropped, and a category tree listed child-first.
  const riceBefore = (await sql(`select price_b, allow_half_kg, is_variable_weight, restaurant_price_a, available_for_restaurants, stock_quantity_b from products where id = $1`, [rice]))[0];
  await sql(`update products set price_b = 111, allow_half_kg = false, is_variable_weight = true, restaurant_price_a = 222, available_for_restaurants = true, stock_quantity_b = 7 where id = $1`, [rice]);
  const tree = await sql(`select id, name_en from categories where city_id = $1 order by display_order, name_en limit 2`, [city]);
  if (tree.length === 2) await sql(`update categories set parent_id = $1 where id = $2`, [tree[1].id, tree[0].id]);
  r = await call('POST', '/admin/cities/import-catalog', A, { source_city_id: city, target_city_id: newCity }, H);
  check('catalogue import works even when a source product has a SKU', r.status, 200);
  check('…copied products start with no stock (any quality) and no SKU', await one(`select count(*) from products where city_id = $1 and (stock_quantity > 0 or stock_quantity_b > 0 or stock_quantity_c > 0 or sku is not null)`, [newCity]), 0);
  check('…and some products really were copied', Number(await one(`select count(*) from products where city_id = $1`, [newCity])) > 0, true);
  {
    const copy = (await sql(`select p.price_b, p.allow_half_kg, p.is_variable_weight, p.restaurant_price_a, p.available_for_restaurants, p.stock_quantity_b
                               from products p join products src on src.id = $1 where p.city_id = $2 and p.name_en = src.name_en`, [rice, newCity]))[0] || {};
    check('…with quality-B price, half-kg switch, variable weight and restaurant price/visibility (were dropped)',
      `${Math.round(copy.price_b)}/${copy.allow_half_kg}/${copy.is_variable_weight}/${Math.round(copy.restaurant_price_a)}/${copy.available_for_restaurants}/${Number(copy.stock_quantity_b)}`, '111/false/true/222/true/0');
    if (tree.length === 2) {
      const parent = await one(`select par.name_en from categories c join categories par on par.id = c.parent_id
                                 where c.city_id = $1 and c.name_en = $2 and par.city_id = $1`, [newCity, tree[0].name_en]);
      check('…and the category tree, pointing at the parent copied to the NEW city (was flattened)', parent, tree[1].name_en);
      await sql(`update categories set parent_id = null where id = $1`, [tree[0].id]);
    }
    await sql(`update products set price_b = $2, allow_half_kg = $3, is_variable_weight = $4, restaurant_price_a = $5, available_for_restaurants = $6, stock_quantity_b = $7 where id = $1`,
      [rice, riceBefore.price_b, riceBefore.allow_half_kg, riceBefore.is_variable_weight, riceBefore.restaurant_price_a, riceBefore.available_for_restaurants, riceBefore.stock_quantity_b]);
  }

  // ── Deletes that would destroy history (or fail with a 500) ───────────────
  {
    const usedSlot = await one(`select time_slot_id from orders where time_slot_id is not null limit 1`);
    const d = await call('DELETE', `/admin/settings/time-slots/${usedSlot}`, A, undefined, H);
    check('deleting a slot that orders used switches it off instead of a 500', `${d.status}/${d.data?.deactivated}`, '200/true');
    check('…the slot (and the orders that point at it) are still there, closed for booking', await one(`select status from time_slots where id = $1`, [usedSlot]), 'blocked');
    const freeSlot = await one(`insert into time_slots (slot_name, start_time, end_time, status) values ($1, '05:00', '06:00', 'available') returning id`, [`Regression unused ${TAG}`]);
    check('an unused slot is really deleted', `${(await call('DELETE', `/admin/settings/time-slots/${freeSlot}`, A, undefined, H)).status}/${await one('select count(*) from time_slots where id = $1', [freeSlot])}`, '200/0');
    check('a role that admins still hold cannot be deleted', (await call('DELETE', `/admin/roles/${role}`, A, undefined, H)).status, 409);
    check('…and its admin keeps the role', await one(`select admin_role_id from users where id = $1`, [mgrId]), role);
  }

  // ── Watchdog sees switched-off products ───────────────────────────────────
  const hidden = await product('RegHidden');
  await call('POST', '/admin/reconciliation/run', A, {}, H);
  await sql(`update products set is_active = false, stock_quantity = stock_quantity - 40 where id = $1`, [hidden]);
  r = await call('POST', '/admin/reconciliation/run', A, {}, H);
  check('watchdog reports stock that vanished from a switched-off product',
    (r.data?.summary?.stock_drift || []).filter((d) => d.product_id === hidden).length, 1);
  check('watchdog: all three database rules of migration 63 are switched on', JSON.stringify(r.data?.summary?.integrity), '[]');

  // ── Watchdog: OCP cash is "settled" only when the office CONFIRMED it (J6) ─
  // A settlement the OCP merely sent (pending) or one the office rejected used
  // to hide the overdue cash for ever.
  {
    const ocpId = await one(`insert into order_collection_points (name, phone, pin_hash, city_id) values ($1, $2, 'x', $3) returning id`,
      [`RegOCP ${TAG}`, `+92304${TAG}`, city]);
    const cashOrder = await order('delivered', { paid: 500, total: 500, subtotal: 500 });
    await sql(`update orders set ocp_id = $1, delivered_at = now() - interval '5 days' where id = $2`, [ocpId, cashOrder]);
    const settlement = await one(`insert into ocp_settlements (ocp_id, amount, status) values ($1, 500, 'pending') returning id`, [ocpId]);
    await sql(`insert into ocp_settlement_orders (settlement_id, order_id, amount) values ($1, $2, 500)`, [settlement, cashOrder]);
    const overdueFor = async () => {
      const run = await call('POST', '/admin/reconciliation/run', A, {}, H);
      return (run.data?.summary?.ocp?.overdue || []).filter((x) => x.ocp_id === ocpId).map((x) => x.due).join(',') || 'none';
    };
    check('watchdog: OCP cash with only a PENDING settlement is still overdue', await overdueFor(), '500');
    await sql(`update ocp_settlements set status = 'rejected' where id = $1`, [settlement]);
    check('…and with a REJECTED settlement too', await overdueFor(), '500');
    await sql(`update ocp_settlements set status = 'received', received_at = now() where id = $1`, [settlement]);
    check('…but not once the office has RECEIVED it', await overdueFor(), 'none');
  }
  let refused = 0;
  for (const bad of [
    `update products set stock_quantity = -1 where id = '${hidden}'`,
    `update orders set total_amount = total_amount + 500 where id = '${o}'`,
    `update orders set paid_amount = total_amount + 500 where id = '${o}'`,
  ]) { try { await sql(bad); } catch { refused++; } }
  check('the database itself refuses negative stock, a total that does not add up, and paid > total', refused, 3);

  // ── Malformed ids are the caller's mistake, not a server error ────────────
  const bad = 'not-a-uuid';
  const byId = [
    ['GET', `/admin/orders/${bad}`], ['PUT', `/admin/orders/${bad}/status`, { status: 'confirmed' }], ['DELETE', `/admin/orders/${bad}`],
    ['GET', `/admin/products/${bad}`], ['PUT', `/admin/products/${bad}`, { price: 5 }], ['DELETE', `/admin/products/${bad}`],
    ['PUT', `/admin/coupons/${bad}`, { code: 'X' }], ['DELETE', `/admin/coupons/${bad}`], ['GET', `/admin/customers/${bad}/addresses`],
    ['PUT', `/admin/restaurants/${bad}`, { admin_notes: 'x' }], ['DELETE', `/admin/categories/${bad}`], ['PUT', `/admin/ocp/${bad}`, { name: 'x' }],
    ['GET', `/admin/stock/${bad}/movements`], ['GET', `/finance/shareholders/${bad}/payouts`], ['PUT', `/admin/delivery-zones/${bad}`, { name: 'x' }],
  ];
  const fiveHundreds = [];
  for (const [m, p, b] of byId) { const x = await call(m, p, A, b, H); if (x.status >= 500) fiveHundreds.push(`${m} ${p}`); }
  check(`malformed id → 4xx on all ${byId.length} by-id endpoints`, fiveHundreds.join(', ') || 'none', 'none');

  // ── Price Manager can page through the whole catalogue in a stable order ──
  const p1 = await call('GET', '/admin/products?limit=2&page=1', A, undefined, H);
  const p2 = await call('GET', '/admin/products?limit=2&page=2', A, undefined, H);
  const ids = [...(p1.data || []), ...(p2.data || [])].map((x) => x.id);
  check('product pages do not repeat rows', new Set(ids).size, ids.length);

  // ── Money out needs a second admin (staff) ────────────────────────────────
  await sql(`delete from approval_value_log where admin_id = $1`, [mgrId]);
  // Owner's decision J1: without a code it is not refused any more — it waits
  // for the city admin, and nothing is booked until then.
  r = await call('POST', '/finance/expenses', M, { category: 'rent', amount: 500000 });
  check('staff: Rs 500,000 expense alone is not booked — it waits for approval (202)', `${r.status}/${r.data?.queued}`, '202/true');
  check('…nothing booked', Number(await one(`select count(*) from expenses where created_by = $1 and amount = 500000`, [mgrId])), 0);
  // Leave nothing waiting: a later run's "approve all" would book it.
  if (r.data?.request_id) await call('POST', `/admin/approvals/${r.data.request_id}/reject`, A, { reason: 'regression clean-up' });
  check('staff: Rs 1,800 expense alone is fine', (await call('POST', '/finance/expenses', M, { category: 'bags', amount: 1800 })).status, 200);
  check('staff: with a second admin it is accepted', (await call('POST', '/finance/expenses', M, { category: 'rent', amount: 40000, ...(await approver()) })).status, 200);
  check('owner is not asked for a co-signer', (await call('POST', '/finance/expenses', A, { category: 'rent', amount: 50000 }, H)).status, 200);
  check('staff: the approver\'s PASSWORD is refused — only a code from their own device works (Q7)',
    (await call('POST', '/finance/expenses', M, { category: 'rent', amount: 40000, approval_phone: '03001112222', approval_password: 'Admin12345' })).status, 400);

  // J3: the approver gives a code from their OWN phone instead of typing their password here.
  {
    const issued = await call('POST', '/admin/approval-codes', A, {}, H);
    const code = issued.data?.code;
    check('the owner can make a 6-digit approval code on their own device', `${issued.status}/${/^\d{6}$/.test(code || '')}`, '200/true');
    const withCode = { approval_phone: '03001112222', approval_password: code };
    check('staff: the approval code co-signs a big expense', (await call('POST', '/finance/expenses', M, { category: 'rent', amount: 30000, ...withCode })).status, 200);
    // A different entry with the same code (an identical repeat is stopped earlier, A34).
    check('…but only once', (await call('POST', '/finance/expenses', M, { category: 'rent', amount: 30000, comment: 'second use', ...withCode })).status, 400);
    const used = (await call('GET', '/admin/approval-codes', A, undefined, H)).data?.codes?.[0];
    check('…and the approver can see what it was used for and by whom', `${!!used?.used_at}/${used?.used_by_name}`, 'true/Regression Manager');
    const fresh = (await call('POST', '/admin/approval-codes', A, {}, H)).data?.code;
    const wrong = fresh === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await call('POST', '/finance/expenses', M, { category: 'rent', amount: 30000, approval_phone: '03001112222', approval_password: wrong });
    check('five wrong codes kill the code (even if those requests were refused)', (await call('POST', '/finance/expenses', M, { category: 'rent', amount: 30000, approval_phone: '03001112222', approval_password: fresh })).status, 400);
    const own = (await call('POST', '/admin/approval-codes', M)).data?.code;
    check('a staff admin can make a code too, but cannot approve their own action with it',
      (await call('POST', '/finance/expenses', M, { category: 'rent', amount: 30000, approval_phone: mgrPhone, approval_password: own })).status, 400);
  }
  const worker = (await call('POST', '/finance/workers', M, { name: `Regression Worker ${TAG}`, basic_salary: 20000 })).data?.id;
  check('staff: salary far above the basic salary is refused', (await call('POST', `/finance/workers/${worker}/pay`, M, { amount: 300000, category: 'salary', ...(await approver()) })).status, 400);
  check('staff: normal salary with a second admin is paid', (await call('POST', `/finance/workers/${worker}/pay`, M, { amount: 20000, category: 'salary', ...(await approver()) })).status, 200);
  check('staff: the same salary again this month is refused', (await call('POST', `/finance/workers/${worker}/pay`, M, { amount: 20000, category: 'salary', ...(await approver()) })).status, 400);

  // ── Price cut limit ───────────────────────────────────────────────────────
  const priced = await product('RegApple');
  check('staff: price 1000 → 1 is refused', (await call('PUT', `/admin/products/${priced}`, M, { price: 1 })).status, 400);
  check('staff: price 1000 → 700 is allowed', (await call('PUT', `/admin/products/${priced}`, M, { price: 700 })).status, 200);
  await new Promise((res) => setTimeout(res, 400)); // the audit row is written after the response
  check('staff: …but 700 → 490 the same day is refused (more than 40 % below the day\'s 1000)', (await call('PUT', `/admin/products/${priced}`, M, { price: 490 })).status, 400);
  check('staff: 700 → 650 is still fine', (await call('PUT', `/admin/products/${priced}`, M, { price: 650 })).status, 200);
  await new Promise((res) => setTimeout(res, 500));
  const log = await sql(`select resource, old_data->>'price' as old, new_data->>'price' as new from audit_logs where resource_id = $1 and status = 'success' order by created_at`, [priced]);
  check('audit log names the record and keeps old → new price', log.map((l) => `${l.resource}:${Math.round(l.old)}>${l.new}`).join(' '), 'products:1000>700 products:700>650');

  // ── Who took the cash / who cancelled ─────────────────────────────────────
  o = await order('out_for_delivery');
  await call('PUT', `/admin/orders/${o}/status`, M, { status: 'delivered' });
  check('office "delivered" with no rider records who took the cash', await one(`select cash_received_by from orders where id = $1`, [o]), mgrId);
  o = await order('ready_for_pickup');
  await call('PUT', `/admin/orders/${o}/status`, M, { status: 'cancelled', reason: 'regression' });
  check('admin cancel records who cancelled', await one(`select cancelled_by from orders where id = $1`, [o]), mgrId);

  // ── Stock purchase names its seller; the bill is kept (J4) ─────────────────
  {
    const bought = await product('RegBought', `unit_type = 'kg'`);
    const body = { product_id: bought, raw_weight: 10, purchase_price: 1500, grade_a: 8, grade_b: 1, grade_c: 0, waste: 1 };
    r = await call('POST', '/finance/stock-purchase', A, body, H);
    check('a purchase without the seller\'s name is refused', `${r.status}/${/bought from/.test(r.body?.message || '')}`, '400/true');
    r = await call('POST', '/finance/stock-purchase', A, { ...body, supplier_name: 'Reg Mandi Traders', supplier_phone: '03001234567', bill_number: 'P-77' }, H);
    check('…with it, the purchase is recorded', r.status, 200);
    const sp = (await sql(`select supplier_name, supplier_phone, bill_number from stock_purchases where product_id = $1`, [bought]))[0] || {};
    check('…and the seller and bill number are stored', `${sp.supplier_name}/${sp.bill_number}`, 'Reg Mandi Traders/P-77');
    if (!process.env.SUPABASE_URL) {
      const fd = new FormData();
      for (const [k, v] of Object.entries({ ...body, supplier_name: 'Reg Mandi Traders' })) fd.append(k, String(v));
      fd.append('bill_photo', new Blob([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')], { type: 'image/png' }), 'bill.png');
      const up = await fetch(`${API}/finance/stock-purchase`, { method: 'POST', headers: { Authorization: `Bearer ${A}`, ...H }, body: fd });
      check('a bill photo with file storage not set up is refused (no purchase saved without its bill)', `${up.status}/${await one(`select count(*) from stock_purchases where product_id = $1`, [bought])}`, '503/1');
    }
  }

  // ── Reporting a review (App Store 1.2: other people's content can be reported) ─
  if (JWT_SECRET) {
    const reviewed = await product('RegReviewed');
    const review = await one(
      `insert into reviews (user_id, target_type, product_id, city_id, rating, comment, is_published) values ($1, 'product', $2, $3, 5, 'Regression review', true) returning id`,
      [cust, reviewed, city]
    );
    const reporters = [];
    for (let i = 0; i < 3; i++) {
      const ph = `+92305${TAG}${i}`;
      const uid = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'Reporter', 'customer', true) returning id`, [ph]);
      reporters.push(jwt.sign({ userId: uid, phone: ph, role: 'customer', type: 'access' }, JWT_SECRET, { expiresIn: '15m' }));
    }
    check('a customer cannot report their own review', (await call('POST', `/reviews/${review}/report`, C, { reason: 'spam' })).status, 400);
    r = await call('POST', `/reviews/${review}/report`, reporters[0], { reason: 'offensive' });
    check('another customer can report it', `${r.status}/${r.data?.reported}`, '200/true');
    r = await call('POST', `/reviews/${review}/report`, reporters[0], { reason: 'offensive' });
    check('…once (a repeat is "already reported", not a second report)', `${r.status}/${r.data?.alreadyReported}`, '200/true');
    let listed = (await call('GET', '/admin/reviews?reported=true', A, undefined, H)).data?.reviews?.find((x) => x.id === review);
    check('admin sees it among reported reviews with its count', listed?.reportCount, 1);
    await call('POST', `/reviews/${review}/report`, reporters[1], {});
    await call('POST', `/reviews/${review}/report`, reporters[2], {});
    check('three different reports hide the review until an admin looks', await one(`select is_published from reviews where id = $1`, [review]), false);
    check('…and its product rating no longer counts it', await one(`select review_count from products where id = $1`, [reviewed]), 0);
    await call('PUT', `/admin/reviews/${review}`, A, { isPublished: true }, H);
    listed = (await call('GET', '/admin/reviews', A, undefined, H)).data?.reviews?.find((x) => x.id === review);
    check('admin re-publishing it clears the open reports', `${listed?.isPublished}/${listed?.reportCount}`, 'true/0');
  }

  // ── The corruption audit is the owner's alone ─────────────────────────────
  const auditPaths = [['GET', '/admin/corruption-audit/settings'], ['PUT', '/admin/corruption-audit/settings'], ['POST', '/admin/corruption-audit/run'],
    ['GET', '/admin/corruption-audit/runs'], ['GET', '/admin/corruption-audit/cash'], ['POST', '/admin/corruption-audit/cash-handovers']];
  const codes = [];
  for (const [m, p] of auditPaths) codes.push((await call(m, p, M, m === 'GET' ? undefined : { from: '2026-11-01', to: '2026-11-02' })).status);
  check('staff admin with every permission gets 403 on the audit endpoints', [...new Set(codes)].join(','), '403');
  check('the owner can open the audit', (await call('GET', '/admin/corruption-audit/settings', A, undefined, H)).status, 200);

  // ── Upload limits (were 500 on every route except addresses) ──────────────
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  const upload = async (field, bytes, type, name) => {
    const fd = new FormData();
    fd.append('name_en', `RegUpload ${TAG}`);
    fd.append(field, new Blob([bytes], { type }), name);
    return (await fetch(`${API}/admin/products`, { method: 'POST', headers: { Authorization: `Bearer ${A}` }, body: fd })).status;
  };
  check('a 6 MB picture is 413 (was 500)', await upload('images', Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]), 'image/png', 'big.png'), 413);
  check('a non-image file is 400 (was 500)', await upload('images', Buffer.from('MZ'), 'application/x-msdownload', 'a.exe'), 400);
  check('a picture under the wrong field name is 400 (was 500)', await upload('photo', PNG, 'image/png', 'x.png'), 400);
  if (!process.env.SUPABASE_URL) {
    check('with file storage not set up, a picture is refused 503 (was silently dropped)', await upload('images', PNG, 'image/png', 'x.png'), 503);
    check('…and no half-saved product is left behind', await one(`select count(*) from products where name_en = $1`, [`RegUpload ${TAG}`]), 0);
  }

  // ── Security round 5 (15 Nov): nothing echoed / leaked, no account probing ─
  r = await call('PUT', '/auth/change-password', C, { currentPassword: 'whatever1A', newPassword: 'q1x' });
  check('security: a rejected new password is not echoed back (was in the reply and the log)', r.status === 422 && !JSON.stringify(r.body).includes('q1x'), true);
  r = await call('GET', '/nothing-here?phone=03001234567&password=Hunter22x');
  check('security: a 404 does not repeat the query string', r.status === 404 && !JSON.stringify(r.body).includes('Hunter22x'), true);
  if (JWT_SECRET) {
    const hs512 = jwt.sign({ userId: cust, phone: custPhone, role: 'customer', type: 'access' }, JWT_SECRET, { algorithm: 'HS512', expiresIn: '5m' });
    check('security: a token signed with another algorithm is refused (HS256 only)', (await call('GET', '/auth/me', hs512)).status, 401);
  }
  const pendPhone = `0306${TAG}`;
  await call('POST', '/restaurant/register', null, { business_name: `Pending Cafe ${TAG}`, phone: pendPhone, pin: '5718', city_id: city, address: 'Pending road' });
  check('security: a wrong PIN on a pending restaurant says only "invalid" (status was told to anyone)', (await call('POST', '/restaurant/login', null, { phone: pendPhone, pin: '0000' })).status, 401);
  check('…the right PIN still hears "under review"', (await call('POST', '/restaurant/login', null, { phone: pendPhone, pin: '5718' })).status, 403);
  const ocpPhone = `0307${TAG}`;
  await sql(`insert into order_collection_points (name, phone, pin_hash, city_id, status) values ($1, $2, $3, $4, 'disabled')`,
    [`Disabled OCP ${TAG}`, `+92${ocpPhone.slice(1)}`, bcrypt.hashSync('2468', 4), city]);
  check('security: a wrong PIN on a disabled OCP says only "invalid"', (await call('POST', '/ocp/login', null, { phone: ocpPhone, pin: '1111' })).status, 401);
  check('…the right PIN hears "disabled"', (await call('POST', '/ocp/login', null, { phone: ocpPhone, pin: '2468' })).status, 403);

  // ── Admin session in HttpOnly cookies (owner decision Q2) ────────────────────
  // The panel asks for it with X-Client-Platform: admin-cookie. Skipped when
  // the API under test has admin cookies switched off (ADMIN_AUTH_COOKIES).
  {
    const raw = (method, urlPath, { cookie, platform = 'admin-cookie', body } = {}) => fetch(API + urlPath, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Client-Platform': platform, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const jar = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
    let res = await raw('POST', '/admin/login', { body: { phone: '03001112222', password: 'Admin12345', otp: OTP } });
    const loginBody = await res.json();
    const setCookies = res.headers.getSetCookie();
    if (loginBody?.data?.tokens) {
      console.log('SKIP admin cookie session (ADMIN_AUTH_COOKIES is off on this API)');
    } else {
      const session = jar(res);
      check('admin cookies: login answers with HttpOnly cookies and no token in the body',
        setCookies.filter((c) => /^admin_(token|refresh)=/.test(c) && /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c) && !/Domain=/i.test(c)).length, 2);
      check('admin cookies: the cookie signs the panel in', (await raw('GET', '/admin/dashboard', { cookie: session })).status, 200);
      check('admin cookies: the same cookie is ignored without the cookie-mode header', (await raw('GET', '/admin/dashboard', { cookie: session, platform: 'admin' })).status, 401);
      check('admin cookies: …and is never accepted as a customer / website session', (await raw('GET', '/auth/me', { cookie: session, platform: 'website' })).status, 401);
      res = await raw('POST', '/auth/refresh', { cookie: session, body: {} });
      const refreshed = await res.json();
      const session2 = jar(res);
      check('admin cookies: refresh rotates the cookies and still shows no token', res.status === 200 && !refreshed?.data?.tokens && /admin_token=/.test(session2) && /admin_refresh=/.test(session2), true);
      check('admin cookies: the old refresh cookie is dead after rotation', (await raw('POST', '/auth/refresh', { cookie: session, body: {} })).status, 401);
      res = await raw('POST', '/auth/logout', { cookie: session2, body: {} });
      check('admin cookies: logout clears both cookies', res.headers.getSetCookie().filter((c) => /^admin_(token|refresh)=;/.test(c)).length, 2);
      check('admin cookies: …and the session cannot be renewed afterwards', (await raw('POST', '/auth/refresh', { cookie: session2, body: {} })).status, 401);
    }
  }

  // ── Staff purchases wait for the city admin (owner decision J1) ─────────────
  {
    const staffPhone = `0310${TAG}`;
    const staffRole = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`Regression Purchaser ${TAG}`, city]);
    await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions where code = 'finance.stock_purchase.create'`, [staffRole]);
    const staffId = await one(
      `insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified)
       values ($1, 'Regression Purchaser', 'admin', $2, $3, true) returning id`,
      [`+92${staffPhone.slice(1)}`, bcrypt.hashSync('Staff12345', 10), staffRole]
    );
    await sql(`insert into admins (user_id) values ($1)`, [staffId]);
    const ST = (await adminLogin(staffPhone, 'Staff12345')).token;
    const p1 = await product('RegBuy1', `stock_quantity = 10`);
    const p2 = await product('RegBuy2', `stock_quantity = 10`);
    const buy = (token, pid, kg) => call('POST', '/finance/stock-purchase', token, {
      product_id: pid, raw_weight: kg, purchase_price: 500, grade_a: kg, grade_b: 0, grade_c: 0, waste: 0, supplier_name: 'Mandi seller',
    }, H);
    const stock = (pid) => one(`select stock_quantity from products where id = $1`, [pid]);
    const buys = (pid) => one(`select count(*) from stock_purchases where product_id = $1`, [pid]);

    let b1 = await buy(ST, p1, 5);
    const req1 = b1.data?.id;
    check('purchase approval: staff entry is accepted as PENDING', b1.data?.status, 'pending');
    check('…stock is unchanged and no ledger row exists yet', `${Number(await stock(p1))}:${await buys(p1)}`, '10:0');
    const b2 = await buy(ST, p2, 7);
    const req2 = b2.data?.id;
    check('purchase approval: staff cannot approve (403)', (await call('POST', `/finance/purchase-requests/${req1}/approve`, ST, {}, H)).status, 403);
    check('purchase approval: staff sees their own pending entries', ((await call('GET', '/finance/purchase-requests', ST, undefined, H)).data?.requests || []).length >= 2, true);
    check('purchase approval: the city admin sees the queue', ((await call('GET', '/finance/purchase-requests', M, undefined, H)).data?.requests || []).some((x) => x.id === req1), true);
    const ap = await call('POST', `/finance/purchase-requests/${req1}/approve`, M, {}, H);
    check('purchase approval: the city admin approves ONE', ap.status, 200);
    check('…stock grows and the ledger row exists', `${Number(await stock(p1))}:${await buys(p1)}`, '15:1');
    check('…the other is still waiting', `${Number(await stock(p2))}`, '10');
    check('purchase approval: approving twice is refused (409)', (await call('POST', `/finance/purchase-requests/${req1}/approve`, M, {}, H)).status, 409);
    const b3 = await buy(M, p1, 2);
    check('purchase approval: an approver\'s own entry applies at once', `${b3.status}:${Number(await stock(p1))}`, '200:17');
    const rj = await buy(ST, p2, 1);
    check('purchase approval: a reject changes nothing', `${(await call('POST', `/finance/purchase-requests/${rj.data?.id}/reject`, M, { reason: 'price too high' }, H)).status}:${Number(await stock(p2))}`, '200:10');
    const all = await call('POST', '/finance/purchase-requests/approve-all', M, {}, H);
    check('purchase approval: APPROVE ALL applies every pending one', all.data?.approved >= 1 && Number(await stock(p2)) === 17, true);
    check('…and the queue is empty afterwards', ((await call('GET', '/finance/purchase-requests', M, undefined, H)).data?.requests || []).filter((x) => [req1, req2, rj.data?.id].includes(x.id)).length, 0);
  }

  // ── The cart belongs to the account (owner decision Q5) ─────────────────────
  // A second device reads the saved cart (with each line's city) and fetches
  // those products, as sold now, by id.
  if (C) {
    const cartA = await product('RegCartA');
    const cartB = await product('RegCartB', `price = 250`);
    const hidden = await product('RegCartHidden', `is_active = false`);
    r = await call('POST', '/cart/sync', C, { city_id: city, items: [{ product_id: cartA, quantity: 2 }, { product_id: cartB, quantity: 1, unit: 'full' }] });
    check('saved cart: the first device saves it', r.status, 200);
    r = await call('GET', '/cart', C);
    const savedLines = r.data?.items || [];
    check('saved cart: a second device reads the same lines, each with its city',
      savedLines.map((l) => `${l.product_id}:${Number(l.quantity)}:${l.city_id}`).sort().join('|'),
      [`${cartA}:2:${city}`, `${cartB}:1:${city}`].sort().join('|'));
    r = await call('GET', `/products?ids=${cartA},${cartB},${hidden}&city_id=${city}&limit=100`);
    check('saved cart: the products come back by id — one no longer sold is left out',
      (r.data || []).map((p) => p.id).sort().join('|'), [cartA, cartB].sort().join('|'));
    check('saved cart: …with the price as it is now', Number((r.data || []).find((p) => p.id === cartB)?.price), 250);
    check('saved cart: a malformed id list is refused (422), not run as a query', (await call('GET', `/products?ids=abc;drop&city_id=${city}`)).status, 422);
    await call('DELETE', '/cart/clear', C);
    check('saved cart: emptied on one device = empty for the next', ((await call('GET', '/cart', C)).data?.items || []).length, 0);
  }

  // ── Deleting an account asks for the PIN again (owner decision Q9) ─────────
  if (JWT_SECRET) {
    const delPhone = `+92308${TAG}`;
    const delUser = await one(`insert into users (phone, full_name, role, is_phone_verified, pin_hash, pin_set_at) values ($1, 'Delete Me', 'customer', true, $2, now()) returning id`,
      [delPhone, bcrypt.hashSync('7391', 4)]);
    const D = jwt.sign({ userId: delUser, phone: delPhone, role: 'customer', type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
    check('delete account: refused without the PIN', (await call('POST', '/auth/delete-account', D, {})).status, 400);
    check('delete account: refused with a wrong PIN', (await call('POST', '/auth/delete-account', D, { pin: '0000' })).status, 400);
    check('…and the account is still there', await one(`select status from users where id = $1`, [delUser]), 'active');
    check('delete account: done with the right PIN', (await call('POST', '/auth/delete-account', D, { pin: '7391' })).status, 200);
    check('…and the account is anonymised', await one(`select status || ':' || full_name from users where id = $1`, [delUser]), 'deleted:Deleted User');

    const susPhone = `0309${TAG}`;
    await sql(`insert into users (phone, full_name, role, is_phone_verified, pin_hash, pin_set_at, status) values ($1, 'Suspended', 'customer', true, $2, now(), 'suspended')`,
      [`+92${susPhone.slice(1)}`, bcrypt.hashSync('5566', 4)]);
    check('PIN login: a wrong PIN on a suspended account says only "invalid" (status was told to anyone)', (await call('POST', '/auth/verify-pin', null, { phone: susPhone, pin: '0000' })).status, 401);
    check('…the right PIN hears "suspended"', (await call('POST', '/auth/verify-pin', null, { phone: susPhone, pin: '5566' })).status, 403);
  }

  // ── Shareholder payouts: once per period, never twice at once (A26, round 6) ─
  // Paying last month's share in this month was never counted against last
  // month, so the same share could be paid again and again; and five presses
  // at once went through twice.
  {
    const shCity = await one(`insert into service_cities (name, province) values ($1, 'Punjab') returning id`, [`RegShare${TAG}`]);
    const SH = { 'X-City-Id': shCity };
    const pkNow = new Date(Date.now() + 5 * 3600 * 1000);
    const prev = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth() - 1, 10, 8));
    const pm = prev.getUTCMonth() + 1;
    const py = prev.getUTCFullYear();
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const delivered = (at, total) => one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount,
                           delivery_address_snapshot, city_id, delivered_at)
       values ('RG' || floor(random() * 1e9)::text, $1, $2, 'delivered', $3, 0, $3, 'cash_on_delivery', 'completed', $3, '{}'::jsonb, $4, $5) returning id`,
      [cust, addr, total, shCity, at]
    );
    await delivered(prev.toISOString(), 10000);
    await delivered(new Date().toISOString(), 20000);
    const sid = (await call('POST', '/finance/shareholders', A, { name: 'Reg Holder', email: `reg${TAG}@example.com`, password: 'Holder123', share_percent: 50 }, SH)).data?.id;
    const lastMonth = `month=${pm}&year=${py}`;
    const view = async (qs) => (await call('GET', `/finance/profit?${qs}`, A, undefined, SH)).data?.shareholders?.find((s) => s.id === sid);
    check('shareholder: last month\'s share is half of Rs 10,000', (await view(lastMonth))?.share, 5000);
    check('shareholder: last month\'s share can be paid this month', (await call('POST', `/finance/shareholders/${sid}/pay?${lastMonth}`, A, { amount: 5000 }, SH)).status, 200);
    check('shareholder: …but not a second time (it could be paid again and again)', (await call('POST', `/finance/shareholders/${sid}/pay?${lastMonth}`, A, { amount: 4999 }, SH)).status, 400);
    check('shareholder: …nor as one day inside that month', (await call('POST', `/finance/shareholders/${sid}/pay?date=${py}-${pad(pm)}-10`, A, { amount: 1 }, SH)).status, 400);
    check('shareholder: the payout records the period it pays for',
      await one(`select period_start::text || '..' || period_end::text from shareholder_payouts where shareholder_id = $1`, [sid]).catch(() => 'no period column'),
      `${py}-${pad(pm)}-01..${py}-${pad(pm)}-${pad(lastDay)}`);
    const shown = await view(lastMonth);
    check('shareholder: the profit page shows it under last month (pending, nothing left to pay)', `${shown?.pending}/${shown?.balance}`, '5000/0');
    check('shareholder: a month without a year is refused (was paid against all-time profit)', (await call('POST', `/finance/shareholders/${sid}/pay?month=${pm}`, A, { amount: 1 }, SH)).status, 400);
    const share = (await view('period=month'))?.share;
    const burst = await Promise.all([1, 2, 3, 4, 5].map(() => call('POST', `/finance/shareholders/${sid}/pay?period=month`, A, { amount: share }, SH)));
    check('shareholder: this month\'s payout pressed 5 times at once is paid once', burst.filter((x) => x.status === 200).length, 1);
    check('shareholder: …and nothing failed with a server error', burst.filter((x) => x.status >= 500).length, 0);
    check('shareholder: in total exactly both shares were paid', Number(await one(`select coalesce(sum(amount), 0) from shareholder_payouts where shareholder_id = $1`, [sid])), 5000 + share);
  }

  // ── OCPs stay inside their city (B27, round 6) ──────────────────────────────
  // An admin of another city could create an OCP in this city (with a PIN they
  // chose), delete one, send it stock requests and list every city's OCPs.
  {
    const otherCity = await one(`insert into service_cities (name, province) values ($1, 'Punjab') returning id`, [`RegOcpB${TAG}`]);
    const otherRole = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`Regression OCP B ${TAG}`, otherCity]);
    await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions`, [otherRole]);
    const bPhone = `0301${TAG}`;
    const bId = await one(
      `insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ($1, 'Regression City B', 'admin', $2, $3, true) returning id`,
      [`+92${bPhone.slice(1)}`, bcrypt.hashSync('Manager123', 10), otherRole]
    );
    await sql(`insert into admins (user_id) values ($1)`, [bId]);
    const B = (await adminLogin(bPhone, 'Manager123')).token;
    const ocpA = (await call('POST', '/admin/ocp', A, { name: `Reg OCP A ${TAG}`, phone: `0302${TAG}`, pin: '4826', city_id: city }, H)).data?.id;
    const stockProduct = await product('RegOcpStock');

    r = await call('POST', '/admin/ocp', B, { name: `Reg planted OCP ${TAG}`, phone: `0303${TAG}`, pin: '4826', city_id: city });
    check('OCP: another city\'s admin cannot create an OCP in this city (was 201, with their own PIN)', r.status, 403);
    check('OCP: …and none was made', Number(await one(`select count(*) from order_collection_points where name = $1`, [`Reg planted OCP ${TAG}`])), 0);
    const listB = (await call('GET', '/admin/ocp', B)).data || [];
    check('OCP: another city\'s admin does not see this city\'s OCPs (name, phone, address)', listB.some((o) => o.id === ocpA), false);
    check('OCP: another city\'s admin cannot send it a stock request', (await call('POST', `/admin/ocp/${ocpA}/stock-requests`, B, { items: [{ product_id: stockProduct, quality: 'A', quantity: 1 }] })).status, 404);
    check('OCP: …nor read its stock requests', (await call('GET', `/admin/ocp/${ocpA}/stock-requests`, B)).status, 404);
    check('OCP: another city\'s admin cannot delete it (was 200)', (await call('DELETE', `/admin/ocp/${ocpA}`, B)).status, 404);
    check('OCP: …and it is still there', await one(`select deleted_at is null from order_collection_points where id = $1`, [ocpA]), true);

    const ownB = await call('POST', '/admin/ocp', B, { name: `Reg OCP B ${TAG}`, phone: `0315${TAG}`, pin: '4826' });
    check('OCP: a city admin creates one in their own city (city taken from their role)', `${ownB.status}/${await one(`select city_id from order_collection_points where id = $1`, [ownB.data?.id]).catch(() => null) === otherCity}`, '201/true');
    check('OCP: …sees it', ((await call('GET', '/admin/ocp', B)).data || []).some((o) => o.id === ownB.data?.id), true);
    check('OCP: the owner (super admin) still sees every city\'s OCPs', ((await call('GET', '/admin/ocp', A)).data || []).filter((o) => o.id === ocpA || o.id === ownB.data?.id).length, 2);
    check('OCP: …and still sends stock requests in this city', (await call('POST', `/admin/ocp/${ocpA}/stock-requests`, A, { items: [{ product_id: stockProduct, quality: 'A', quantity: 1 }] }, H)).status, 201);
    check('OCP: a city admin deletes their own', (await call('DELETE', `/admin/ocp/${ownB.data?.id}`, B)).status, 200);
  }

  // ── Settings that apply to every city are the owner's (B28, round 6) ────────
  {
    const before = await one(`select value from site_settings where key = 'restaurant_delivery_base_charge' and city_id is null`);
    const platformWide = [
      ['POST', '/admin/cities', { name: `RegPlanted${TAG}`, province: 'Punjab' }, 'add a city'],
      ['PUT', '/admin/restaurants/settings', { base_charge: 1 }, 'change restaurant delivery charges'],
      ['PUT', '/admin/settings/business-hours', { hours: [{ day: 'Monday', open: '09:00', close: '21:00', is_open: true }] }, 'change business hours'],
      ['PUT', '/admin/site-settings/app-widget', { enabled: false }, 'change the app widget'],
      ['PUT', '/admin/work-as-rider', { intro: 'Planted' }, 'change the Work as Rider page'],
    ];
    for (const [m, p, body, what] of platformWide) {
      check(`settings: a city admin cannot ${what} for every city (was 200)`, (await call(m, p, M, body)).status, 403);
    }
    check('settings: …no city was planted', Number(await one(`select count(*) from service_cities where name = $1`, [`RegPlanted${TAG}`])), 0);
    check('settings: …restaurant charge unchanged', await one(`select value from site_settings where key = 'restaurant_delivery_base_charge' and city_id is null`), before);
    check('settings: business hours with no list are refused (they were wiped and the page broke)', (await call('PUT', '/admin/settings/business-hours', A, {})).status, 400);
    check('settings: …a made-up day or time is refused', (await call('PUT', '/admin/settings/business-hours', A, { hours: [{ day: 'Funday', open: '25:00', close: '21:00', is_open: true }] })).status, 400);
    const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({ day, open: '08:30', close: '22:00', is_open: day !== 'Friday' }));
    check('settings: the owner saves a full week', (await call('PUT', '/admin/settings/business-hours', A, { hours: week })).status, 200);
    const back = (await call('GET', '/admin/settings/business-hours', A)).data || [];
    check('settings: …and reads it back', `${back.length}/${back.find((d) => d.day === 'Friday')?.is_open}/${back[0]?.open}`, '7/false/08:30');
  }

  // ── No account deletion while an order is on its way (A27, B30, round 6) ─────
  // A customer could delete the account with an order being prepared — the
  // order stayed, with no name or phone for the rider; a restaurant's delete
  // wiped the delivery address of its open orders; and a restaurant session
  // alone (no PIN) could delete the restaurant.
  if (JWT_SECRET) {
    const phone = `+92318${TAG}`;
    const u = await one(`insert into users (phone, full_name, role, is_phone_verified, pin_hash, pin_set_at) values ($1, 'Busy Customer', 'customer', true, $2, now()) returning id`,
      [phone, bcrypt.hashSync('2468', 4)]);
    const uAddr = await one(`insert into addresses (user_id, written_address, city) values ($1, 'Busy house', 'Gujrat') returning id`, [u]);
    const U = jwt.sign({ userId: u, phone, role: 'customer', type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
    const open = await one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id)
       values ('RG' || floor(random() * 1e9)::text, $1, $2, 'confirmed', 500, 0, 500, 'cash_on_delivery', 'pending', '{}'::jsonb, $3) returning id`, [u, uAddr, city]);
    r = await call('POST', '/auth/delete-account', U, { pin: '2468' });
    check('delete account: refused while an order is being prepared (409, says why)', `${r.status}/${/order/i.test(r.body?.message || '')}`, '409/true');
    check('…the account and its phone are kept for the rider', await one(`select status || ':' || phone from users where id = $1`, [u]), `active:${phone}`);
    await sql(`update orders set status = 'cancelled' where id = $1`, [open]);
    const atta = await one(`insert into atta_requests (request_number, user_id, address_id, wheat_quantity_kg, total_amount, status) values ($1, $2, $3, 10, 100, 'milling') returning id`,
      [`RGATTA${TAG}`, u, uAddr]);
    check('delete account: refused while wheat is at the mill', (await call('POST', '/auth/delete-account', U, { pin: '2468' })).status, 409);
    await sql(`update atta_requests set status = 'delivered' where id = $1`, [atta]);
    check('delete account: allowed once nothing is open', (await call('POST', '/auth/delete-account', U, { pin: '2468' })).status, 200);

    const rPhone = `0319${TAG}`;
    const reg = await call('POST', '/restaurant/register', null, { business_name: `Reg Busy Dhaba ${TAG}`, phone: rPhone, pin: '1357', city_id: city, address: 'Reg road' });
    await call('POST', `/admin/restaurants/${reg.data?.id}/approve`, A, {}, H);
    const RT = (await call('POST', '/restaurant/login', null, { phone: rPhone, pin: '1357' })).data?.token;
    const rOrder = await one(
      `insert into orders (order_number, restaurant_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id)
       values ('RG' || floor(random() * 1e9)::text, $1, 'out_for_delivery', 800, 0, 800, 'cash_on_delivery', 'pending', $2::jsonb, $3) returning id`,
      [reg.data?.id, JSON.stringify({ written_address: 'Reg road 12', business_name: `Reg Busy Dhaba ${TAG}` }), city]);
    check('restaurant delete: the session alone is not enough — PIN asked (was 200)', (await call('POST', '/restaurant/delete-account', RT, {})).status, 400);
    check('restaurant delete: a wrong PIN is refused', (await call('POST', '/restaurant/delete-account', RT, { pin: '0000' })).status, 400);
    r = await call('POST', '/restaurant/delete-account', RT, { pin: '1357' });
    check('restaurant delete: refused while an order is on its way (409)', r.status, 409);
    check('…the rider still has the delivery address (it was wiped)', await one(`select delivery_address_snapshot->>'written_address' from orders where id = $1`, [rOrder]), 'Reg road 12');
    check('restaurant delete by phone + PIN: refused too', (await call('POST', '/restaurant/delete-account-by-pin', null, { phone: rPhone, pin: '1357' })).status, 409);
    await sql(`update orders set status = 'delivered', delivered_at = now() where id = $1`, [rOrder]);
    check('restaurant delete: allowed with the PIN once nothing is open', (await call('POST', '/restaurant/delete-account', RT, { pin: '1357' })).status, 200);
    check('…and the closed order\'s address is anonymised', await one(`select coalesce(delivery_address_snapshot->>'written_address', '') from orders where id = $1`, [rOrder]), '');
  }

  // ── Atta: cancel only before the wheat is picked up (A28, round 6) ───────────
  if (C) {
    const attaReq = (status) => one(
      `insert into atta_requests (request_number, user_id, address_id, wheat_quantity_kg, total_amount, status) values ('RGA' || floor(random() * 1e9)::text, $1, $2, 10, 100, $3) returning id`,
      [cust, addr, status]);
    for (const s of ['picked_up', 'milling', 'ready_for_delivery']) {
      const a = await attaReq(s);
      check(`atta: the customer cannot cancel once the wheat is ${s} (was 200)`, `${(await call('PUT', `/atta-requests/${a}/cancel`, C, {})).status}/${await one(`select status from atta_requests where id = $1`, [a])}`, `409/${s}`);
    }
    const riderUser = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'Reg Atta Rider', 'rider', true) returning id`, [`+92321${TAG}`]);
    const rider = await one(`insert into riders (user_id, cnic, vehicle_type, vehicle_number, status, verification_status, city_id) values ($1, $2, 'bike', 'RG-1', 'busy', 'verified', $3) returning id`,
      [riderUser, `35202${TAG}1`, city]);
    const a = await attaReq('pending_pickup');
    const task = await one(`insert into rider_tasks (rider_id, task_type, atta_request_id, status, assigned_at) values ($1, 'atta_pickup', $2, 'assigned', now()) returning id`, [rider, a]);
    const presses = await Promise.all([1, 2, 3].map(() => call('PUT', `/atta-requests/${a}/cancel`, C, {})));
    check('atta: cancel before pickup works — once, even pressed 3 times at once', presses.filter((x) => x.status === 200).length, 1);
    check('…and the rider\'s pickup task is called off (it stayed on the rider\'s list)', await one(`select status from rider_tasks where id = $1`, [task]), 'cancelled');
  }

  // ── OCP: "send settlement" pressed several times at once (A29, round 6) ─────
  {
    const ocpPhone2 = `0322${TAG}`;
    const ocpId2 = (await call('POST', '/admin/ocp', A, { name: `Reg OCP S ${TAG}`, phone: ocpPhone2, pin: '4826', city_id: city }, H)).data?.id;
    const OT = (await call('POST', '/ocp/login', null, { phone: ocpPhone2, pin: '4826' })).data?.token;
    await one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, paid_amount, delivery_address_snapshot, city_id, ocp_id, delivered_at)
       values ('RG' || floor(random() * 1e9)::text, $1, $2, 'delivered', 700, 0, 700, 'cash_on_delivery', 'completed', 700, '{}'::jsonb, $3, $4, now()) returning id`, [cust, addr, city, ocpId2]);
    const sends = await Promise.all([1, 2, 3, 4].map(() => call('POST', '/ocp/settlements', OT, {})));
    check('OCP settlement pressed 4 times at once: no server error (was 500 × 3)', sends.filter((x) => x.status >= 500).length, 0);
    check('…exactly one settlement, for the right amount', await one(`select count(*)::text || '/' || coalesce(sum(amount), 0)::int::text from ocp_settlements where ocp_id = $1`, [ocpId2]), '1/700');
  }

  // ── The daily second-admin limit holds when actions arrive at once (J9) ──────
  {
    const jRole = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`Regression J9 ${TAG}`, city]);
    await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions`, [jRole]);
    const jPhone = `0323${TAG}`;
    const jId = await one(`insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ($1, 'Regression J9', 'admin', $2, $3, true) returning id`,
      [`+92${jPhone.slice(1)}`, bcrypt.hashSync('Manager123', 10), jRole]);
    await sql(`insert into admins (user_id) values ($1)`, [jId]);
    const J = (await adminLogin(jPhone, 'Manager123')).token;
    const ps = [];
    for (let i = 0; i < 8; i++) ps.push(await product(`RegJ9${i}`));
    // each count finds Rs 4,900 missing (100 expected, 95.1 counted at Rs 1,000) — the limit is Rs 5,000 a day
    const counts = await Promise.all(ps.map((p) => call('POST', '/admin/stock/count', J, { product_id: p, quality: 'A', counted_quantity: 95.1, note: 'regression' })));
    check('daily limit: 8 shortages of Rs 4,900 at once — only one passes without a second admin (was up to 10 of 16)', counts.filter((x) => x.status === 200).length, 1);
    check('…un-approved value today stays under the limit', Number(await one(`select coalesce(sum(value), 0) from approval_value_log where admin_id = $1 and approved_by is null`, [jId])), 4900);
  }

  // ── A city admin cannot switch on a coupon bigger than their limits (J10) ────
  {
    const big = (await call('POST', '/admin/coupons', A, { code: `REGBIG${TAG}`, discount_type: 'percentage', discount_value: 100, is_active: false }, H)).data?.id;
    check('coupon: a city admin cannot switch on the owner\'s 100 % coupon (was 200)', (await call('PATCH', `/admin/coupons/${big}/toggle`, M)).status, 400);
    check('…it stays off', await one(`select is_active from coupons where id = $1`, [big]), false);
    const small = (await call('POST', '/admin/coupons', M, { code: `REGSMALL${TAG}`, discount_type: 'percentage', discount_value: 20, max_discount_amount: 500, usage_limit: 10 })).data?.id;
    check('coupon: a city admin switches their own coupon off and on', `${(await call('PATCH', `/admin/coupons/${small}/toggle`, M)).status}/${(await call('PATCH', `/admin/coupons/${small}/toggle`, M)).status}`, '200/200');
    check('coupon: the owner can switch the big coupon on', (await call('PATCH', `/admin/coupons/${big}/toggle`, A, undefined, H)).status, 200);
    check('…and a city admin may always switch a coupon OFF', (await call('PATCH', `/admin/coupons/${big}/toggle`, M)).status, 200);
  }

  // ── Live updates (socket) respect the city and end with the account (B29) ────
  // Any admin could join any city's order room — hear its updates and write in
  // its chat — and a removed admin / blocked rider / deleted customer kept an
  // open socket receiving events until they closed the app.
  let ioClient = null;
  try { ioClient = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '..', '..', 'admin-panel')] })).io; } catch { /* not installed */ }
  if (ioClient && JWT_SECRET) {
    const SOCKET_URL = API.replace(/\/api\/?$/, '');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const live = (token) => new Promise((resolve) => {
      const s = ioClient(SOCKET_URL, { auth: { token }, transports: ['websocket'], reconnection: false });
      const events = [];
      s.onAny((ev, data) => events.push({ ev, data }));
      s.on('connect', () => resolve({ s, events }));
      s.on('connect_error', () => resolve({ s, events, failed: true }));
      setTimeout(() => resolve({ s, events, failed: true }), 5000);
    });
    const sockCity = await one(`insert into service_cities (name, province) values ($1, 'Punjab') returning id`, [`RegSockB${TAG}`]);
    const sockRole = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`Regression Sock B ${TAG}`, sockCity]);
    await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions`, [sockRole]);
    const sbPhone = `0324${TAG}`;
    const sbId = await one(`insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ($1, 'Regression Sock B', 'admin', $2, $3, true) returning id`,
      [`+92${sbPhone.slice(1)}`, bcrypt.hashSync('Manager123', 10), sockRole]);
    await sql(`insert into admins (user_id) values ($1)`, [sbId]);
    const SB = (await adminLogin(sbPhone, 'Manager123')).token;
    const sockOrder = await order('pending');

    const other = await live(SB);
    const own = await live(M);
    other.s.emit('order:subscribe', sockOrder);
    own.s.emit('order:subscribe', sockOrder);
    await wait(600);
    await call('PUT', `/admin/orders/${sockOrder}/status`, A, { status: 'confirmed' }, H);
    await wait(900);
    check('socket: another city\'s admin is refused this city\'s order room', other.events.some((e) => e.ev === 'order:error'), true);
    check('…and hears none of its updates (it did)', other.events.some((e) => e.ev === 'order:update'), false);
    check('socket: this city\'s admin still hears the order', own.events.some((e) => e.ev === 'order:update'), true);
    other.s.emit('chat:send', { orderId: sockOrder, message: `Regression planted ${TAG}` });
    await wait(600);
    check('socket: another city\'s admin cannot write in the order chat (it could)', Number(await one(`select count(*) from order_messages where order_id = $1 and message = $2`, [sockOrder, `Regression planted ${TAG}`])), 0);

    await call('DELETE', `/admin/roles/users/${sbId}`, A);
    await wait(1200);
    check('socket: a removed admin\'s open socket is closed at once (it stayed open)', other.s.connected, false);

    const rUser = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'Reg Sock Rider', 'rider', true) returning id`, [`+92325${TAG}`]);
    const rId = await one(`insert into riders (user_id, cnic, vehicle_type, vehicle_number, status, verification_status, city_id) values ($1, $2, 'bike', 'RG-S', 'available', 'verified', $3) returning id`,
      [rUser, `35203${TAG}1`, city]);
    const rider = await live(jwt.sign({ userId: rUser, phone: `+92325${TAG}`, role: 'rider' }, JWT_SECRET, { expiresIn: '15m' }));
    check('socket: a verified rider connects', Boolean(rider.failed), false);
    await call('PATCH', `/admin/riders/${rId}/verify`, A, { verification_status: 'rejected' }, H);
    await wait(1200);
    check('socket: a blocked rider\'s socket is closed at once', rider.s.connected, false);

    const gonePhone = `+92326${TAG}`;
    const gone = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'Reg Sock Customer', 'customer', true) returning id`, [gonePhone]);
    const goneToken = jwt.sign({ userId: gone, phone: gonePhone, role: 'customer' }, JWT_SECRET, { expiresIn: '15m' });
    const cs = await live(goneToken);
    check('socket: …a customer connects', Boolean(cs.failed), false);
    await call('POST', '/auth/delete-account', goneToken, {});
    await wait(1200);
    check('socket: a deleted account\'s socket is closed at once', cs.s.connected, false);
    for (const x of [other, own, rider, cs]) x.s.close();
  } else {
    console.log('SKIP socket checks — socket.io-client or JWT_SECRET missing');
  }

  // ── A calendar date comes back as the same date, whatever the server's clock (C7) ─
  // Date columns were turned into a JS Date at the server's midnight: on a
  // server not running in UTC every delivery date showed one day early.
  if (C) {
    const dated = await one(
      `insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id, requested_delivery_date)
       values ('RG' || floor(random() * 1e9)::text, $1, $2, 'pending', 500, 0, 500, 'cash_on_delivery', 'pending', '{}'::jsonb, $3, '2026-12-05') returning id`, [cust, addr, city]);
    const got = (await call('GET', `/orders/${dated}`, C)).data;
    check('dates: an order\'s delivery date comes back as the date sent (was 2026-12-04T19:00Z on a Pakistan-time server)',
      (got?.order || got)?.requested_delivery_date, '2026-12-05');
    const w = (await call('POST', '/finance/workers', A, { name: `Reg Worker ${TAG}`, basic_salary: 1000 }, H)).data?.id;
    await call('POST', `/finance/workers/${w}/attendance`, A, { date: '2026-11-10', status: 'present' }, H);
    const att = (await call('GET', `/finance/workers/${w}/attendance?month=11&year=2026`, A, undefined, H)).data || [];
    check('dates: a worker\'s attendance day comes back as that day', att[0]?.date, '2026-11-10');
  }

  // ── Every city has its own delivery slots (owner's decision Q10 → A30) ───────
  // One slot list served every city, and any city admin could change or delete
  // slots other cities' customers were booking.
  if (C) {
    const slotCity = await one(`insert into service_cities (name, province) values ($1, 'Punjab') returning id`, [`RegSlotB${TAG}`]);
    const SBH = { 'X-City-Id': slotCity };
    const slotRole = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`Regression Slot B ${TAG}`, slotCity]);
    await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions`, [slotRole]);
    const slPhone = `0327${TAG}`;
    const slId = await one(`insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ($1, 'Regression Slot B', 'admin', $2, $3, true) returning id`,
      [`+92${slPhone.slice(1)}`, bcrypt.hashSync('Manager123', 10), slotRole]);
    await sql(`insert into admins (user_id) values ($1)`, [slId]);
    const SB = (await adminLogin(slPhone, 'Manager123')).token;

    const sec = String(Number(TAG) % 60).padStart(2, '0'); const mn = String(Math.floor(Number(TAG) / 60) % 60).padStart(2, '0');
    const win = { start_time: `05:${mn}:${sec}`, end_time: `06:${mn}:${sec}` }; // unique per run
    const aSlot = (await call('POST', '/admin/settings/time-slots', A, { ...win, is_active: true }, H)).data?.id;
    const bSlot = (await call('POST', '/admin/settings/time-slots', SB, { ...win, is_active: true })).data?.id;
    check('slots: the same times twice in one city are refused (409, was a server error)', (await call('POST', '/admin/settings/time-slots', SB, { ...win, is_active: true })).status, 409);
    check('slots: each city admin creates slots for their own city', `${Boolean(aSlot)}/${Boolean(bSlot)}/${aSlot !== bSlot}`, 'true/true/true');
    check('slots: another city\'s admin cannot change this city\'s slot (was 200)', (await call('PUT', `/admin/settings/time-slots/${aSlot}`, SB, { start_time: '05:00', end_time: '07:00' })).status, 404);
    check('slots: …nor delete it (was 200)', (await call('DELETE', `/admin/settings/time-slots/${aSlot}`, SB)).status, 404);
    const listB = ((await call('GET', '/admin/settings/time-slots', SB)).data || []).map((s) => s.id);
    check('slots: a city admin sees only their city\'s slots', `${listB.includes(bSlot)}/${listB.includes(aSlot)}`, 'true/false');
    const pubB = ((await call('GET', `/orders/time-slots?city_id=${slotCity}`)).data || []).map((s) => s.id);
    const pubA = ((await call('GET', `/orders/time-slots?city_id=${city}`)).data || []).map((s) => s.id);
    check('slots: customers of each city are offered only that city\'s slots', `${pubB.includes(bSlot)}/${pubB.includes(aSlot)}/${pubA.includes(aSlot)}/${pubA.includes(bSlot)}`, 'true/false/true/false');

    // A city-B customer cannot book city A's slot.
    const bProduct = await one(
      `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active) values ($1, $1, $2, $3, 1000, 50, $4, true) returning id`,
      [`RegSlotP${TAG}`, `regslotp-${TAG}`, cat, slotCity]);
    const bPhone2 = `+92328${TAG}`;
    const bCust = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'Reg Slot Customer', 'customer', true) returning id`, [bPhone2]);
    const bAddr = await one(`insert into addresses (user_id, written_address, city) values ($1, 'Reg slot house', $2) returning id`, [bCust, `RegSlotB${TAG}`]);
    const BC = jwt.sign({ userId: bCust, phone: bPhone2, role: 'customer' }, JWT_SECRET, { expiresIn: '15m' });
    await call('POST', '/cart/add', BC, { product_id: bProduct, quantity: 1, unit: 'full', city_id: slotCity });
    r = await call('POST', '/orders', BC, { address_id: bAddr, city_id: slotCity, time_slot_id: aSlot, requested_delivery_date: tomorrow, payment_method: 'cash_on_delivery' });
    check('slots: an order in city B cannot use city A\'s slot (was 201)', r.status, 400);
    r = await call('POST', '/orders', BC, { address_id: bAddr, city_id: slotCity, time_slot_id: bSlot, requested_delivery_date: tomorrow, payment_method: 'cash_on_delivery' });
    check('slots: …its own slot works', r.status, 201);
    const placedB = r.data?.id || r.data?.order?.id;
    if (placedB) await call('PUT', `/admin/orders/${placedB}/status`, A, { status: 'cancelled', reason: 'regression' }, SBH);
    check('slots: a slot can only be created with a city chosen (super admin without one → 400)',
      (await call('POST', '/admin/settings/time-slots', A, { start_time: '05:00', end_time: '06:00' })).status, 400);
  }

  // ── Staff entries wait for the city admin: approve one, reject, approve all (J1, J8) ─
  // Every two-admin action now goes to a queue when no approval code is given
  // (it used to be refused); approving runs it then, once.
  {
    const staffRole = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`Regression Staff ${TAG}`, city]);
    await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions where code not in ('approvals.decide', 'finance.stock_purchase.approve')`, [staffRole]);
    const stPhone = `0329${TAG}`;
    const stId = await one(`insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ($1, 'Regression Staff', 'admin', $2, $3, true) returning id`,
      [`+92${stPhone.slice(1)}`, bcrypt.hashSync('Manager123', 10), staffRole]);
    await sql(`insert into admins (user_id) values ($1)`, [stId]);
    const ST = (await adminLogin(stPhone, 'Manager123')).token;
    const queuedId = (x) => (x.status === 202 && x.data?.queued ? x.data.request_id : null);

    // An expense above the limit, no approval code → waits (it was refused).
    const exp = await call('POST', '/finance/expenses', ST, { category: 'Repairs', amount: 6000, comment: `Reg queue ${TAG}` });
    const expReq = queuedId(exp);
    check('queue: a staff expense above the limit waits for the city admin (202)', Boolean(expReq), true);
    check('…nothing booked yet', Number(await one(`select count(*) from expenses where comment = $1`, [`Reg queue ${TAG}`])), 0);
    check('…the same press twice is one entry', queuedId(await call('POST', '/finance/expenses', ST, { category: 'Repairs', amount: 6000, comment: `Reg queue ${TAG}` })), expReq);
    const own = (await call('GET', '/admin/approvals', ST)).data;
    check('queue: staff see their own waiting entry, and cannot decide', `${(own?.requests || []).some((q) => q.id === expReq)}/${own?.canDecide}`, 'true/false');
    check('queue: staff cannot approve it themselves', (await call('POST', `/admin/approvals/${expReq}/approve`, ST)).status, 403);
    const box = (await call('GET', '/admin/approvals', M)).data;
    check('queue: the city admin sees it with what it is for', (box?.requests || []).find((q) => q.id === expReq)?.details?.includes('Rs. 6000'), true);
    check('queue: the city admin approves it', (await call('POST', `/admin/approvals/${expReq}/approve`, M)).status, 200);
    check('…the expense is booked once, in the staff member\'s name', await one(`select count(*)::text || '/' || max(amount)::int::text || '/' || bool_and(created_by = $2)::text from expenses where comment = $1`, [`Reg queue ${TAG}`, stId]), '1/6000/true');
    check('queue: approving again is refused (409)', (await call('POST', `/admin/approvals/${expReq}/approve`, M)).status, 409);

    // Reject: nothing happens.
    const qRider = await one(`insert into users (phone, full_name, role, is_phone_verified) values ($1, 'Reg Queue Rider', 'rider', true) returning id`, [`+92330${TAG}`]);
    const qRiderId = await one(`insert into riders (user_id, cnic, vehicle_type, vehicle_number, status, verification_status, city_id) values ($1, $2, 'bike', 'RG-Q', 'available', 'verified', $3) returning id`,
      [qRider, `35204${TAG}1`, city]);
    const pay = queuedId(await call('POST', '/finance/rider-payment', ST, { rider_id: qRiderId, category: 'other', amount: 5500, comment: `Reg rider ${TAG}` }));
    check('queue: a rider payment above the limit waits', Boolean(pay), true);
    check('queue: the city admin rejects it', (await call('POST', `/admin/approvals/${pay}/reject`, M, { reason: 'not agreed' })).status, 200);
    check('…nothing paid, and it is marked rejected', `${await one(`select count(*) from expenses where comment = $1`, [`Reg rider ${TAG}`])}/${await one(`select status from approval_requests where id = $1`, [pay])}`, '0/rejected');

    // J8: a salary raise always waits (it needed no approval at all).
    const wk = (await call('POST', '/finance/workers', A, { name: `Reg Queue Worker ${TAG}`, basic_salary: 20000 }, H)).data?.id;
    const raise = queuedId(await call('POST', `/finance/workers/${wk}/increment`, ST, { new_basic_salary: 90000 }));
    check('queue: a salary raise by staff waits for approval (it applied at once)', `${Boolean(raise)}/${await one(`select basic_salary::int from workers where id = $1`, [wk])}`, 'true/20000');
    // Stock-count shortage of Rs 6,000.
    const qp = await product('RegQueueCount');
    const cnt = queuedId(await call('POST', '/admin/stock/count', ST, { product_id: qp, quality: 'A', counted_quantity: 94, note: 'regression' }));
    check('queue: a Rs 6,000 shortage found in a count waits; stock untouched', `${Boolean(cnt)}/${await one(`select stock_quantity::int from products where id = $1`, [qp])}`, 'true/100');
    // A rider payment whose rider is removed before approval fails cleanly.
    const doomed = queuedId(await call('POST', '/finance/rider-payment', ST, { rider_id: qRiderId, category: 'other', amount: 5200, comment: `Reg doomed ${TAG}` }));
    await sql(`update riders set deleted_at = now() where id = $1`, [qRiderId]);

    // Another city's admin cannot decide this city's entries.
    const oCity = await one(`insert into service_cities (name, province) values ($1, 'Punjab') returning id`, [`RegQueueB${TAG}`]);
    const oRole = await one(`insert into admin_roles (name, city_id) values ($1, $2) returning id`, [`Regression Queue B ${TAG}`, oCity]);
    await sql(`insert into admin_role_permissions (role_id, permission_id) select $1, id from permissions`, [oRole]);
    const oPhone = `0331${TAG}`;
    const oId = await one(`insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ($1, 'Regression Queue B', 'admin', $2, $3, true) returning id`,
      [`+92${oPhone.slice(1)}`, bcrypt.hashSync('Manager123', 10), oRole]);
    await sql(`insert into admins (user_id) values ($1)`, [oId]);
    const OB = (await adminLogin(oPhone, 'Manager123')).token;
    check('queue: another city\'s admin cannot approve it', (await call('POST', `/admin/approvals/${raise}/approve`, OB)).status, 404);
    check('…nor sees it', ((await call('GET', '/admin/approvals', OB)).data?.requests || []).some((q) => q.id === raise), false);

    // Approve all: the raise and the count go through; the removed rider's payment says why.
    const all = await call('POST', '/admin/approvals/approve-all', M);
    check('queue: approve-all applies what it can', all.data?.approved >= 2, true);
    check('…and reports what could not be applied, with the reason', (all.data?.failed || []).some((x) => x.id === doomed), true);
    check('…the raise is now the basic salary', Number(await one(`select basic_salary from workers where id = $1`, [wk])), 90000);
    check('…the shortage is now booked (stock 94)', Number(await one(`select stock_quantity from products where id = $1`, [qp])), 94);
    check('…the failed one is marked failed with its reason', `${await one(`select status from approval_requests where id = $1`, [doomed])}/${Boolean(await one(`select note from approval_requests where id = $1`, [doomed]))}`, 'failed/true');
    check('…and no money went to the removed rider', Number(await one(`select count(*) from expenses where comment = $1`, [`Reg doomed ${TAG}`])), 0);
  }

  // ── A coupon "valid until 31 Dec" lasts all of 31 Dec in Pakistan (round 7) ──
  // A date-only "until" was stored as UTC midnight = 05:00 Pakistan time, so a
  // coupon died at 5 am on its last day; "from" started at 5 am too.
  {
    const code = `REGDATE${TAG}`;
    const made = await call('POST', '/admin/coupons', A, { code, discount_type: 'fixed', discount_value: 50, usage_limit: 5, valid_from: '2026-12-01', valid_until: '2026-12-31' }, H);
    const span = await one(`select to_char(valid_from at time zone 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') || ' .. ' || to_char(valid_until at time zone 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') from coupons where code = $1`, [code]);
    check('coupon dates: from the start of the first day to the END of the last day, Pakistan time (was 05:00 .. 05:00)', `${made.status} ${span}`, '201 2026-12-01 00:00 .. 2026-12-31 23:59');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.end();
  return { pass, fail };
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(({ fail: failed }) => process.exit(failed ? 1 : 0))
    .catch(async (e) => { console.error('REGRESSION SCRIPT ERROR', e); try { await db.end(); } catch { /* closed */ } process.exit(1); });
}
