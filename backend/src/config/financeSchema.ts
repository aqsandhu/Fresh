// ============================================================================
// FINANCE SCHEMA (migration 38) — lazy, idempotent bootstrap.
// Mirrors catalogV2Schema.ts: probe information_schema, and if the tables are
// missing run the DDL on a direct (non-pooler) connection, caching the result.
// Controllers call ensureFinanceTables() at the top so the tables exist without
// needing a startup wiring change. Creates: expenses, stock_purchases, workers,
// worker_attendance, worker_salary_changes, profit_settings,
// profit_category_shares, shareholders, shareholder_payouts.
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

/** Cached probe: the `expenses` table is the migration-38 marker. */
export async function hasFinanceTables(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'expenses' LIMIT 1`
    );
    cached = (r.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe finance tables', { error: error?.message });
    cached = false;
  }
  return cached;
}

async function runFinanceDdl(connectionString: string): Promise<void> {
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        city_id UUID REFERENCES service_cities(id),
        type VARCHAR(20) NOT NULL,
        category VARCHAR(80),
        amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
        comment TEXT,
        ref_type VARCHAR(20),
        ref_id UUID,
        for_month DATE,
        incurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS expenses_city_idx     ON expenses (city_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS expenses_type_idx     ON expenses (type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS expenses_incurred_idx ON expenses (incurred_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS expenses_ref_idx      ON expenses (ref_type, ref_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        city_id UUID REFERENCES service_cities(id),
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        raw_weight NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (raw_weight >= 0),
        purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
        grade_a NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (grade_a >= 0),
        grade_b NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (grade_b >= 0),
        grade_c NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (grade_c >= 0),
        waste NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (waste >= 0),
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS stock_purchases_product_idx ON stock_purchases (product_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS stock_purchases_city_idx    ON stock_purchases (city_id, purchased_at DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS workers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        city_id UUID REFERENCES service_cities(id),
        name VARCHAR(120) NOT NULL,
        phone VARCHAR(20),
        designation VARCHAR(80),
        basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
        status VARCHAR(10) NOT NULL DEFAULT 'active',
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS workers_city_idx ON workers (city_id, status)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS worker_attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'present',
        note TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (worker_id, date)
      )`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS worker_salary_changes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        effective_from DATE NOT NULL,
        new_basic_salary NUMERIC(12,2) NOT NULL CHECK (new_basic_salary >= 0),
        note TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS worker_salary_changes_idx ON worker_salary_changes (worker_id, effective_from DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS profit_settings (
        city_id UUID PRIMARY KEY REFERENCES service_cities(id),
        freshbazar_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        freshbazar_mode VARCHAR(24) NOT NULL DEFAULT 'per_order_fixed',
        freshbazar_per_order NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (freshbazar_per_order >= 0),
        freshbazar_margin_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (freshbazar_margin_percent >= 0 AND freshbazar_margin_percent <= 100),
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profit_category_shares (
        city_id UUID NOT NULL REFERENCES service_cities(id),
        category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
        PRIMARY KEY (city_id, category_id)
      )`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shareholders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        city_id UUID REFERENCES service_cities(id),
        name VARCHAR(120) NOT NULL,
        email VARCHAR(160) NOT NULL,
        password_hash TEXT,
        share_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (share_percent >= 0 AND share_percent <= 100),
        status VARCHAR(10) NOT NULL DEFAULT 'active',
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS shareholders_email_uq ON shareholders (LOWER(email))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS shareholders_city_idx ON shareholders (city_id, status)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shareholder_payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shareholder_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
        city_id UUID REFERENCES service_cities(id),
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        status VARCHAR(10) NOT NULL DEFAULT 'pending',
        note TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        received_at TIMESTAMPTZ
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS shareholder_payouts_idx ON shareholder_payouts (shareholder_id, status, created_at DESC)`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Apply migration 38 if needed. Returns true once the finance tables exist. */
export async function ensureFinanceTables(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasFinanceTables()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('finance tables missing and no DB URL available for migration');
      return false;
    }
    try {
      await runFinanceDdl(connectionString);
      cached = true;
      logger.info('finance tables ensured (migration 38 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply finance migration — run database/migrations/38-finance.sql manually', {
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
