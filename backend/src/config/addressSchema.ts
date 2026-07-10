// ============================================================================
// ADDRESS SCHEMA — idempotent column migration + safe column detection
// ============================================================================

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';
import { buildSslConfig } from './dbSsl';

let locationAddedByCached: boolean | null = null;
let addressMigrationsDone = false;

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

export async function hasLocationAddedByColumn(): Promise<boolean> {
  if (locationAddedByCached !== null) return locationAddedByCached;

  try {
    const result = await query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'addresses'
          AND column_name = 'location_added_by'
        LIMIT 1`
    );
    locationAddedByCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe location_added_by column', { error: error?.message });
    locationAddedByCached = false;
  }

  return locationAddedByCached;
}

async function runAddressMigrationsOnConnection(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  try {
    await pool.query(`
      ALTER TABLE addresses
        ADD COLUMN IF NOT EXISTS location_added_by VARCHAR(20) DEFAULT 'user'
    `);
    await pool.query(`
      ALTER TABLE addresses
        ALTER COLUMN door_picture_url DROP NOT NULL
    `);
    await pool.query(`
      ALTER TABLE addresses
        ALTER COLUMN location DROP NOT NULL
    `);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Run idempotent address table migrations (safe to call on every boot / request). */
export async function ensureAddressColumns(): Promise<boolean> {
  if (addressMigrationsDone) {
    return hasLocationAddedByColumn();
  }

  const migrationUrl = getMigrationConnectionString();
  if (!migrationUrl) {
    logger.warn('Address schema migrations skipped — no DATABASE_URL');
    return false;
  }

  try {
    await runAddressMigrationsOnConnection(migrationUrl);
    addressMigrationsDone = true;
    locationAddedByCached = null;
    const ready = await hasLocationAddedByColumn();
    logger.info('Address schema migrations applied', { location_added_by: ready });
    return true;
  } catch (error: any) {
    logger.warn(
      'Could not apply address schema migrations automatically — run database/migrations/02-add-location-added-by-to-addresses.sql in Supabase SQL Editor',
      { error: error?.message }
    );
    return false;
  }
}
