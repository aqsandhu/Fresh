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
  r = await call('POST', '/restaurant/register', null, { business_name: `Regression Cafe ${TAG}`, phone: restPhone, pin: '4321', city_id: city, address: 'Regression road' });
  const restId = r.data?.id;
  await call('POST', `/admin/restaurants/${restId}/approve`, A, {}, H);
  const RT = (await call('POST', '/restaurant/login', null, { phone: restPhone, pin: '4321' })).data?.token;
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
  check('staff: Rs 500,000 expense alone is refused', (await call('POST', '/finance/expenses', M, { category: 'rent', amount: 500000 })).status, 400);
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
    check('…but only once', (await call('POST', '/finance/expenses', M, { category: 'rent', amount: 30000, ...withCode })).status, 400);
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
  await call('POST', '/restaurant/register', null, { business_name: `Pending Cafe ${TAG}`, phone: pendPhone, pin: '5678', city_id: city, address: 'Pending road' });
  check('security: a wrong PIN on a pending restaurant says only "invalid" (status was told to anyone)', (await call('POST', '/restaurant/login', null, { phone: pendPhone, pin: '0000' })).status, 401);
  check('…the right PIN still hears "under review"', (await call('POST', '/restaurant/login', null, { phone: pendPhone, pin: '5678' })).status, 403);
  const ocpPhone = `0307${TAG}`;
  await sql(`insert into order_collection_points (name, phone, pin_hash, city_id, status) values ($1, $2, $3, $4, 'disabled')`,
    [`Disabled OCP ${TAG}`, `+92${ocpPhone.slice(1)}`, bcrypt.hashSync('2468', 4), city]);
  check('security: a wrong PIN on a disabled OCP says only "invalid"', (await call('POST', '/ocp/login', null, { phone: ocpPhone, pin: '1111' })).status, 401);
  check('…the right PIN hears "disabled"', (await call('POST', '/ocp/login', null, { phone: ocpPhone, pin: '2468' })).status, 403);

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
