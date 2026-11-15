// ============================================================================
// REAL-DATABASE SUITE — the app booted IN THIS PROCESS against a real Postgres
// (E2E_DATABASE_URL: schema.sql + all migrations applied), driven over HTTP, so
// the server code it runs shows up in the coverage report. See
// jest.e2e.config.js. Skipped without E2E_DATABASE_URL.
//
//   1. the regression checks (docs/rider-e2e/regressions-2026-11.js)
//   2. a smoke pass over EVERY GET route the app registers, as the owner, as a
//      customer and with no token — no route may answer 5xx. (Unit tests mock
//      the database, so a query Postgres rejects sails through them; twice
//      already such a query reached production-bound code.)
// ============================================================================
import path from 'path';
import { listExpressRoutes } from '../../src/config/openapiRoutes';

const DATABASE_URL = process.env.E2E_DATABASE_URL;
const PORT = process.env.E2E_PORT || '3997';
const BASE = `http://localhost:${PORT}`;
const suite = DATABASE_URL ? describe : describe.skip;

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const BM = path.join(__dirname, '..', '..', 'node_modules');

async function waitUntilReady(timeoutMs = 120000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      if ((await fetch(`${BASE}/ready`)).status === 200) return;
    } catch {
      /* not listening yet */
    }
    if (Date.now() - started > timeoutMs) throw new Error(`API did not become ready on ${BASE}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Every route Express knows about (the same reader the API docs use). */
const listRoutes = (app: Parameters<typeof listExpressRoutes>[0]) => listExpressRoutes(app);

suite('real database — the real API end to end', () => {
  let app: any;
  let db: any;
  let ownerToken = '';
  let customerToken = '';
  let cityId = '';

  beforeAll(async () => {
    // Everything the app reads at import time must be set first.
    Object.assign(process.env, {
      DATABASE_URL,
      DB_SSL: 'false',
      PORT,
      NODE_ENV: 'development',
      JWT_SECRET: process.env.JWT_SECRET || 'e'.repeat(64),
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'f'.repeat(64),
      ADMIN_PHONE: '03001112222',
      ADMIN_PASSWORD: 'Admin12345',
      // Two-step admin login is exercised through the same bypass rule as every other OTP.
      OTP_BYPASS_ENABLED: 'true',
      OTP_BYPASS_CODE: '123789',
    });
    app = (await import('../../src/app')).default;
    await waitUntilReady();
    const { Client } = require(path.join(BM, 'pg'));
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end().catch(() => undefined);
  });

  it('every regression check passes', async () => {
    const { run } = require(path.join(__dirname, '..', '..', '..', 'docs', 'rider-e2e', 'regressions-2026-11.js'));
    const { pass, fail } = await run({ api: `${BASE}/api`, databaseUrl: DATABASE_URL, jwtSecret: process.env.JWT_SECRET });
    expect(fail).toBe(0);
    expect(pass).toBeGreaterThanOrEqual(60);
  });

  it('no GET route answers 5xx — as the owner, as a customer, and with no token', async () => {
    const one = async (sql: string, params: unknown[] = []) => {
      try {
        const r = await db.query(sql, params);
        return r.rows[0] ? String(Object.values(r.rows[0])[0]) : null;
      } catch {
        return null;
      }
    };
    cityId = (await one(`select id from service_cities where name = 'Gujrat' limit 1`)) || '';

    // Sign in the way the panel does (password, then the one-time code).
    const login = async (body: Record<string, string>) =>
      (await (await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()) as any;
    let session = await login({ phone: '03001112222', password: 'Admin12345' });
    if (session.data?.requires_otp) session = await login({ phone: '03001112222', password: 'Admin12345', otp: '123789' });
    ownerToken = session.data.tokens.accessToken;

    const customerId = await one(`select id from users where role = 'customer' and deleted_at is null order by created_at desc limit 1`);
    const customerPhone = await one(`select phone from users where id = $1`, [customerId]);
    const jwt = require(path.join(BM, 'jsonwebtoken'));
    customerToken = jwt.sign({ userId: customerId, phone: customerPhone, role: 'customer', type: 'access' }, process.env.JWT_SECRET, { expiresIn: '15m' });

    // A real id for each kind of record, so by-id routes run their real query.
    const NIL = '00000000-0000-4000-8000-000000000000';
    const sample: Record<string, string> = {
      orders: (await one(`select id from orders where deleted_at is null order by created_at desc limit 1`)) || NIL,
      products: (await one(`select id from products order by created_at desc limit 1`)) || NIL,
      stock: (await one(`select id from products order by created_at desc limit 1`)) || NIL,
      categories: (await one(`select id from categories limit 1`)) || NIL,
      riders: (await one(`select id from riders where deleted_at is null limit 1`)) || NIL,
      customers: customerId || NIL,
      restaurants: (await one(`select id from restaurants limit 1`)) || NIL,
      ocp: (await one(`select id from order_collection_points limit 1`)) || NIL,
      complaints: (await one(`select id from complaints limit 1`)) || NIL,
      coupons: (await one(`select id from coupons limit 1`)) || NIL,
      workers: (await one(`select id from workers limit 1`)) || NIL,
      shareholders: (await one(`select id from shareholders limit 1`)) || NIL,
      addresses: (await one(`select id from addresses limit 1`)) || NIL,
      'atta-requests': (await one(`select id from atta_requests limit 1`)) || NIL,
      cities: cityId || NIL,
      runs: (await one(`select id from corruption_audit_runs limit 1`)) || NIL,
      tasks: (await one(`select id from rider_tasks limit 1`)) || NIL,
      roles: (await one(`select id from admin_roles limit 1`)) || NIL,
    };
    const orderNumber = (await one(`select order_number from orders order by created_at desc limit 1`)) || 'ORD-NONE';

    const fill = (routePath: string): string => {
      const parts = routePath.split('/');
      return parts
        .map((seg, i) => {
          if (!seg.startsWith(':')) return seg;
          if (/orderNumber/i.test(seg)) return orderNumber;
          // the nearest static segment before the param names the record type
          for (let k = i - 1; k >= 0; k--) {
            if (!parts[k].startsWith(':') && sample[parts[k]]) return sample[parts[k]];
          }
          return NIL;
        })
        .join('/');
    };

    const routes = listRoutes(app)
      .filter((r) => r.method === 'GET' && r.path.startsWith('/api/'))
      // SSE / file streams / third-party redirects are not plain JSON routes.
      .filter((r) => !/\/export$|\/docs|\/stream/.test(r.path));
    expect(routes.length).toBeGreaterThan(120);

    const callers: [string, Record<string, string>][] = [
      ['owner', { Authorization: `Bearer ${ownerToken}`, 'X-City-Id': cityId }],
      ['customer', { Authorization: `Bearer ${customerToken}` }],
      ['nobody', {}],
    ];
    const failures: string[] = [];
    let calls = 0;
    for (const route of routes) {
      const url = `${BASE}${fill(route.path)}`;
      for (const [who, headers] of callers) {
        const res = await fetch(url, { headers });
        calls++;
        if (res.status >= 500) {
          const body = (await res.text()).slice(0, 160);
          failures.push(`${who}: GET ${route.path} → ${res.status} ${body}`);
        } else {
          await res.arrayBuffer(); // drain
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`GET smoke: ${routes.length} routes × ${callers.length} callers = ${calls} calls, ${failures.length} server error(s)`);
    expect(failures).toEqual([]);
  });
});
