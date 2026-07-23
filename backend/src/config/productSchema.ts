// ============================================================================
// PRODUCT SCHEMA — idempotent variable-weight column migration (migration 23).
// Mirrors orderSchema.ts: probe information_schema, run the ALTER on a direct
// (non-pooler) connection, cache the result so controllers can fall back
// gracefully until the columns exist.
// ============================================================================

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';
import { buildSslConfig } from './dbSsl';

let varWeightCached: boolean | null = null;
let ensurePromise: Promise<boolean> | null = null;

let unitToggleCached: boolean | null = null;
let unitTogglePromise: Promise<boolean> | null = null;

let qualityCatalogCached: boolean | null = null;
let qualityCatalogPromise: Promise<boolean> | null = null;

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

/** Cached probe for products.is_variable_weight. */
export async function hasVariableWeightColumns(): Promise<boolean> {
  if (varWeightCached !== null) return varWeightCached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'
          AND column_name = 'is_variable_weight' LIMIT 1`
    );
    varWeightCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe products.is_variable_weight', { error: error?.message });
    varWeightCached = false;
  }
  return varWeightCached;
}

async function runAlterOnConnection(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    await pool.query(
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_variable_weight BOOLEAN NOT NULL DEFAULT FALSE`
    );
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS variable_weight_note TEXT`);
    await pool.query(
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_weight_kg DECIMAL(8,3)`
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Cached probe for products.allow_half_kg (migration 25). */
export async function hasUnitToggleColumns(): Promise<boolean> {
  if (unitToggleCached !== null) return unitToggleCached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'
          AND column_name = 'allow_half_kg' LIMIT 1`
    );
    unitToggleCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe products.allow_half_kg', { error: error?.message });
    unitToggleCached = false;
  }
  return unitToggleCached;
}

async function runUnitToggleAlter(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    await pool.query(
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_half_kg BOOLEAN NOT NULL DEFAULT TRUE`
    );
    await pool.query(
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_quarter_kg BOOLEAN NOT NULL DEFAULT TRUE`
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Apply migration 25 if needed. Returns true when the columns exist. */
export async function ensureUnitToggleColumns(): Promise<boolean> {
  if (unitToggleCached === true) return true;
  if (unitTogglePromise) return unitTogglePromise;

  unitTogglePromise = (async () => {
    if (await hasUnitToggleColumns()) return true;

    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('unit-toggle columns missing and no DB URL available for migration');
      return false;
    }
    try {
      await runUnitToggleAlter(connectionString);
      unitToggleCached = true;
      logger.info('unit-toggle columns ensured (migration 25 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply unit-toggle migration — run database/migrations/25-unit-fraction-toggles.sql manually', {
        error: error?.message,
      });
      unitToggleCached = false;
      return false;
    } finally {
      unitTogglePromise = null;
    }
  })();

  return unitTogglePromise;
}

/** Apply migration 23 if needed. Returns true when the columns exist. */
export async function ensureVariableWeightColumns(): Promise<boolean> {
  if (varWeightCached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasVariableWeightColumns()) return true;

    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('variable-weight columns missing and no DB URL available for migration');
      return false;
    }
    try {
      await runAlterOnConnection(connectionString);
      varWeightCached = true;
      logger.info('variable-weight columns ensured (migration 23 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply variable-weight migration — run database/migrations/23-variable-weight.sql manually', {
        error: error?.message,
      });
      varWeightCached = false;
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}

// ── Unified quality catalog (migration 34) ───────────────────────────────────
// ONE product row, ONE shared stock, per QUALITY tier (A/B/C). Replaces the old
// separate-restaurant model (is_restaurant / quality_b_price / quality_c_price).
//   * Consumer price per tier:  price (A), price_b, price_c
//   * Shared stock per tier:    stock_quantity (A), stock_quantity_b, stock_quantity_c
//   * Restaurant price per tier: restaurant_price_a / _b / _c
//   * categories/products.available_for_restaurants — show on restaurant storefront
// Probed via products.available_for_restaurants.
export async function hasQualityCatalogColumns(): Promise<boolean> {
  if (qualityCatalogCached !== null) return qualityCatalogCached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'
          AND column_name = 'available_for_restaurants' LIMIT 1`
    );
    qualityCatalogCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe products.available_for_restaurants', { error: error?.message });
    qualityCatalogCached = false;
  }
  return qualityCatalogCached;
}

async function runQualityCatalogAlter(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    // Mirror of database/migrations/34-unified-quality-catalog.sql.
    // 1) Remove the OLD separate-restaurant catalog rows (history-safe: order_items
    //    keeps its own snapshot and its product_id FK is ON DELETE SET NULL).
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='products' AND column_name='is_restaurant') THEN
          DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE is_restaurant = TRUE);
          DELETE FROM products WHERE is_restaurant = TRUE;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='categories' AND column_name='is_restaurant') THEN
          DELETE FROM categories WHERE is_restaurant = TRUE;
        END IF;
      END $$;`);

    // 2) Drop the old model's columns + indexes.
    await pool.query(`DROP INDEX IF EXISTS products_is_restaurant_idx`);
    await pool.query(`DROP INDEX IF EXISTS categories_is_restaurant_idx`);
    await pool.query(`ALTER TABLE products   DROP COLUMN IF EXISTS is_restaurant`);
    await pool.query(`ALTER TABLE products   DROP COLUMN IF EXISTS quality_b_price`);
    await pool.query(`ALTER TABLE products   DROP COLUMN IF EXISTS quality_c_price`);
    await pool.query(`ALTER TABLE categories DROP COLUMN IF EXISTS is_restaurant`);

    // 3) Add the new unified-quality columns.
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_b NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_c NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity_b NUMERIC(10,3) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity_c NUMERIC(10,3) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_price_a NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_price_b NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_price_c NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE products   ADD COLUMN IF NOT EXISTS available_for_restaurants BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS available_for_restaurants BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE cart_items  ADD COLUMN IF NOT EXISTS quality VARCHAR(1) NOT NULL DEFAULT 'A'`);
    await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quality VARCHAR(1)`);

    // 4) Restaurant-storefront filter indexes.
    await pool.query(`CREATE INDEX IF NOT EXISTS products_avail_restaurants_idx   ON products (available_for_restaurants)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS categories_avail_restaurants_idx ON categories (available_for_restaurants)`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Apply migration 34 if needed. Returns true when the new columns exist. */
export async function ensureQualityCatalogColumns(): Promise<boolean> {
  if (qualityCatalogCached === true) return true;
  if (qualityCatalogPromise) return qualityCatalogPromise;

  qualityCatalogPromise = (async () => {
    if (await hasQualityCatalogColumns()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('quality-catalog columns missing and no DB URL available for migration');
      return false;
    }
    try {
      await runQualityCatalogAlter(connectionString);
      qualityCatalogCached = true;
      logger.info('quality-catalog columns ensured (migration 34 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply quality-catalog migration — run database/migrations/34 manually', {
        error: error?.message,
      });
      qualityCatalogCached = false;
      return false;
    } finally {
      qualityCatalogPromise = null;
    }
  })();

  return qualityCatalogPromise;
}
