// ============================================================================
// RIDER APPLICATION SCHEMA — idempotent rider_applications table (migration 29).
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

export async function hasRiderApplicationsTable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'rider_applications' LIMIT 1`
    );
    cached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe rider_applications table', { error: error?.message });
    cached = false;
  }
  return cached;
}

export async function ensureRiderApplicationsTable(): Promise<boolean> {
  if (cached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasRiderApplicationsTable()) return true;
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
        CREATE TABLE IF NOT EXISTS rider_applications (
          id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          full_name     VARCHAR(255) NOT NULL,
          phone         VARCHAR(20)  NOT NULL,
          city          VARCHAR(120),
          city_id       UUID REFERENCES service_cities(id) ON DELETE SET NULL,
          area          VARCHAR(255),
          vehicle_type  VARCHAR(50),
          message       TEXT,
          status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','reviewing','approved','rejected')),
          admin_notes   TEXT,
          user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS rider_applications_status_idx ON rider_applications (status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS rider_applications_city_idx ON rider_applications (city_id)`);
      try {
        await pool.query(`
          INSERT INTO permissions (code, description, category) VALUES
            ('rider_applications.view',   'View rider applications', 'Riders'),
            ('rider_applications.manage', 'Manage rider applications + page content', 'Riders')
          ON CONFLICT (code) DO NOTHING`);
      } catch (permErr: any) {
        logger.warn('Could not seed rider_applications permissions', { error: permErr?.message });
      }
      cached = true;
      logger.info('rider_applications table ensured (migration 29 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply rider_applications migration — run database/migrations/29 manually', {
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
