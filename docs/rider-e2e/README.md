# Rider flow — local end-to-end checks

Two bash scripts that drive the real backend API against a real PostgreSQL +
PostGIS database and assert every rider-related rule (admin ↔ rider ↔ customer).
They were used to verify the 2026-10-31 rider work (see `RIDER_WORK_LOG.md` §6).

## Run
```bash
# 1. Postgres 16 + PostGIS on port 55432 with an empty database `fb`
#    (roles anon / authenticated / service_role must exist for schema.sql grants)
psql -h 127.0.0.1 -p 55432 -U postgres -c "create database fb"
psql -h 127.0.0.1 -p 55432 -U postgres -d fb -f database/schema.sql
( cd backend && DATABASE_URL=postgres://postgres@127.0.0.1:55432/fb DB_SSL=false npm run migrate:sql )

# 2. Backend on :3999 (admin is bootstrapped from ADMIN_PHONE / ADMIN_PASSWORD)
cd backend
DATABASE_URL=postgres://postgres@127.0.0.1:55432/fb DB_SSL=false PORT=3999 NODE_ENV=development \
JWT_SECRET=<64 hex> JWT_REFRESH_SECRET=<64 hex> ADMIN_PHONE=03001112222 ADMIN_PASSWORD=Admin12345 \
npx ts-node --transpile-only src/app.ts &

# 3. Checks (needs curl + jq; rider-flow.sh needs JWT_SECRET exported for the customer token)
JWT_SECRET=<same> bash docs/rider-e2e/rider-flow.sh
bash docs/rider-e2e/restaurant-and-safeguards.sh
bash docs/rider-e2e/urgent-rate.sh
JWT_SECRET=<same> bash docs/rider-e2e/cod-only.sh
JWT_SECRET=<same> bash docs/rider-e2e/fixes-2026-10-31.sh   # slots, per-city delivery, cutoff, profit, atta, notifications, PKT day
node docs/rider-e2e/admin-socket-rooms.js                    # city-scoped admin realtime
```
Run against a fresh database — the scripts create riders with fixed phone numbers.

## What they cover
- admin: create rider (starts off duty, CNIC normalised), full record, list load, per-slot pay with `time_slot_id`, block (signs out + clear login message), safe delete, duty override derives `busy`
- rider: login keeps off duty, duty toggle, active task fields (house no., pin, hidden phone), pickup, **I've arrived** (customer inbox + throttle), deliver (COD paid, availability), Karachi-day stats, cash position, settlement history, reviews
- failed delivery: reason required, admin list flag + timeline, return to store refused while live, then allowed, then cancel
- atta: assign pickup without moving status, address + contact note on the task, delivery rider refused before the mill, wheat collected → picked_up → at_mill, flour delivered + COD collected, cash due + settled, admin list rider names
- restaurant orders: business name / phone / pin / storefront from the snapshot, call-request number, arrival tells the office, pin update
- customer tracking returns rider phone + vehicle
- urgent orders: dedicated per-rider urgent pay, fallback when unset, slot pay untouched
- 2026-10-31 audit fixes: unlimited slots (9999 + is_unlimited), per-city delivery prices + reset, server slot cutoff, rider pay in profit (no double count), atta charges edit + free-from-threshold, notification preference, single inbox row on admin cancel, complaint reply inbox, Pakistan-day "today"
- admin realtime: a Gujrat order event reaches the super admin and the Gujrat admin, not the Sialkot admin
