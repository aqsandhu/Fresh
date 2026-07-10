// ============================================================================
// FEATURE SCHEMA — idempotent bootstrap for the 2026-06 epic tables.
// Mirrors reconciliationSchema: creates the new feature tables on boot so the
// app works even before the owner runs migrations 43-46 by hand. Safe to run
// repeatedly (CREATE TABLE IF NOT EXISTS).
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

/** Cached probe: abandoned_carts is the marker for the epic tables. */
export async function hasFeatureTables(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'abandoned_carts' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe feature tables', { error: error?.message });
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
    // 43 — service areas (polygon delivery boundaries)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_areas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        city_id UUID REFERENCES service_cities(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL DEFAULT 'Service Area',
        polygon JSONB NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_areas_city ON service_areas(city_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_areas_city_active ON service_areas(city_id, is_active)`);

    // 44 — Today's Basket combos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS baskets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        city_id UUID REFERENCES service_cities(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
        image_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS basket_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        basket_id UUID NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quality VARCHAR(1) NOT NULL DEFAULT 'A',
        quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
        unit VARCHAR(20) NOT NULL DEFAULT 'full',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_baskets_city_active ON baskets(city_id, is_active)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_basket_items_basket ON basket_items(basket_id)`);

    // 45 — franchise inquiries
    await pool.query(`
      CREATE TABLE IF NOT EXISTS franchise_inquiries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        email VARCHAR(150),
        city VARCHAR(120),
        message TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_franchise_inquiries_status ON franchise_inquiries(status, created_at DESC)`);

    // 46 — abandoned carts (marketing)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS abandoned_carts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id VARCHAR(64) NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        city_id UUID REFERENCES service_cities(id) ON DELETE SET NULL,
        phone VARCHAR(30),
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        item_count INTEGER NOT NULL DEFAULT 0,
        subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reminded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_abandoned_carts_device ON abandoned_carts(device_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_abandoned_carts_user ON abandoned_carts(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status_activity ON abandoned_carts(status, last_activity_at)`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Create the epic feature tables if missing. Returns true when present. */
export async function ensureFeatureTables(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasFeatureTables()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('feature tables missing and no DB URL available for migration');
      return false;
    }
    try {
      await runDdl(connectionString);
      cached = true;
      logger.info('feature tables ensured (service_areas, baskets, franchise_inquiries, abandoned_carts)');
      return true;
    } catch (error: any) {
      logger.warn('Could not create feature tables', { error: error?.message });
      cached = false;
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}
