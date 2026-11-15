# Fresh Bazar — Operations Runbook

What to do when deploying, when something breaks, and how to back up and restore.
Keep it short enough to follow under pressure; every command here has been run.

## 1. Where everything runs

| Part | Host | Deploys when | Health |
|---|---|---|---|
| Backend API | Render, service `freshbazar-backend` (`render.yaml`) | every push to `main` (autoDeploy) | `/health` (process up), `/ready` (database answers) |
| Database | Supabase Postgres | schema changes ride on backend deploys (pre-deploy migrations) | Supabase dashboard |
| Pictures | Supabase Storage, bucket `uploads` | — | an upload returns 503 when the keys are missing |
| Website | Vercel (`website/`) | every push to `main` | the home page |
| Admin panel | Vercel or Netlify (`admin-panel/`) | every push to `main` | the login page |
| Apps | Expo EAS builds → stores | manual `eas build` / `eas submit` | — |

**Metrics:** set `METRICS_TOKEN` in Render and point a monitoring service (Grafana Cloud, Better
Stack, any Prometheus) at `https://<api>/metrics` with `Authorization: Bearer <token>`. Worth an
alert: `http_requests_total{status="5xx"}` rising, `http_request_duration_seconds` p95 above 2 s,
`db_pool_connections{state="waiting"}` above 0 for minutes, `background_job_failures_total` rising.

Every API response carries an `X-Request-Id` header; a 500 response also has it in the body
(`requestId`). Search the Render log or Sentry for that id to find the exact failure.

## 2. Before a deploy

1. CI is green on the branch (typecheck, lint, tests, `db-e2e`).
2. New files in `database/migrations/` were read by someone: they only ADD (columns, tables,
   constraints) or they are written so the old code still works while they run.
3. Take a backup if the deploy has a migration (section 6).

## 3. Deploy

Push to `main`. Render then:

1. builds (`npm install && npm run build`),
2. runs **`npm run migrate:sql`** (pre-deploy) — applies new migrations, refuses an applied file
   that was edited,
3. starts the new version and switches traffic once `/health` answers.

If step 2 or 3 fails, **Render keeps the previous version running** — customers are not affected.

After a deploy, check within 10 minutes:

- `https://<api>/ready` → 200
- admin panel: log in, open Orders and Owner checks
- website: open a product, add to cart (do not place an order on production)

## 4. Roll back

- **API:** Render → `freshbazar-backend` → Events/Deploys → the last good deploy → **Rollback**.
- **Website / admin:** Vercel → Deployments → the last good one → **Promote to Production**.
- **Database migrations are never rolled back.** They are additive, so the previous code keeps
  working on the newer schema. If a migration itself is wrong, fix it **forward** with a new
  migration file.

## 5. When something breaks

| Symptom | Where to look | What to do |
|---|---|---|
| API does not start, log says `Configuration is invalid` | Render log — every problem is listed | Fix the named environment variables in Render → Environment, then Manual Deploy |
| Deploy failed in "pre-deploy" | Render log of the migration step | Read the SQL error. Never edit an applied migration — add a new one. `These migrations were changed AFTER they had been applied` means someone changed an old file: restore it from git (`MIGRATIONS_ALLOW_EDITED=true` is only for a deliberate one-off) |
| Many 500s, `relation ... does not exist`; boot log says `database migration(s) are NOT applied` | Render log | Migrations did not run: run `npm run migrate:sql` from the Render shell, or redeploy. The API no longer creates tables itself (`SCHEMA_SELF_HEAL=true` is an emergency switch only) |
| `/ready` is 503 | Supabase status page, Supabase dashboard → Database | Database is down or out of connections; the API reconnects by itself once it is back |
| Pictures refused (503) | Render env | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` missing or wrong; bucket `uploads` must exist and be public |
| Customers / admins get no login code | Render log: `OTP delivery failed on every channel` | WhatsApp Cloud API token expired or SMS gateway balance — fix the channel. Never turn OTP bypass on in production |
| Bell notification "background job failed" (super admins) | Sentry + Render log for `reconciliation` / `marketing` | The job retries on its next run; if it fails twice, read the error. Owner checks shows a red banner when the stock watchdog has not run for 30 hours |
| Stock drift or cash difference on Owner checks | Owner checks page → the listed products / riders | Count the shelf, compare with the stock ledger; use the AI Audit (super admin) for the period |
| First request after quiet time takes ~50 s | — | Render free plan sleeps (outside the rating; a paid plan removes it) |

## 6. Backup and restore

Scripts (need `pg_dump` / `psql` of the same major version as the server or newer):

```bash
# Backup — use the DIRECT connection (port 5432), not the pooler (6543)
DATABASE_MIGRATION_URL=postgres://... ops/db-backup.sh ./backups

