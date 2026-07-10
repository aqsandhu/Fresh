// ============================================================================
// RECONCILIATION SCHEMA — idempotent bootstrap.
// The owner's automatic watchdog: it stores a periodic snapshot of physical
// on-hand stock and a history of reconciliation runs, so the system can prove
// (without anyone watching) that every change in on-hand was explained by the
// audited ledger, and surface money/stock anomalies. Mirrors catalogV2Schema.
// ============================================================================

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';
import { buildSslConfig } from './dbSsl';

let cached: boolean | null = null;
let ensurePromise: Promise<boolean> | null = null;

function getMigrationConnectionString(): string | null {
  const direct = process.env.DATABASE_MIGRATION_URL || process.env.DIRECT_DATABASE_URL;
  if (direct) return direct;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (url.includes('pooler.supabase.com') && url.includes(':6543')) {
    try {
      const parsed = new URL(url);
      const user = parsed.username;
      const projectRef = user.includes('.') ? user.split('.')[1] : user.replace('postgres', '');
      const password = parsed.password;
      if (projectRef && password) {
        return `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
      }
    } catch {
      /* fall through */
    }
  }
  return url;
}

/** Cached probe: the reconciliation_runs table is the marker. */
export async function hasReconciliationTables(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reconciliation_runs' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe reconciliation_runs', { error: error?.message });
    cached = false;
  }
  return cached;
}

async function runDdl(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    // Latest on-hand snapshot per product+quality (one row each, upserted each
    // run). The next run compares the change since `taken_at` to the ledger.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_snapshots (
        product_id UUID NOT NULL,
        quality    VARCHAR(1) NOT NULL DEFAULT 'A',
        on_hand    NUMERIC(12,3) NOT NULL DEFAULT 0,
        taken_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (product_id, quality)
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_runs (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        window_from   TIMESTAMPTZ,
        anomaly_count INTEGER NOT NULL DEFAULT 0,
        summary       JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by    UUID
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS reconciliation_runs_at_idx ON reconciliation_runs (run_at DESC)`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Create the reconciliation tables if missing. Returns true when present. */
export async function ensureReconciliationTables(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasReconciliationTables()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('reconciliation tables missing and no DB URL available for migration');
      return false;
    }
    try {
      await runDdl(connectionString);
      cached = true;
      logger.info('reconciliation tables ensured');
      return true;
    } catch (error: any) {
      logger.warn('Could not create reconciliation tables', { error: error?.message });
      cached = false;
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}
