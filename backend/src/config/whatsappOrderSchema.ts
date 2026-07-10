// ============================================================================
// WHATSAPP ORDER SCHEMA — idempotent customer/address link columns (migration 27).
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

/** Cached probe for whatsapp_orders.address_id. */
export async function hasWhatsappLinkColumns(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'whatsapp_orders'
          AND column_name = 'address_id' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe whatsapp_orders.address_id', { error: error?.message });
    cached = false;
  }
  return cached;
}

/** Apply migration 27 if needed. */
export async function ensureWhatsappLinkColumns(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasWhatsappLinkColumns()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) return false;
    const pool = new Pool({
      connectionString,
      ssl: buildSslConfig(connectionString),
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      await pool.query(`ALTER TABLE whatsapp_orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE whatsapp_orders ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES addresses(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE whatsapp_orders ADD COLUMN IF NOT EXISTS door_picture_url TEXT`);
      await pool.query(`CREATE INDEX IF NOT EXISTS whatsapp_orders_user_idx ON whatsapp_orders (user_id)`);
      cached = true;
      logger.info('whatsapp_orders customer-link columns ensured (migration 27 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply whatsapp_orders link migration — run database/migrations/27 manually', {
        error: error?.message,
      });
      cached = false;
      return false;
    } finally {
      await pool.end().catch(() => undefined);
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}
