#!/usr/bin/env node
/* eslint-disable no-console */
// ============================================================================
// FreshBazar — load test (no extra dependencies; Node 18+)
//
//   API_URL=http://localhost:3999/api node ops/load-test.js --scenario browse
//   API_URL=... DATABASE_URL=... JWT_SECRET=... node ops/load-test.js --scenario checkout
//
// Options: --seconds 10   --users 20   --scenario browse|checkout|mixed
//          --p95 2000 (ms; exit 1 above it)   --max-error-rate 0.01
//
// browse    GET products / categories / time slots — read-only.
// checkout  each virtual customer: clear cart → add an item → place a COD order.
//           WRITES to the database (customers, orders): it needs DATABASE_URL
//           and JWT_SECRET of a TEST environment and refuses a non-local
//           database unless LOAD_TEST_ALLOW_REMOTE=yes. Afterwards its orders
//           are cancelled and its test product switched off.
// mixed     half the users browse, half check out.
//
// 429 answers are counted apart: they mean a rate limit, not a slow server.
// For a capacity number, raise RATE_LIMIT_MAX_REQUESTS (and the order limit)
// on the TEST API, never in production.
// ============================================================================
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const API = (process.env.API_URL || 'http://localhost:3999/api').replace(/\/$/, '');
const SECONDS = Number(opt('seconds', 10));
const USERS = Number(opt('users', 20));
const SCENARIO = opt('scenario', 'browse');
const P95_LIMIT = Number(opt('p95', 2000));
const MAX_ERROR_RATE = Number(opt('max-error-rate', 0.01));

const stats = new Map(); // name → { ms: [], status: Map }
function record(name, ms, status) {
  let s = stats.get(name);
  if (!s) stats.set(name, (s = { ms: [], status: new Map() }));
  s.ms.push(ms);
  s.status.set(status, (s.status.get(status) || 0) + 1);
}

