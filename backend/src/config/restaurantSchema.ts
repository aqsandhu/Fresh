// ============================================================================
// RESTAURANT SCHEMA — idempotent restaurants table (migration 30).
// B2B accounts: a restaurant registers (phone + 4-digit PIN), an admin reviews
// & approves it, then it logs in to the restaurant storefront.
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

export async function hasRestaurantsTable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'restaurants' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe restaurants table', { error: error?.message });
    cached = false;
  }
  return cached;
}

export async function ensureRestaurantsTable(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasRestaurantsTable()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) return false;
    const pool = new Pool({
      connectionString,
      ssl: buildSslConfig(connectionString),
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS restaurants (
          id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          business_name   VARCHAR(255) NOT NULL,
          owner_name      VARCHAR(255),
          -- Phone uniqueness is enforced by the PARTIAL index below (one LIVE
          -- account per phone) so a soft-removed restaurant can re-register.
          phone           VARCHAR(20)  NOT NULL,
          pin_hash        VARCHAR(255) NOT NULL,
          email           VARCHAR(255),
          address         TEXT,
          city            VARCHAR(120),
          city_id         UUID REFERENCES service_cities(id) ON DELETE SET NULL,
          location        GEOGRAPHY(POINT, 4326),
          status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','disabled','banned')),
          -- Per-restaurant delivery overrides (NULL = use the global restaurant
          -- delivery settings).
          free_delivery_threshold NUMERIC(10,2),
          delivery_base_charge    NUMERIC(10,2),
          admin_notes     TEXT,
          approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
          approved_at     TIMESTAMPTZ,
          last_login_at   TIMESTAMPTZ,
          login_count     INTEGER NOT NULL DEFAULT 0,
          deleted_at      TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS restaurants_status_idx ON restaurants (status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS restaurants_city_idx ON restaurants (city_id)`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS restaurants_phone_live_idx ON restaurants (phone) WHERE deleted_at IS NULL`);
      try {
        await pool.query(`
          INSERT INTO permissions (code, description, category) VALUES
            ('restaurants.view',   'View restaurant accounts + requests', 'Restaurants'),
            ('restaurants.manage', 'Approve / disable / ban / remove restaurants + settings', 'Restaurants')
          ON CONFLICT (code) DO NOTHING`);
      } catch (permErr: any) {
        logger.warn('Could not seed restaurants permissions', { error: permErr?.message });
      }
      cached = true;
      logger.info('restaurants table ensured (migration 30 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply restaurants migration — run database/migrations/30 manually', {
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

// ── Migration 35: restaurant delivery config + editable profile ─────────────
// time_slots.audience separates restaurant slots from consumer slots;
// restaurants.front_image_url stores the storefront photo. Probed via
// time_slots.audience. Runs idempotently each boot.
let deliveryColsCached: boolean | null = null;
let deliveryColsPromise: Promise<boolean> | null = null;

export async function hasRestaurantDeliveryColumns(): Promise<boolean> {
  if (deliveryColsCached !== null) return deliveryColsCached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'time_slots'
          AND column_name = 'audience' LIMIT 1`
    );
    deliveryColsCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe time_slots.audience', { error: error?.message });
    deliveryColsCached = false;
  }
  return deliveryColsCached;
}

export async function ensureRestaurantDeliveryColumns(): Promise<boolean> {
  if (deliveryColsCached === true) return true;
  if (deliveryColsPromise) return deliveryColsPromise;

  deliveryColsPromise = (async () => {
    if (await hasRestaurantDeliveryColumns()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) return false;
    const pool = new Pool({
      connectionString,
      ssl: buildSslConfig(connectionString),
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      await pool.query(`ALTER TABLE time_slots  ADD COLUMN IF NOT EXISTS audience VARCHAR(20) NOT NULL DEFAULT 'consumer'`);
      await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS front_image_url TEXT`);
      await pool.query(`CREATE INDEX IF NOT EXISTS time_slots_audience_idx ON time_slots (audience)`);
      deliveryColsCached = true;
      logger.info('restaurant delivery columns ensured (migration 35 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply restaurant-delivery migration — run database/migrations/35 manually', {
        error: error?.message,
      });
      deliveryColsCached = false;
      return false;
    } finally {
      await pool.end().catch(() => undefined);
      deliveryColsPromise = null;
    }
  })();

  return deliveryColsPromise;
}

// ── Migration 33: relax phone uniqueness to LIVE rows only ──────────────────
// The original table created a plain UNIQUE column constraint on phone
// (restaurants_phone_key), which counts soft-deleted rows and so blocks a
// removed restaurant from re-registering. Drop it and rely on the partial
// unique index (one live account per phone). Runs idempotently each boot.
let phoneUniqueCached = false;
let phoneUniquePromise: Promise<void> | null = null;

export async function ensureRestaurantPhoneUnique(): Promise<void> {
  if (phoneUniqueCached) return;
  if (phoneUniquePromise) return phoneUniquePromise;

  phoneUniquePromise = (async () => {
    if (!(await hasRestaurantsTable())) return;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) return;
    const pool = new Pool({
      connectionString,
      ssl: buildSslConfig(connectionString),
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      // Partial index = the real uniqueness rule (one LIVE account per phone).
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS restaurants_phone_live_idx ON restaurants (phone) WHERE deleted_at IS NULL`
      );
      // Drop the legacy plain UNIQUE constraint if it still exists.
      await pool.query(`ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_phone_key`);
      phoneUniqueCached = true;
      logger.info('restaurants phone uniqueness relaxed to live rows (migration 33)');
    } catch (error: any) {
      logger.warn('Could not relax restaurants phone uniqueness — run migration 33 manually', {
        error: error?.message,
      });
    } finally {
      await pool.end().catch(() => undefined);
      phoneUniquePromise = null;
    }
  })();

  return phoneUniquePromise;
}
