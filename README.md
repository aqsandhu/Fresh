# Fresh Bazar - Pakistan's Trusted Grocery Delivery Platform

A complete, scalable grocery delivery system optimized for Pakistan's local market. Built with modern technologies and designed for easy expansion across multiple cities.

## System Overview

This platform integrates:
- **Customer Mobile App** (React Native) - Order groceries & atta chakki service
- **Customer Website** (Next.js) - Browse and order from any device
- **Admin Panel** (React) - Complete business management
- **Rider App** (React Native) - Delivery personnel management
- **Backend API** (Node.js/Express) - Single database for all platforms

## Features

### Customer Features
- Browse categories: Sabzi, Fruit, Dry Fruit, Chicken
- Smart cart with intelligent delivery charges
- Free delivery 10AM-2PM (order before 10AM)
- Free delivery on minimum vegetable/fruit purchase
- Atta Chakki service (wheat pickup & flour delivery)
- Multiple saved addresses with GPS location
- Door picture for easy identification
- House number system for addresses
- Cash on Delivery payment
- Real-time order tracking
- Push notifications

### Admin Features
- Dashboard with sales analytics
- Order management with rider assignment
- Product & category management
- Rider management & GPS tracking
- Atta Chakki workflow management
- WhatsApp order entry
- House number assignment
- Delivery charge configuration

### Rider Features
- Task list with order details
- GPS navigation to customer
- Privacy-protected customer calls
- Online/offline status toggle
- Real-time location tracking
- Delivery confirmation with proof

### Privacy & Security
- Rider cannot see customer phone number
- App-mediated calling system
- JWT authentication
- Role-based access control
- Password hashing

## Project Structure

This is a pnpm workspace (monorepo) run with Turborepo.

```
.
├── backend/          Express + TypeScript API (port 3000), Socket.IO, schedulers
├── admin-panel/      React 18 + Vite admin (port 5173)
├── website/          Next.js 15 customer website (port 3001)
├── customer-app/     Expo (React Native) customer app
├── rider-app/        Expo (React Native) rider app
├── packages/         shared code (types, auth helpers)
├── database/
│   ├── schema.sql    the base schema — run ONCE on an empty database
│   └── migrations/   every later change — applied by the migration runner
├── docs/             audits, end-to-end scripts (docs/rider-e2e), setup notes
├── docker-compose.yml  whole stack locally (Postgres, Redis, API, website, admin)
└── render.yaml       backend deploy on Render (runs migrations before each deploy)
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Database | PostgreSQL 15+ (Supabase in production) |
| Backend | Node.js 20, Express, TypeScript, Socket.IO |
| Admin Panel | React 18, Vite, Tailwind CSS, React Query |
| Website | Next.js 15, TypeScript, Tailwind CSS, Zustand |
| Customer App / Rider App | React Native, Expo SDK 54 |
| Files | Supabase Storage |

## Quick Start (local, about 15 minutes)

### Prerequisites
- Node.js 20 and pnpm 10 (`corepack enable` gives you the right pnpm)
- PostgreSQL 15 or newer, running locally (or use Docker — see below)
- Redis is optional

### 1. Install

```bash
pnpm install          # from the repo root — installs every workspace
```

Do not run `npm install` inside the sub-folders; the workspaces share one lockfile.

### 2. Database

```bash
createdb freshbazar
psql -d freshbazar -v ON_ERROR_STOP=1 -f database/schema.sql
```

Only `schema.sql` goes in by hand. Do **not** run `database/00-reset.sql` (it wipes
everything) or `database/rider_system_migration.sql` (retired).

### 3. Backend

```bash
cp backend/.env.example backend/.env
```

In `backend/.env` set at least:

| Variable | Local value |
|---|---|
| `DATABASE_URL` | `postgres://postgres:YOUR_PASSWORD@localhost:5432/freshbazar` |
| `DB_SSL` | `false` (local Postgres has no TLS) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | two **different** random strings, 32+ characters |
| `ADMIN_PHONE`, `ADMIN_PASSWORD` | the first owner (super admin) login, e.g. `03001234567` |
| `OTP_BYPASS_ENABLED`, `OTP_BYPASS_CODE` | `true` and a code, so you can log in without SMS. **Never in production.** |

Then apply the migrations and start the API:

```bash
pnpm --filter @freshbazar/backend migrate:sql   # applies database/migrations/*.sql
pnpm --filter @freshbazar/backend dev           # http://localhost:3000
curl http://localhost:3000/ready                 # 200 once the database answers
```

