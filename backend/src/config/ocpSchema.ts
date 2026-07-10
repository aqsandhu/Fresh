// ============================================================================
// OCP SCHEMA — idempotent Order Collection Points tables (migration 36).
// Probe order_collection_points; if absent, apply the full DDL on a direct
// (non-pooler) connection. Mirrors restaurantSchema.ts.
// ============================================================================

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';
import { buildSslConfig } from './dbSsl';

let cached: boolean | null = null;
let ddlEnsured = false;
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

/** Cached probe for the OCP entity table. */
export async function hasOcpTables(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'order_collection_points' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe order_collection_points table', { error: error?.message });
    cached = false;
  }
  return cached;
}

export async function ensureOcpTables(): Promise<boolean> {
  if (ddlEnsured) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('OCP schema could not be ensured: no DB URL available for migration');
      return false;
    }
    const pool = new Pool({
      connectionString,
      ssl: buildSslConfig(connectionString),
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS order_collection_points (
          id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name          VARCHAR(255) NOT NULL,
          owner_name    VARCHAR(255),
          phone         VARCHAR(20)  NOT NULL,
          pin_hash      VARCHAR(255) NOT NULL,
          city_id       UUID REFERENCES service_cities(id) ON DELETE SET NULL,
          address       TEXT,
          status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
          created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
          deleted_at    TIMESTAMPTZ,
          last_login_at TIMESTAMPTZ,
          login_count   INTEGER NOT NULL DEFAULT 0,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ocp_city_idx ON order_collection_points (city_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ocp_status_idx ON order_collection_points (status)`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ocp_phone_live_idx ON order_collection_points (phone) WHERE deleted_at IS NULL`);

      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ocp_id UUID REFERENCES order_collection_points(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone_visible_to_ocp BOOLEAN NOT NULL DEFAULT FALSE`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ocp_payment_settled BOOLEAN NOT NULL DEFAULT FALSE`);
      await pool.query(`CREATE INDEX IF NOT EXISTS orders_ocp_idx ON orders (ocp_id)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ocp_stock (
          ocp_id     UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE CASCADE,
          product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          quality    VARCHAR(1) NOT NULL DEFAULT 'A',
          quantity   NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (ocp_id, product_id, quality)
        )`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ocp_stock_movements (
          id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          ocp_id         UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE CASCADE,
          product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
          quality        VARCHAR(1) NOT NULL DEFAULT 'A',
          delta          NUMERIC(12,3) NOT NULL,
          reason         VARCHAR(20) NOT NULL CHECK (reason IN ('receive','order_deduct','adjust','reverse')),
          ref_order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
          ref_request_id UUID,
          note           TEXT,
          created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ocp_stock_movements_ocp_idx ON ocp_stock_movements (ocp_id, created_at DESC)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ocp_stock_shortages (
          id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          ocp_id          UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE RESTRICT,
          product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
          order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
          quality         VARCHAR(1) NOT NULL DEFAULT 'A',
          shortage_qty    NUMERIC(12,3) NOT NULL CHECK (shortage_qty > 0),
          status          VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
          note            TEXT,
          resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
          resolved_at     TIMESTAMPTZ,
          resolution_note TEXT,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ocp_stock_shortages_ocp_idx ON ocp_stock_shortages (ocp_id, status, created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ocp_stock_shortages_order_idx ON ocp_stock_shortages (order_id)`);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ocp_stock_shortages_open_line_uniq
        ON ocp_stock_shortages (ocp_id, product_id, order_id, quality)
        WHERE status = 'open'`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ocp_stock_requests (
          id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          ocp_id      UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE CASCADE,
          city_id     UUID REFERENCES service_cities(id) ON DELETE SET NULL,
          status      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','cancelled')),
          note        TEXT,
          created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
          received_at TIMESTAMPTZ,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ocp_stock_requests_ocp_idx ON ocp_stock_requests (ocp_id, status)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ocp_stock_request_items (
          id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          request_id UUID NOT NULL REFERENCES ocp_stock_requests(id) ON DELETE CASCADE,
          product_id UUID REFERENCES products(id) ON DELETE SET NULL,
          quality    VARCHAR(1) NOT NULL DEFAULT 'A',
          quantity   NUMERIC(12,3) NOT NULL CHECK (quantity > 0)
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ocp_stock_request_items_req_idx ON ocp_stock_request_items (request_id)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ocp_settlements (
          id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          ocp_id       UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE CASCADE,
          amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
          status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','rejected')),
          note         TEXT,
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          received_at  TIMESTAMPTZ,
          received_by  UUID REFERENCES users(id) ON DELETE SET NULL
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ocp_settlements_ocp_idx ON ocp_settlements (ocp_id, status)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ocp_settlement_orders (
          settlement_id UUID NOT NULL REFERENCES ocp_settlements(id) ON DELETE CASCADE,
          order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
          PRIMARY KEY (settlement_id, order_id)
        )`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ocp_settlement_orders_order_uniq ON ocp_settlement_orders (order_id)`);

      try {
        await pool.query(`
          INSERT INTO permissions (code, description, category) VALUES
            ('ocp.manage',             'Create / manage Order Collection Points', 'OCP'),
            ('ocp.stock.send',         'Send stock to an OCP',                    'OCP'),
            ('ocp.settlements.receive','Receive OCP cash settlements',            'OCP'),
            ('ocp.shortages.manage',   'View and resolve OCP stock shortages',    'OCP')
          ON CONFLICT (code) DO NOTHING`);
      } catch (permErr: any) {
        logger.warn('Could not seed OCP permissions', { error: permErr?.message });
      }

      cached = true;
      ddlEnsured = true;
      logger.info('OCP tables ensured (current additive schema applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply OCP migration — run database/migrations/36 manually', {
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
