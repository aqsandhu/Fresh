// ============================================================================
// ORDER SCHEMA — idempotent coupon-column migration + safe column detection
// ----------------------------------------------------------------------------
// Mirrors the pinAuth/addressSchema pattern: probe information_schema first,
// run the ALTER on a direct (non-pooler) connection, and cache the result so
// createOrder can fall back gracefully until migration 18 has been applied.
// ============================================================================

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';

let couponColumnsCached: boolean | null = null;
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

/** Check whether orders.coupon_discount exists (cached after first probe). */
export async function hasOrderCouponColumns(): Promise<boolean> {
  if (couponColumnsCached !== null) return couponColumnsCached;

  try {
    const result = await query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'coupon_discount'
        LIMIT 1`
    );
    couponColumnsCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe orders.coupon_discount column', { error: error?.message });
    couponColumnsCached = false;
  }

  return couponColumnsCached;
}

async function runAlterOnConnection(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  try {
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10,2) DEFAULT 0.00
    `);
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50)
    `);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Apply migration 18 if needed. Returns true when the columns exist. */
export async function ensureOrderCouponColumns(): Promise<boolean> {
  if (couponColumnsCached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasOrderCouponColumns()) return true;

    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('orders coupon columns missing and no DB URL available for migration');
      return false;
    }

    try {
      await runAlterOnConnection(connectionString);
      couponColumnsCached = true;
      logger.info('orders coupon columns ensured (migration 18 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply orders coupon column migration — run database/migrations/18-orders-coupon-discount.sql manually', {
        error: error?.message,
      });
      couponColumnsCached = false;
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}
