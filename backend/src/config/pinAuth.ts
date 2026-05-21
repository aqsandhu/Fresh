// ============================================================================
// PIN AUTH DB SETUP — idempotent column migration + safe column detection
// ============================================================================
// Supabase *pooler* (port 6543) often rejects DDL. We probe information_schema
// first and never SELECT pin_hash until the column exists.

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';

let pinColumnsCached: boolean | null = null;

function isMissingColumnError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const code = err?.code;
  const msg = String(err?.message || '');
  return code === '42703' || msg.includes('pin_hash') || msg.includes('does not exist');
}

/** Check whether users.pin_hash exists (cached after first probe). */
export async function hasPinColumns(): Promise<boolean> {
  if (pinColumnsCached !== null) return pinColumnsCached;

  try {
    const result = await query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'pin_hash'
        LIMIT 1`
    );
    pinColumnsCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe pin_hash column', { error: error?.message });
    pinColumnsCached = false;
  }

  return pinColumnsCached;
}

/** Derive a direct DB URL for DDL when Render uses Supabase pooler on :6543. */
function getMigrationConnectionString(): string | null {
  const direct = process.env.DATABASE_MIGRATION_URL || process.env.DIRECT_DATABASE_URL;
  if (direct) return direct;

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  // Supabase pooler → direct host (best-effort; override with DATABASE_MIGRATION_URL if needed)
  if (url.includes('pooler.supabase.com') && url.includes(':6543')) {
    try {
      const parsed = new URL(url);
      const user = parsed.username; // postgres.PROJECT_REF
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

async function runAlterOnConnection(connectionString: string): Promise<boolean> {
  const pool = new Pool({
    connectionString,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  try {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255)
    `);
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ
    `);
    return true;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Try to add pin columns. Returns true when columns are present afterward. */
export async function ensurePinColumns(): Promise<boolean> {
  if (await hasPinColumns()) return true;

  const migrationUrl = getMigrationConnectionString();
  if (!migrationUrl) {
    logger.warn('PIN columns missing and no DATABASE_URL for migration');
    return false;
  }

  try {
    await runAlterOnConnection(migrationUrl);
    pinColumnsCached = null;
    const ready = await hasPinColumns();
    if (ready) {
      logger.info('PIN auth columns added on users table');
    } else {
      logger.warn(
        'PIN columns still missing after migration attempt — run database/migrations/01-add-pin-to-users.sql in Supabase SQL Editor'
      );
    }
    return ready;
  } catch (error: any) {
    logger.warn('Could not add PIN columns automatically', { error: error?.message });
    pinColumnsCached = false;
    return false;
  }
}

/** Lookup user for pin-status without touching pin_hash when column is absent. */
export async function getPinStatusForPhone(
  normalizedPhone: string
): Promise<{ exists: boolean; hasPin: boolean; fullName?: string }> {
  await ensurePinColumns();
  const pinReady = await hasPinColumns();

  if (pinReady) {
    try {
      const result = await query<{ has_pin: boolean; full_name: string }>(
        `SELECT pin_hash IS NOT NULL AS has_pin, full_name
           FROM users
          WHERE phone = $1 AND deleted_at IS NULL`,
        [normalizedPhone]
      );
      if (result.rows.length === 0) {
        return { exists: false, hasPin: false };
      }
      return {
        exists: true,
        hasPin: !!result.rows[0].has_pin,
        fullName: result.rows[0].full_name,
      };
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      pinColumnsCached = false;
    }
  }

  const fallback = await query<{ full_name: string }>(
    `SELECT full_name FROM users WHERE phone = $1 AND deleted_at IS NULL`,
    [normalizedPhone]
  );
  if (fallback.rows.length === 0) {
    return { exists: false, hasPin: false };
  }
  return { exists: true, hasPin: false, fullName: fallback.rows[0].full_name };
}

export { isMissingColumnError };
