# Database — schema & migrations

This project applies schema changes through these mechanisms. Understanding
which is which avoids drift.

## 1. `schema.sql` — canonical from-scratch schema
The full, current schema for spinning up a brand-new database (local dev, a
fresh Supabase project, CI). Run once on an empty database. It already includes
everything the migrations below add, so **do not** run the migrations on top of
a fresh `schema.sql` install — instead baseline them (see below).

## 2. `migrations/NN-*.sql` — versioned SQL migrations (go-forward system)
Incremental changes for **existing** databases, in filename order (`01`, `02`,
… `18`; `08b-` sorts after `08-`). All new schema changes go here, AND into
`schema.sql` so fresh installs stay in sync.

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
2. `pnpm --filter @freshbazar/backend migrate:sql -- --baseline` (mark all SQL migrations applied)
3. `pnpm --filter @freshbazar/backend migrate:up` (legacy node-pg-migrate infra tables)
4. Seed data as needed (`00-reset.sql` is a dev-only wipe helper).
