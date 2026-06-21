// ============================================================================
// INTERNAL-CONTROL COLUMNS — idempotent bootstrap.
// Adds the audit/approval columns that anti-fraud controls need:
//   * refunds        : approved_by / approved_at / proof_url / reason
//   * orders         : discount_approved_by / discount_approved_at
//                      (free/discounted manual orders = complaint replacements)
// Mirrors catalogV2Schema.ts (probe → DDL on a direct connection → cache).
// ============================================================================

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';

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

/** Cached probe: refunds.approved_by is the marker column for this migration. */
export async function hasControlColumns(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'refunds'
          AND column_name = 'approved_by' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe refunds.approved_by', { error: error?.message });
    cached = false;
  }
  return cached;
}

async function runDdl(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl:
      process.env.DB_SSL === 'false' || process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false'
        ? false
        : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    for (const col of [
      'approved_by UUID',
      'approved_at TIMESTAMPTZ',
      'proof_url TEXT',
      'reason TEXT',
    ]) {
      await pool.query(`ALTER TABLE refunds ADD COLUMN IF NOT EXISTS ${col}`);
    }
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_approved_by UUID`);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_approved_at TIMESTAMPTZ`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Add the internal-control columns if missing. Returns true when present. */
export async function ensureControlColumns(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasControlColumns()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('control columns missing and no DB URL available for migration');
      return false;
    }
    try {
      await runDdl(connectionString);
      cached = true;
      logger.info('internal-control columns ensured');
      return true;
    } catch (error: any) {
      logger.warn('Could not add internal-control columns', { error: error?.message });
      cached = false;
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}
