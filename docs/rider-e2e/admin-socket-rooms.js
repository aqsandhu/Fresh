// City-scoped admin realtime (audit F4): a new Gujrat order reaches the
// super admin and the Gujrat admin, NOT the Sialkot admin. Rider GPS too.
// usage: node docs/rider-e2e/admin-socket-rooms.js  (backend on :3999, run
// from the repo root; needs socket.io-client from admin-panel/node_modules)
const path = require('path');
const { execSync } = require('child_process');
const { io } = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '../../admin-panel')] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: [path.join(__dirname, '../../backend')] }));

const API = 'http://localhost:3999';
// SQL goes in on stdin so bcrypt hashes ($2a$...) are not touched by the shell.
const psql = (sql) => execSync('psql -h 127.0.0.1 -p 55432 -U postgres -d fb -Atq', { input: sql }).toString().trim();
const post = async (url, body, token, extra = {}) => {
  const r = await fetch(API + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: JSON.stringify(body) });
  return r.json();
};
let pass = 0, fail = 0;
const check = (name, got, want) => { if (got === want) { pass++; console.log('PASS', name); } else { fail++; console.log(`FAIL ${name} — expected [${want}] got [${got}]`); } };

(async () => {
  const gujrat = psql("select id from service_cities where name='Gujrat'");
  let sialkot = psql("select id from service_cities where name='Sialkot'");
  if (!sialkot) sialkot = psql("insert into service_cities (name, province) values ('Sialkot','Punjab') returning id");
  const hash = bcrypt.hashSync('Admin12345', 10);
  const mkAdmin = (phone, cityId, label) => {
    const role = psql(`insert into admin_roles (name, city_id) values ('${label} ${Date.now()}', '${cityId}') returning id`);
    const uid = psql(`insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ('${phone}', '${label}', 'admin', '${hash}', '${role}', true) on conflict (phone) do update set admin_role_id = excluded.admin_role_id, password_hash = excluded.password_hash returning id`);
    psql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  };
  mkAdmin('+923007770011', gujrat, 'Gujrat Admin');
  mkAdmin('+923007770012', sialkot, 'Sialkot Admin');
  const login = async (phone) => (await post('/api/admin/login', { phone, password: 'Admin12345' })).data?.tokens?.accessToken;
  const tokens = { super: await login('03001112222'), gujrat: await login('03007770011'), sialkot: await login('03007770012') };
  check('city admins can log in', Boolean(tokens.gujrat && tokens.sialkot), true);

  const got = { super: [], gujrat: [], sialkot: [] };
  const sockets = await Promise.all(Object.entries(tokens).map(([k, t]) => new Promise((resolve, reject) => {
    const s = io(API, { auth: { token: t }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    s.onAny((event, data) => got[k].push({ event, data }));
  })));

  // A Gujrat order: WhatsApp order flow is heavy, so fire the same helper the
  // API uses via a real status change on an existing Gujrat order.
  const cust = psql("insert into users (phone, full_name, role, is_phone_verified) values ('+923367770003','Socket Customer','customer',true) on conflict (phone) do update set full_name = excluded.full_name returning id");
  const addr = psql(`insert into addresses (user_id, written_address, city) values ('${cust}','House 7','Gujrat') returning id`);
  const order = psql(`insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id) values ('SOCK-${Date.now() % 100000}','${cust}','${addr}','pending',500,0,500,'cash_on_delivery','pending','{}'::jsonb,'${gujrat}') returning id`);
  const target = psql(`select status from orders where id='${order}'`) === 'pending' ? 'confirmed' : 'preparing';
  const r = await fetch(`${API}/api/admin/orders/${order}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.super}`, 'X-City-Id': gujrat }, body: JSON.stringify({ status: target }) }).then((x) => x.json());
  check('status change ok', r.success, true);
  await new Promise((res) => setTimeout(res, 1200));
  const saw = (k) => got[k].some((e) => e.event === 'order:status_updated' && e.data?.orderId === order);
  check('super admin hears the Gujrat order event', saw('super'), true);
  check('Gujrat admin hears it', saw('gujrat'), true);
  check('Sialkot admin does NOT hear it', saw('sialkot'), false);

  sockets.forEach((s) => s.close());
  console.log(`RESULT pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
