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

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { buildSslConfig } from '../config/dbSsl';

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
  // Fingerprint of the file that was applied (see checkAppliedUnchanged).
  await pool.query(`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`);
}

/** sha256 of a migration file, line endings normalised (a CRLF checkout is the same file). */
export function migrationChecksum(sql: string): string {
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n').trimEnd()).digest('hex');
}

/**
 * Editing a migration that already ran has NO effect on a database that ran
 * it — the runner tracks files by name — yet the edit looks like a fix in the
 * code. Each applied file's fingerprint is kept; a file that no longer matches
 * stops the run with a clear message (put the change in a NEW migration).
 * Rows from before fingerprints existed are fingerprinted with the current
 * file the first time, so turning this on never blocks a deploy by itself.
 * MIGRATIONS_ALLOW_EDITED=true downgrades the stop to a warning.
 */
async function checkAppliedUnchanged(pool: Pool, files: string[]): Promise<void> {
  const rows = await pool.query('SELECT filename, checksum FROM schema_migrations');
  const known = new Map<string, string | null>(rows.rows.map((r: { filename: string; checksum: string | null }) => [r.filename, r.checksum]));
  const changed: string[] = [];
  for (const file of files) {
    if (!known.has(file)) continue;
    const sum = migrationChecksum(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    const stored = known.get(file);
    if (!stored) {
      await pool.query('UPDATE schema_migrations SET checksum = $2 WHERE filename = $1 AND checksum IS NULL', [file, sum]);
    } else if (stored !== sum) {
      changed.push(file);
    }
  }
  if (changed.length) {
    const message =
      `These migrations were changed AFTER they had been applied to this database: ${changed.join(', ')}. ` +
      'The change will never run here. Restore the original file and put the change in a new migration.';
    if (process.env.MIGRATIONS_ALLOW_EDITED === 'true') {
      console.warn(`WARNING ${message}`);
    } else {
      throw new Error(message);
    }
  }
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

/**
 * Strip top-level `BEGIN;` / `COMMIT;` statements from a migration file.
 *
 * Several legacy files (05, 06, 20-29, 34-36, …) carry their own BEGIN/COMMIT
 * for manual psql runs. Inside the runner's per-file transaction a nested
 * `BEGIN;` only warns, but the file's `COMMIT;` COMMITS THE RUNNER'S
 * TRANSACTION EARLY — the tracking-row INSERT then lands in a fresh implicit
 * transaction, so a crash between the two leaves the migration applied but
 * untracked (and it re-runs on the next deploy). Removing the top-level
 * wrappers makes per-file atomicity + the tracking row truly transactional.
 *
 * Only standalone BEGIN;/COMMIT; lines OUTSIDE dollar-quoted bodies
 * (DO $$ ... $$) are removed — plpgsql BEGIN blocks inside functions are
 * untouched. Files without wrappers are returned unchanged.
 */
function stripTopLevelTransactionStatements(sql: string): string {
  const lines = sql.split('\n');
  let inDollarQuote = false;
  const kept: string[] = [];

  for (const line of lines) {
    // Count unquoted '$$' occurrences on the line to track dollar-quote state
    // (migration files use plain $$ quoting; tagged $func$ is treated the same
    // by matching /^\s*\$[A-Za-z_]*\$\s*$/ would be overkill — count all
    // '$$'-style delimiters instead).
    const delimiters = line.match(/\$[A-Za-z_0-9]*\$/g);
    if (delimiters && delimiters.length % 2 === 1) {
      inDollarQuote = !inDollarQuote;
    }

    if (!inDollarQuote && /^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line)) {
      continue; // drop top-level wrapper — runner owns the transaction
    }
    kept.push(line);
  }

  return kept.join('\n');
}

async function main(): Promise<void> {
  const baseline = process.argv.includes('--baseline');
  const connectionString = getConnectionString();

  // Same TLS policy as the app pool (config/dbSsl.ts): verified in production,
  // CA-pinnable via DB_SSL_CA. Migrations carry schema-changing SQL, so they
  // must never be the one connection that skips certificate verification.
  const pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  try {
    await ensureTrackingTable(pool);
    const applied = await appliedSet(pool);
    const files = listMigrationFiles();
    await checkAppliedUnchanged(pool, files);
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    if (baseline) {
      for (const file of pending) {
        await pool.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [file, migrationChecksum(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))]
        );
        console.log(`baselined  ${file}`);
      }
      console.log(`Baseline complete — ${pending.length} file(s) marked applied without running.`);
      return;
    }

    for (const file of pending) {
      const rawSql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      // Remove the file's own top-level BEGIN;/COMMIT; wrappers (legacy psql
      // style) so the runner's transaction below is the ONLY one — otherwise
      // the file's COMMIT; would commit early and the tracking-row insert
      // would not be atomic with the migration.
      const sql = stripTopLevelTransactionStatements(rawSql);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, migrationChecksum(rawSql)]);
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

if (require.main === module) {
  main().catch((err) => {
    console.error('Migration run failed:', err?.message || err);
    process.exit(1);
  });
}