# Restore into a SPARE database and prove it (row count of every table must match)
TARGET_DATABASE_URL=postgres://<spare database> ops/db-restore.sh backups/freshbazar-<time>.dump
```

- The backup writes the dump, a row count of every table, and a checksum. The restore checks the
  checksum, refuses a non-empty target unless `CONFIRM_OVERWRITE=yes`, restores, and exits
  non-zero unless every table has the same row count as at backup time.
- **How often:** before every deploy with a migration, and at least weekly. Keep 14 days
  (`KEEP_DAYS`).
- **Practise a restore once a month** on a spare database. A backup that was never restored is
  not a backup.
- **Where to keep dumps:** they contain customer names, phones and addresses — a private place
  only (never a public bucket, never git; `backups/` and `*.dump` are git-ignored). Supabase's own
  daily backups depend on the plan; these scripts work on any plan.

Restoring **production** (only when the live data is lost or corrupted): take a fresh backup of the
broken state first, put the site in maintenance (pause the Render service), restore with
`CONFIRM_OVERWRITE=yes`, run `npm run migrate:sql` (it must say "No pending migrations"), resume,
and check section 3's list.

## 6b. Capacity check

`ops/load-test.js` (no extra install). Run `--scenario browse` against staging before launch and
after big changes; `--scenario checkout` only against a test database (it places and then cancels
orders). It prints p50/p95/p99 per endpoint and counts 429 (rate limit) apart from errors. Measured
15 Nov 2026 on a laptop (production mode, one IP): browse 350 req/s, p95 under 100 ms, 0 errors;
checkout 100 orders in 10 s from 20 customers, order p95 233 ms, 0 errors.

If customers report "Too many requests": the per-IP ceilings are `API_MAX_PER_IP` (per 15 min),
`PRODUCT_MAX_PER_IP`, `SEARCH_MAX_PER_IP` (per minute). Website visitors and app users on the same
mobile carrier share addresses, so raise the ceilings rather than lowering the per-session limits.

## 7. Secrets

| Secret | If it leaks / when rotating |
|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Change both in Render (different values, 32+ characters). Everyone is logged out — expected |
| `AUDIT_AI_SECRET` | Encrypts the AI Audit key. After changing it, enter the AI key again on the audit page |
| `ADMIN_PASSWORD` (bootstrap) | Change the password in the admin panel, then remove `ADMIN_PHONE`/`ADMIN_PASSWORD` from Render |
| `SUPABASE_SERVICE_ROLE_KEY` | Regenerate in Supabase → API, update Render |
| WhatsApp / SMS tokens | Regenerate at the provider, update Render |

## 8. Launch-day switches

- `OTP_BYPASS_ENABLED=false` (and remove `OTP_BYPASS_CODE`) — with bypass on, the fixed code logs
  anyone in, admins included.
- A real OTP channel set (WhatsApp Cloud API or SMS gateway) — admin two-step login then sends a
  real code.
- `SENTRY_DSN` set, so 500s reach someone.
- `AUDIT_AI_SECRET` set before the AI key is saved.
