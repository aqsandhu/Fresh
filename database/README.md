# Database — schema & migrations

This project applies schema changes through these mechanisms. Understanding
which is which avoids drift.

## 1. `schema.sql` — from-scratch CORE schema (NOT fully migrated)
The starting schema for spinning up a brand-new database (local dev, a fresh
Supabase project, CI). Run once on an empty database.

**Drift warning:** `schema.sql` is NOT the fully-migrated state. ~29 tables
introduced by later migrations (restaurant catalog, finance, service areas,
today's basket, franchise, marketing, otp_codes, coupons, user tips, urgent
delivery, rider applications, webhook_events, refresh_tokens, order
collection points, …) exist ONLY in `migrations/NN-*.sql`. Running
`schema.sql` alone leaves the database unusable for those features (runtime
42P01 "relation does not exist").

The required procedure is therefore **schema.sql FIRST, then migrate:sql**:

```bash
# 1. psql … -f database/schema.sql   (or paste into the Supabase SQL editor)
# 2. apply every migration on top (all idempotent — no-ops where schema.sql
#    already created the object, creates everything schema.sql is missing):
pnpm --filter @freshbazar/backend migrate:sql
```

Do NOT `--baseline` a fresh `schema.sql` install — baselining would mark the
un-migrated files as applied and skip the ~29 missing tables. Baseline ONLY
on a legacy database that already has all migrations applied manually.

## 2. `migrations/NN-*.sql` — versioned SQL migrations (go-forward system)
Incremental changes for **existing** databases, in filename order (`01`, `02`,
… `53`; `08b-` sorts after `08-`). All new schema changes go here, AND (for
small additive changes) into `schema.sql` so the drift above shrinks over
time.

Run them with the tracked runner (records applied files in a
`schema_migrations` table, applies each pending file once, in order, inside a
transaction):

```bash
pnpm --filter @freshbazar/backend migrate:sql
```

For a database that already has some/all migrations applied manually (e.g. the
current production DB), baseline ONCE so the runner doesn't re-run them:

```bash
pnpm --filter @freshbazar/backend migrate:sql -- --baseline
```

After baselining, every future migration is applied normally by `migrate:sql`.
The files remain idempotent (`IF NOT EXISTS`, `ON CONFLICT`) as a second line
of defence, but the tracking table is the source of truth.

Uses `DATABASE_MIGRATION_URL` (direct :5432 connection) when set, falling back
to `DATABASE_URL` — Supabase's pooler on :6543 often rejects DDL.

## 3. `backend/migrations/*.js` — node-pg-migrate (FROZEN)
Legacy `node-pg-migrate` migrations for infra tables (webhook logs, audit
logs, system settings, atta seed). Run with
`pnpm --filter @freshbazar/backend migrate:up` (tracking table:
`pgmigrations`). **Frozen — do not add new migrations here**; use
`migrations/NN-*.sql` + `migrate:sql` instead.

## Runtime self-healing
`backend/src/config/pinAuth.ts`, `addressSchema.ts` and `orderSchema.ts` add
their columns at runtime if missing (`ADD COLUMN IF NOT EXISTS`), so those
features survive a missed migration. This is a safety net, not the source of
truth — keep `schema.sql` and `migrations/` authoritative.

## Recommended order for a new environment
1. `schema.sql`
2. `pnpm --filter @freshbazar/backend migrate:sql` (**REQUIRED — NOT optional**). Un-baselined: every file is idempotent, so it no-ops where `schema.sql` already created the object and creates the ~29 tables `schema.sql` is missing. Do NOT use `-- --baseline` here (see the warning in §1).
3. `pnpm --filter @freshbazar/backend migrate:up` (legacy node-pg-migrate infra tables — all guarded with `ifNotExists`, so they co-exist with `schema.sql`)
4. Seed data as needed (`00-reset.sql` is a dev-only wipe helper).
