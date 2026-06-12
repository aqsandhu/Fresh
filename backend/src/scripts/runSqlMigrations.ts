// ============================================================================
// SQL MIGRATION RUNNER — single versioned system for database/migrations/*.sql
// ----------------------------------------------------------------------------
// Usage (from backend/):
//   npm run migrate:sql              # apply pending migrations
//   npm run migrate:sql -- --baseline   # mark ALL current files applied
//                                       # WITHOUT running them (use ONCE on a
//                                       # database that already has them)
//
// Tracking table `schema_migrations` records each applied filename, so files
// run exactly once, in filename order, each inside its own transaction.
// This supersedes ad-hoc psql runs of database/migrations/*.sql and is the
// go-forward home for ALL schema changes (the node-pg-migrate js migrations
// under backend/migrations/ are frozen — do not add new ones there).
// ============================================================================

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');

function getConnectionString(): string {
  // Prefer a direct (non-pooler) connection — Supabase's pooler on :6543
  // often rejects DDL.
  const url =
    process.env.DATABASE_MIGRATION_URL ||
    process.env.DIRECT_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'No database URL. Set DATABASE_URL (or DATABASE_MIGRATION_URL for a direct connection).'
    );
  }
  return url;
}

async function ensureTrackingTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedSet(pool: Pool): Promise<Set<string>> {
  const result = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((r: { filename: string }) => r.filename));
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // filename order: 01-..., 02-..., 08b sorts after 08
}

async function main(): Promise<void> {
  const baseline = process.argv.includes('--baseline');
  const connectionString = getConnectionString();

  const pool = new Pool({
    connectionString,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  try {
    await ensureTrackingTable(pool);
    const applied = await appliedSet(pool);
    const files = listMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    if (baseline) {
      for (const file of pending) {
        await pool.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        console.log(`baselined  ${file}`);
      }
      console.log(`Baseline complete — ${pending.length} file(s) marked applied without running.`);
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`applied    ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`FAILED     ${file}`);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`Done — ${pending.length} migration(s) applied.`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('Migration run failed:', err?.message || err);
  process.exit(1);
});