async function call(name, method, url, token, body) {
  const t = performance.now();
  let status = 'network';
  let json = null;
  try {
    const res = await fetch(API + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch {
    /* counted as "network" */
  }
  record(name, performance.now() - t, status);
  // Keep the first message of every failing status, so a 400 explains itself.
  if (status === 'network' || status >= 400) {
    const key = `${name} ${status}`;
    if (!samples.has(key)) samples.set(key, (json && json.message) || '(no message)');
  }
  return { status, data: json && json.data };
}
const samples = new Map();

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

async function setupCheckout() {
  const BM = path.join(__dirname, '..', 'backend', 'node_modules');
  const { Client } = require(path.join(BM, 'pg'));
  const jwt = require(path.join(BM, 'jsonwebtoken'));
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.JWT_SECRET) throw new Error('checkout needs DATABASE_URL and JWT_SECRET of a TEST environment');
  if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) && process.env.LOAD_TEST_ALLOW_REMOTE !== 'yes') {
    throw new Error('DATABASE_URL is not local. The checkout scenario writes orders — set LOAD_TEST_ALLOW_REMOTE=yes only for a test/staging database.');
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  const one = async (q, p = []) => { const r = (await db.query(q, p)).rows[0]; return r ? Object.values(r)[0] : null; };
  const tag = String(Date.now()).slice(-7);
  const cityRow = (await db.query(`select id, name from service_cities where is_active is not false order by created_at limit 1`)).rows[0] || {};
  const city = cityRow.id;
  const cat = await one(`select id from categories where city_id = $1 order by name_en limit 1`, [city]);
  if (!city || !cat) throw new Error('need at least one city with a category');
  const product = await one(
    `insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active, unit_type)
     values ($1, $1, $2, $3, 100, 1000000, $4, true, 'kg') returning id`,
    [`LoadTest ${tag}`, `load-test-${tag}`, cat, city]
  );
  const slot = await one(`insert into time_slots (slot_name, start_time, end_time, status) values ($1, '00:00', '23:59', 'available') returning id`, [`LoadTest ${tag}`]);
  const customers = [];
  for (let i = 0; i < USERS; i++) {
    const phone = `+923${tag.slice(-6)}${String(i).padStart(3, '0')}`; // +923 + 9 digits, unique per user
    const user = await one(
      `insert into users (phone, full_name, role, is_phone_verified) values ($1, 'Load Test', 'customer', true)
       on conflict (phone) do update set full_name = excluded.full_name returning id`,
      [phone]
    );
    const address = await one(`insert into addresses (user_id, written_address, city) values ($1, 'Load test house', $2) returning id`, [user, cityRow.name]);
    const token = jwt.sign({ userId: user, phone, role: 'customer', type: 'access' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    customers.push({ user, address, token });
  }
  const tomorrow = new Date(Date.now() + 29 * 3600 * 1000).toISOString().slice(0, 10);
  const cleanup = async () => {
    const n = await one(
      `with c as (update orders set status = 'cancelled', cancellation_reason = 'load test'
                   where user_id = any($1::uuid[]) and status <> 'cancelled' returning id) select count(*) from c`,
      [customers.map((c) => c.user)]
    );
    await db.query(`update products set is_active = false, reserved_quantity = 0 where id = $1`, [product]);
    await db.query(`update time_slots set status = 'blocked' where id = $1`, [slot]);
    await db.end();
    return Number(n);
  };
  return { city, product, slot, tomorrow, customers, cleanup };
}

async function browseLoop(until, city) {
  const q = city ? `?city_id=${city}` : '';
  while (Date.now() < until) {
    await call('GET /products', 'GET', `/products${q}${q ? '&' : '?'}limit=20`);
    await call('GET /categories', 'GET', `/categories${q}`);
    await call('GET /site-settings/time-slots', 'GET', `/site-settings/time-slots${q}`);
  }
}

async function checkoutLoop(until, ctx, customer) {
  while (Date.now() < until) {
    await call('DELETE /cart/clear', 'DELETE', '/cart/clear', customer.token);
    await call('POST /cart/add', 'POST', '/cart/add', customer.token, { product_id: ctx.product, quantity: 1, unit: 'full', city_id: ctx.city });
    await call('POST /orders', 'POST', '/orders', customer.token, {
      address_id: customer.address, city_id: ctx.city, time_slot_id: ctx.slot,
      requested_delivery_date: ctx.tomorrow, payment_method: 'cash_on_delivery',
    });
  }
}

(async () => {
  if (!['browse', 'checkout', 'mixed'].includes(SCENARIO)) throw new Error(`unknown scenario ${SCENARIO}`);
  let ctx = null;
  if (SCENARIO !== 'browse') ctx = await setupCheckout();
  const city = ctx?.city || process.env.CITY_ID || null;
  console.log(`Load test: ${SCENARIO}, ${USERS} users, ${SECONDS} s → ${API}`);
  const started = Date.now();
  const until = started + SECONDS * 1000;
  const loops = [];
  for (let i = 0; i < USERS; i++) {
    const checkout = SCENARIO === 'checkout' || (SCENARIO === 'mixed' && i % 2 === 1);
    loops.push(checkout ? checkoutLoop(until, ctx, ctx.customers[i]) : browseLoop(until, city));
  }
  await Promise.all(loops);
  const elapsed = (Date.now() - started) / 1000;
  const cancelled = ctx ? await ctx.cleanup() : 0;

  let total = 0; let bad = 0; let limited = 0; let worstP95 = 0;
  console.log(`\n${'endpoint'.padEnd(22)} ${'count'.padStart(6)} ${'p50'.padStart(6)} ${'p95'.padStart(6)} ${'p99'.padStart(6)} ${'max'.padStart(6)}  statuses`);
  for (const [name, s] of stats) {
    const sorted = s.ms.slice().sort((a, b) => a - b);
    const p95 = pct(sorted, 95);
    worstP95 = Math.max(worstP95, p95);
    total += sorted.length;
    for (const [st, n] of s.status) {
      if (st === 429) limited += n;
      else if (st === 'network' || st >= 500) bad += n;
    }
    const statuses = [...s.status].map(([st, n]) => `${st}×${n}`).join(' ');
    console.log(`${name.padEnd(22)} ${String(sorted.length).padStart(6)} ${pct(sorted, 50).toFixed(0).padStart(6)} ${p95.toFixed(0).padStart(6)} ${pct(sorted, 99).toFixed(0).padStart(6)} ${sorted[sorted.length - 1].toFixed(0).padStart(6)}  ${statuses}`);
  }
  const errorRate = total ? bad / total : 0;
  console.log(`\n${total} requests in ${elapsed.toFixed(1)} s = ${(total / elapsed).toFixed(1)} req/s · errors (5xx/network) ${(errorRate * 100).toFixed(2)} % · rate-limited (429) ${limited}`);
  for (const [key, msg] of samples) console.log(`  first ${key}: ${msg}`);
  if (ctx) console.log(`Cleanup: ${cancelled} load-test orders cancelled, test product switched off.`);
  const ok = errorRate <= MAX_ERROR_RATE && worstP95 <= P95_LIMIT;
  console.log(ok ? `PASS (p95 ≤ ${P95_LIMIT} ms, errors ≤ ${MAX_ERROR_RATE * 100} %)` : `FAIL (worst p95 ${worstP95.toFixed(0)} ms, errors ${(errorRate * 100).toFixed(2)} %)`);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('LOAD TEST ERROR:', e.message);
  process.exit(2);
});
