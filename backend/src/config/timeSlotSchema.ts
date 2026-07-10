// ============================================================================
// TIME-SLOT BOOKINGS SCHEMA — idempotent bootstrap.
// Mirrors catalogV2Schema.ts: probe information_schema, run the DDL on a direct
// (non-pooler) connection, cache the result.
//
// time_slots.booked_orders is a SINGLE global counter shared across every
// delivery date, so capacity could never be enforced per day (a slot "filled"
// on one date blocked all dates, and a cancellation freed capacity on every
// date). This adds a per-(slot, date) counter that the checkout claims against.
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

/** Cached probe: the time_slot_bookings table is the marker. */
export async function hasTimeSlotBookings(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'time_slot_bookings' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe time_slot_bookings', { error: error?.message });
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS time_slot_bookings (
        time_slot_id  UUID NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
        delivery_date DATE NOT NULL,
        booked_count  INTEGER NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (time_slot_id, delivery_date)
      )`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS time_slot_bookings_date_idx ON time_slot_bookings (delivery_date)`
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Create the per-date capacity table if missing. Returns true when present. */
export async function ensureTimeSlotBookings(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasTimeSlotBookings()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('time_slot_bookings missing and no DB URL available for migration');
      return false;
    }
    try {
      await runDdl(connectionString);
      cached = true;
      logger.info('time_slot_bookings table ensured');
      return true;
    } catch (error: any) {
      logger.warn('Could not create time_slot_bookings', { error: error?.message });
      cached = false;
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}
