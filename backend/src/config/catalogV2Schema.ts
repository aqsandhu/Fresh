// ============================================================================
// CATALOG V2 SCHEMA (migration 37) — idempotent bootstrap.
// Mirrors productSchema.ts: probe information_schema, run the DDL on a direct
// (non-pooler) connection, cache the result so controllers can gate new-column
// usage until it exists. Adds:
//   * per-quality consumer/restaurant enable flags + B/C & restaurant fraction prices
//   * reserved_quantity{,_b,_c} (soft holds) + orders.stock_reserved
//   * orders.replacement_for_order_id / complaint_id
//   * stock_movements (system ledger) + refunds (complaint refunds)
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

/** Cached probe: products.reserved_quantity is the migration-37 marker column. */
export async function hasCatalogV2Columns(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'
          AND column_name = 'reserved_quantity' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe products.reserved_quantity', { error: error?.message });
    cached = false;
  }
  return cached;
}

async function runCatalogV2Ddl(connectionString: string): Promise<void> {
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
    // Mirror of database/migrations/37-catalog-v2-stock.sql.
    const enableFlags = [
      ['consumer_enabled_a', 'TRUE'], ['consumer_enabled_b', 'TRUE'], ['consumer_enabled_c', 'TRUE'],
      ['restaurant_enabled_a', 'FALSE'], ['restaurant_enabled_b', 'FALSE'], ['restaurant_enabled_c', 'FALSE'],
    ];
    for (const [col, def] of enableFlags) {
      await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col} BOOLEAN NOT NULL DEFAULT ${def}`);
    }
    const fractionCols = [
      'half_kg_price_b', 'quarter_kg_price_b', 'half_dozen_price_b',
      'half_kg_price_c', 'quarter_kg_price_c', 'half_dozen_price_c',
      'restaurant_half_kg_price_a', 'restaurant_quarter_kg_price_a', 'restaurant_half_dozen_price_a',
      'restaurant_half_kg_price_b', 'restaurant_quarter_kg_price_b', 'restaurant_half_dozen_price_b',
      'restaurant_half_kg_price_c', 'restaurant_quarter_kg_price_c', 'restaurant_half_dozen_price_c',
    ];
    for (const col of fractionCols) {
      await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col} NUMERIC(10,2)`);
    }
    // Preserve existing restaurant offerings: products previously available to
    // restaurants keep their priced tiers enabled. Runs once (the marker column
    // was just added), and only on rows still at the all-false default.
    await pool.query(`
      UPDATE products SET
        restaurant_enabled_a = TRUE,
        restaurant_enabled_b = (price_b IS NOT NULL),
        restaurant_enabled_c = (price_c IS NOT NULL)
      WHERE available_for_restaurants = TRUE
        AND restaurant_enabled_a = FALSE AND restaurant_enabled_b = FALSE AND restaurant_enabled_c = FALSE`);

    for (const col of ['reserved_quantity', 'reserved_quantity_b', 'reserved_quantity_c']) {
      await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col} NUMERIC(12,3) NOT NULL DEFAULT 0`);
    }
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_reserved_nonneg') THEN
          ALTER TABLE products ADD CONSTRAINT products_reserved_nonneg
            CHECK (reserved_quantity >= 0 AND reserved_quantity_b >= 0 AND reserved_quantity_c >= 0);
        END IF;
      END $$;`);

    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS replacement_for_order_id UUID REFERENCES orders(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS complaint_id UUID`);
    await pool.query(`CREATE INDEX IF NOT EXISTS orders_replacement_for_idx ON orders (replacement_for_order_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quality       VARCHAR(1) NOT NULL DEFAULT 'A',
        city_id       UUID REFERENCES service_cities(id),
        delta         NUMERIC(12,3) NOT NULL,
        reason        VARCHAR(20) NOT NULL,
        ref_order_id  UUID,
        ref_ocp_id    UUID,
        note          TEXT,
        created_by    UUID,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements (product_id, quality)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS stock_movements_order_idx   ON stock_movements (ref_order_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements (created_at DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        complaint_id             UUID,
        amount                   NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        original_payment_source  VARCHAR(10) NOT NULL DEFAULT 'admin',
        note                     TEXT,
        refunded_by              UUID,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS refunds_order_idx     ON refunds (order_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS refunds_complaint_idx ON refunds (complaint_id)`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Apply migration 37 if needed. Returns true when the columns exist. */
export async function ensureCatalogV2Columns(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasCatalogV2Columns()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('catalog-v2 columns missing and no DB URL available for migration');
      return false;
    }
    try {
      await runCatalogV2Ddl(connectionString);
      cached = true;
      logger.info('catalog-v2 columns ensured (migration 37 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply catalog-v2 migration — run database/migrations/37-catalog-v2-stock.sql manually', {
        error: error?.message,
      });
      cached = false;
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}
