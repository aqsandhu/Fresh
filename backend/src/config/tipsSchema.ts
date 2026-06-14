// ============================================================================
// TIPS SCHEMA — idempotent user_tips table (migration 26) + recommended seed.
// Mirrors the other ensure* modules. Seeds the recommended Urdu tips as global
// rows once, so they show in the admin list and can be paused / prioritised.
// ============================================================================

import { Pool } from 'pg';
import { query } from './database';
import logger from '../utils/logger';

let tipsCached: boolean | null = null;
let ensurePromise: Promise<boolean> | null = null;

/** Recommended defaults, seeded once as global (city_id NULL) rows. */
export const RECOMMENDED_TIPS: { page: string; text: string }[] = [
  { page: 'checkout', text: 'اپنا مکمل پتہ اور دروازے کی تصویر شامل کریں تاکہ رائڈر آسانی سے آپ تک پہنچ سکے۔' },
  { page: 'checkout', text: 'ڈیلیوری کا وقت منتخب کریں — "FREE DELIVERY" والے سلاٹ پر ڈیلیوری بالکل مفت ہے۔' },
  { page: 'checkout', text: 'اگر آپ کے پاس کوپن ہے تو "Have a coupon?" میں درج کر کے Apply دبائیں۔' },
  { page: 'track', text: 'یہاں سے آپ اپنے آرڈر کی موجودہ پوزیشن دیکھ سکتے ہیں۔' },
  { page: 'track', text: 'جب رائڈر آپ کے آرڈر کے ساتھ روانہ ہو جائے تو آپ اسے کال یا میسج کر سکتے ہیں۔' },
  { page: 'orders', text: 'اپنے تمام پرانے اور موجودہ آرڈرز یہاں دیکھیں۔' },
  { page: 'orders', text: 'آرڈر ڈیلیور ہونے کے بعد پروڈکٹ، رائڈر اور سروس کو درجہ بندی دیں۔' },
  { page: 'order_detail', text: 'یہاں سے آپ آرڈر کی تفصیل، رقم، اور حالت دیکھ سکتے ہیں۔' },
  { page: 'order_detail', text: 'کسی مسئلے کی صورت میں "شکایت درج کریں" کا بٹن دبائیں۔' },
  { page: 'support', text: 'یہاں سے آپ اپنی شکایات درج اور اپنے دیے گئے ریویو دیکھ سکتے ہیں۔' },
  { page: 'support', text: 'ہر شکایت کو ایک ٹکٹ نمبر ملتا ہے جس سے آپ اس کی پیش رفت دیکھ سکتے ہیں۔' },
  { page: 'complaint', text: 'مسئلے کی قسم منتخب کریں اور مختصر مگر واضح تفصیل لکھیں۔' },
  { page: 'reviews', text: 'آپ کے دیے گئے تمام ریویو اور درجہ بندیاں یہاں محفوظ رہتی ہیں۔' },
];

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

/** Cached probe for the user_tips table. */
export async function hasTipsTable(): Promise<boolean> {
  if (tipsCached !== null) return tipsCached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_tips' LIMIT 1`
    );
    tipsCached = (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    logger.warn('Could not probe user_tips table', { error: error?.message });
    tipsCached = false;
  }
  return tipsCached;
}

async function runDdlAndSeed(connectionString: string): Promise<void> {
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
      CREATE TABLE IF NOT EXISTS user_tips (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        city_id     UUID REFERENCES service_cities(id) ON DELETE CASCADE,
        page        VARCHAR(40) NOT NULL,
        text_ur     TEXT NOT NULL,
        priority    INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        is_seed     BOOLEAN NOT NULL DEFAULT FALSE,
        created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS user_tips_page_idx ON user_tips (page)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS user_tips_city_idx ON user_tips (city_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS user_tips_active_idx ON user_tips (page, is_active)`);

    // Seed the recommended global tips exactly once (only if none seeded yet).
    const seeded = await pool.query(`SELECT 1 FROM user_tips WHERE is_seed = TRUE LIMIT 1`);
    if (seeded.rowCount === 0) {
      let priority = RECOMMENDED_TIPS.length;
      for (const tip of RECOMMENDED_TIPS) {
        await pool.query(
          `INSERT INTO user_tips (city_id, page, text_ur, priority, is_active, is_seed)
           VALUES (NULL, $1, $2, $3, TRUE, TRUE)`,
          [tip.page, tip.text, priority]
        );
        priority -= 1; // keep the listed order (higher priority shows first)
      }
      logger.info('Recommended user tips seeded');
    }

    try {
      await pool.query(`
        INSERT INTO permissions (code, description, category) VALUES
          ('tips.view',   'View user guidance tips', 'Settings'),
          ('tips.manage', 'Add / edit / pause user guidance tips', 'Settings')
        ON CONFLICT (code) DO NOTHING`);
    } catch (permErr: any) {
      logger.warn('Could not seed tips permissions', { error: permErr?.message });
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Apply migration 26 (table + seed) if needed. */
export async function ensureTipsTable(): Promise<boolean> {
  if (tipsCached === true) return true;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const connectionString = getMigrationConnectionString();
    if (!connectionString) {
      if (await hasTipsTable()) return true;
      logger.warn('user_tips table missing and no DB URL available for migration');
      return false;
    }
    try {
      await runDdlAndSeed(connectionString);
      tipsCached = true;
      logger.info('user_tips table ensured (migration 26 applied)');
      return true;
    } catch (error: any) {
      logger.warn('Could not apply user_tips migration — run database/migrations/26-user-tips.sql manually', {
        error: error?.message,
      });
      tipsCached = await hasTipsTable();
      return tipsCached;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}
