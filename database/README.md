# Database — schema & migrations

This project applies schema changes through three complementary mechanisms.
Understanding which is which avoids drift.

## 1. `schema.sql` — canonical from-scratch schema
The full, current schema for spinning up a brand-new database (local dev, a
fresh Supabase project, CI). Run once on an empty database. It already includes
everything the migrations below add, so **do not** run the migrations on top of
a fresh `schema.sql` install.

## 2. `migrations/NN-*.sql` — ordered, hand-applied migrations
Incremental changes applied to **existing** databases that predate a given
feature, in filename order (`01`, `02`, … `16`). They are written to be
idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT … DO
UPDATE`) so re-running one is safe. Apply in the Supabase SQL editor or via
`psql` in order. `08b-` sorts after `08-` to keep numbering unique.

There is no tracking table for these — they rely on idempotency. When you add a
column here, also add it to `schema.sql` so new installs stay in sync.

## 3. `backend/migrations/*.js` — node-pg-migrate (runtime infra tables)
`node-pg-migrate` migrations for tables the backend manages operationally
(webhook logs, audit logs, system settings, atta seed). Run with
`pnpm --filter @freshbazar/backend migrate:up`. These DO use node-pg-migrate's
tracking table (`pgmigrations`).

## Runtime self-healing
`backend/src/config/pinAuth.ts` adds the `pin_hash` / `pin_set_at` columns at
runtime if missing (`ADD COLUMN IF NOT EXISTS`), so the PIN feature works even
before migration `01` is applied. This is a safety net, not the source of
truth — keep `schema.sql` and `migrations/` authoritative.

## Recommended order for a new environment
1. `schema.sql`
2. `pnpm --filter @freshbazar/backend migrate:up` (node-pg-migrate infra tables)
3. Seed data as needed (`00-reset.sql` is a dev-only wipe helper).