`migrate:sql` is required — `schema.sql` alone is missing about 30 later tables.
The runner remembers what it applied (and refuses an already-applied file that was
edited), so it is safe to run on every deploy.

### 4. Admin panel

```bash
cp admin-panel/.env.example admin-panel/.env    # VITE_API_URL=http://localhost:3000/api
pnpm --filter freshbazar-admin dev               # http://localhost:5173
```

Log in with `ADMIN_PHONE` / `ADMIN_PASSWORD`. The second step asks for a code: with
OTP bypass on it is `OTP_BYPASS_CODE`; with a WhatsApp/SMS channel set up it is sent
to the admin's phone.

### 5. Website

```bash
pnpm --filter freshbazar-website dev             # http://localhost:3001
```

It talks to `http://localhost:3000/api` unless `NEXT_PUBLIC_API_URL` says otherwise.

### 6. Mobile apps

```bash
cp customer-app/.env.example customer-app/.env   # set EXPO_PUBLIC_API_URL to your
                                                 # computer's LAN address, e.g. http://192.168.1.10:3000/api
pnpm --filter @freshbazar/customer-app start
pnpm --filter @freshbazar/rider-app start
```

Scan the QR code with Expo Go (phone and computer on the same network). Background
location, push and camera need a development build on a real phone.

### Or: everything in Docker

```bash
cp .env.example .env     # set JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_PHONE, ADMIN_PASSWORD
docker compose up --build
```

The database gets `schema.sql` on its first start and the backend applies the
migrations itself before starting. See the notes at the top of `docker-compose.yml`.

## Checks before you push

```bash
pnpm exec turbo run typecheck lint test --concurrency=1
```

(`--concurrency=1` matters on a normal laptop — five test suites at once run out of memory.)

Against a real database (what the `db-e2e` CI job runs):

```bash
E2E_DATABASE_URL=postgres://... pnpm --filter @freshbazar/backend test:e2e
JWT_SECRET=<the API's> node docs/rider-e2e/regressions-2026-11.js   # needs a running API + DB; see docs/rider-e2e/README.md
```

Load test (read-only browsing, or checkout on a TEST database — see the file header):

```bash
API_URL=http://localhost:3000/api node ops/load-test.js --scenario browse --seconds 30 --users 50
```

## Configuration

Delivery charges, the free-delivery threshold, time slots, coupons and most other
business rules are set **per city in the admin panel** (Settings, Service Cities,
Coupons) — not in code or SQL.

## Environment Variables

The full, commented list is in `.env.example` (root, used by Docker) and
`backend/.env.example`. In production the API **refuses to start** when a required
value is missing or malformed (database, JWT secrets, CORS origins); the Render log
then lists every problem under `Configuration is invalid`.

## Deployment

| Part | Where | How |
|---|---|---|
| Backend | Render (`render.yaml`) | Each deploy builds, runs `npm run migrate:sql` (pre-deploy), then `npm start`. Health check: `/health` (`/ready` also checks the database). |
| Database | Supabase Postgres | `schema.sql` once on a new project; migrations come with each backend deploy. |
| Website | Vercel | Root directory `website`. |
| Admin panel | Vercel or Netlify (configs in `admin-panel/`) | `pnpm --filter freshbazar-admin build`, serve `admin-panel/dist`. |
| Mobile apps | Expo EAS | `eas build` in `customer-app` / `rider-app` (profiles in `eas.json`). |

## Troubleshooting

**API does not start in production** — read the log under `Configuration is invalid`.

**`relation "..." does not exist` (500s)** — the migrations were not applied: run
`pnpm --filter @freshbazar/backend migrate:sql`.

**A migration "was edited after it was applied"** — never change an applied migration;
add a new one. (`MIGRATIONS_ALLOW_EDITED=true` exists only for a deliberate one-off.)

**Pictures are refused with 503** — `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are not set.

**Expo app does not load** — phone and computer on the same network, or `npx expo start --tunnel`.

Production problems, rollback and database backup/restore: see [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## API Documentation

Swagger UI at `/api/docs` (in production it asks for `SWAGGER_PASSWORD`).

## Support

For issues or questions:
- Email: support@freshbazar.pk
- Phone: 0300-1234567

## License

This project is proprietary software for Fresh Bazar.

---

**Built with love for Pakistan's local market by Fresh Bazar**
