// ============================================================================
// FEEDBACK SCHEMA — idempotent reviews + complaints migration (migration 24).
// Mirrors productSchema.ts / orderSchema.ts: probe information_schema, run the
// DDL on a direct (non-pooler) connection, cache the result so controllers can
// fall back gracefully until the tables exist.
// ============================================================================

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';

let feedbackCached: boolean | null = null;
let ensurePromise: Promise<boolean> | null = null;

let complaintImagesCached: boolean | null = null;
let complaintImagesPromise: Promise<boolean> | null = null;

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

/** Cached probe for the `reviews` table (proxy for the whole migration). */
export async function hasFeedbackTables(): Promise<boolean> {
  if (feedbackCached !== null) return feedbackCached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reviews' LIMIT 1`
    );
    feedbackCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe reviews table', { error: error?.message });
    feedbackCached = false;
  }
  return feedbackCached;
}

async function runDdlOnConnection(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    ssl:
      process.env.DB_SSL === 'false' ||
      process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false'
        ? false
        : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_average DECIMAL(3,2) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE riders ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type  VARCHAR(20) NOT NULL CHECK (target_type IN ('product','rider','service')),
        product_id   UUID REFERENCES products(id) ON DELETE CASCADE,
        rider_id     UUID REFERENCES riders(id)   ON DELETE CASCADE,
        order_id     UUID REFERENCES orders(id)   ON DELETE SET NULL,
        city_id      UUID REFERENCES service_cities(id) ON DELETE SET NULL,
        rating       SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment      TEXT,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        admin_reply  TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_product ON reviews (user_id, order_id, product_id) WHERE target_type = 'product'`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_rider ON reviews (user_id, order_id) WHERE target_type = 'rider'`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_service ON reviews (user_id, order_id) WHERE target_type = 'service'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews (product_id) WHERE target_type = 'product'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS reviews_rider_idx ON reviews (rider_id) WHERE target_type = 'rider'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS reviews_user_idx ON reviews (user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS reviews_city_idx ON reviews (city_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_number  VARCHAR(20) UNIQUE NOT NULL,
        user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id       UUID REFERENCES orders(id)  ON DELETE SET NULL,
        rider_id       UUID REFERENCES riders(id)  ON DELETE SET NULL,
        city_id        UUID REFERENCES service_cities(id) ON DELETE SET NULL,
        category       VARCHAR(40)  NOT NULL DEFAULT 'other',
        subject        VARCHAR(200) NOT NULL,
        message        TEXT NOT NULL,
        status         VARCHAR(20)  NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
        priority       VARCHAR(10)  NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
        images         TEXT[],
        admin_response TEXT,
        resolved_at    TIMESTAMPTZ,
        resolved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS complaints_user_idx ON complaints (user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS complaints_city_idx ON complaints (city_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS complaints_order_idx ON complaints (order_id)`);

    // Permission seeding is best-effort — never block table creation on it.
    try {
      await pool.query(`
        INSERT INTO permissions (code, description, category) VALUES
          ('reviews.view',     'View product / rider / service reviews', 'Support'),
          ('reviews.manage',   'Moderate / reply to reviews',            'Support'),
          ('complaints.view',  'View customer complaints',               'Support'),
          ('complaints.manage','Respond to / resolve complaints',        'Support')
        ON CONFLICT (code) DO NOTHING`);
    } catch (permErr: any) {
      logger.warn('Could not seed reviews/complaints permissions', { error: permErr?.message });
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Apply migration 24 if needed. Returns true when the tables exist. */
export async function ensureFeedbackTables(): Promise<boolean> {
  if (feedbackCached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (await hasFeedbackTables()) return true;

    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      logger.warn('reviews/complaints tables missing and no DB URL available for migration');
      return false;
    }
    try {
      await runDdlOnConnection(connectionString);
      feedbackCached = true;
      logger.info('reviews/complaints tables ensured (migration 24 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply reviews/complaints migration — run database/migrations/24-reviews-complaints.sql manually', {
        error: error?.message,
      });
      feedbackCached = false;
      return false;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}

/** Cached probe for complaints.images (added after the original migration 24). */
export async function hasComplaintImagesColumn(): Promise<boolean> {
  if (complaintImagesCached !== null) return complaintImagesCached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'complaints'
          AND column_name = 'images' LIMIT 1`
    );
    complaintImagesCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe complaints.images', { error: error?.message });
    complaintImagesCached = false;
  }
  return complaintImagesCached;
}

/** Add complaints.images to existing installs (idempotent). */
export async function ensureComplaintImagesColumn(): Promise<boolean> {
  if (complaintImagesCached === true) return true;
  if (complaintImagesPromise) return complaintImagesPromise;

  complaintImagesPromise = (async () => {
    if (await hasComplaintImagesColumn()) return true;
    const connectionString = getMigrationConnectionString();
    if (!connectionString) return false;
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
      await pool.query(`ALTER TABLE complaints ADD COLUMN IF NOT EXISTS images TEXT[]`);
      complaintImagesCached = true;
      logger.info('complaints.images column ensured');
      return true;
    } catch (error: any) {
      logger.warn('Could not add complaints.images column', { error: error?.message });
      complaintImagesCached = false;
      return false;
    } finally {
      await pool.end().catch(() => undefined);
      complaintImagesPromise = null;
    }
  })();

  return complaintImagesPromise;
}
