import { query } from '../config/database';

const BANNER_KEYS = [
  'banner_left_text',
  'banner_middle_text',
  'banner_right_text_en',
  'banner_right_text_ur',
] as const;

export const WHATSAPP_ORDER_URL_KEY = 'whatsapp_order_url';

let cachedCityColumn: boolean | null = null;

async function hasSiteSettingsCityColumn(): Promise<boolean> {
  if (cachedCityColumn !== null) return cachedCityColumn;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'site_settings'
         AND column_name = 'city_id'
       LIMIT 1`
    );
    cachedCityColumn = r.rows.length > 0;
  } catch {
    cachedCityColumn = false;
  }
  return cachedCityColumn;
}

function rowsToMap(rows: { key: string; value: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export async function fetchBannerSettings(
  cityId?: string | null
): Promise<Record<string, string>> {
  const hasCityColumn = await hasSiteSettingsCityColumn();

  if (!hasCityColumn || !cityId) {
    const result = await query(
      hasCityColumn
        ? `SELECT key, value FROM site_settings WHERE key LIKE 'banner_%' AND city_id IS NULL`
        : `SELECT key, value FROM site_settings WHERE key LIKE 'banner_%'`
    );
    return rowsToMap(result.rows);
  }

  const [globalResult, cityResult] = await Promise.all([
    query(
      `SELECT key, value FROM site_settings
       WHERE key LIKE 'banner_%' AND city_id IS NULL`
    ),
    query(
      `SELECT key, value FROM site_settings
       WHERE key LIKE 'banner_%' AND city_id = $1`,
      [cityId]
    ),
  ]);

  return {
    ...rowsToMap(globalResult.rows),
    ...rowsToMap(cityResult.rows),
  };
}

export async function upsertBannerSettings(
  values: Partial<Record<(typeof BANNER_KEYS)[number], string>>,
  cityId: string | null,
  userId?: string
): Promise<Record<string, string>> {
  const hasCityColumn = await hasSiteSettingsCityColumn();

  for (const key of BANNER_KEYS) {
    const value = values[key];
    if (value === undefined) continue;

    if (hasCityColumn && cityId) {
      await query(
        `INSERT INTO site_settings (key, value, city_id, updated_at, updated_by)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (key, city_id) WHERE city_id IS NOT NULL
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [key, value, cityId, userId || null]
      );
    } else {
      await query(
        hasCityColumn
          ? `INSERT INTO site_settings (key, value, city_id, updated_at, updated_by)
             VALUES ($1, $2, NULL, NOW(), $3)
             ON CONFLICT (key) WHERE city_id IS NULL
             DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`
          : `INSERT INTO site_settings (key, value, updated_at, updated_by)
             VALUES ($1, $2, NOW(), $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        hasCityColumn ? [key, value, userId || null] : [key, value, userId || null]
      );
    }
  }

  return fetchBannerSettings(cityId);
}

async function fetchKeyedSettings(
  keyPrefix: string,
  exactKey: string,
  cityId?: string | null
): Promise<Record<string, string>> {
  const hasCityColumn = await hasSiteSettingsCityColumn();

  if (!hasCityColumn || !cityId) {
    const result = await query(
      hasCityColumn
        ? `SELECT key, value FROM site_settings
           WHERE (key = $1 OR key LIKE $2) AND city_id IS NULL`
        : `SELECT key, value FROM site_settings WHERE key = $1 OR key LIKE $2`,
      [exactKey, keyPrefix]
    );
    return rowsToMap(result.rows);
  }

  const [globalResult, cityResult] = await Promise.all([
    query(
      `SELECT key, value FROM site_settings
       WHERE (key = $1 OR key LIKE $2) AND city_id IS NULL`,
      [exactKey, keyPrefix]
    ),
    query(
      `SELECT key, value FROM site_settings
       WHERE (key = $1 OR key LIKE $2) AND city_id = $3`,
      [exactKey, keyPrefix, cityId]
    ),
  ]);

  return {
    ...rowsToMap(globalResult.rows),
    ...rowsToMap(cityResult.rows),
  };
}

async function upsertKeyedSetting(
  key: string,
  value: string,
  cityId: string | null,
  userId?: string
): Promise<void> {
  const hasCityColumn = await hasSiteSettingsCityColumn();

  if (hasCityColumn && cityId) {
    await query(
      `INSERT INTO site_settings (key, value, city_id, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key, city_id) WHERE city_id IS NOT NULL
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [key, value, cityId, userId || null]
    );
  } else {
    await query(
      hasCityColumn
        ? `INSERT INTO site_settings (key, value, city_id, updated_at, updated_by)
           VALUES ($1, $2, NULL, NOW(), $3)
           ON CONFLICT (key) WHERE city_id IS NULL
           DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`
        : `INSERT INTO site_settings (key, value, updated_at, updated_by)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      hasCityColumn ? [key, value, userId || null] : [key, value, userId || null]
    );
  }
}

export async function fetchWhatsAppOrderSettings(
  cityId?: string | null
): Promise<Record<string, string>> {
  return fetchKeyedSettings('whatsapp_%', WHATSAPP_ORDER_URL_KEY, cityId);
}

export async function upsertWhatsAppOrderSettings(
  whatsappOrderUrl: string,
  cityId: string | null,
  userId?: string
): Promise<Record<string, string>> {
  await upsertKeyedSetting(WHATSAPP_ORDER_URL_KEY, whatsappOrderUrl.trim(), cityId, userId);
  return fetchWhatsAppOrderSettings(cityId);
}

/** Upsert a global (non-city) site setting row. */
export async function upsertGlobalSiteSetting(
  key: string,
  value: string,
  userId?: string
): Promise<void> {
  const hasCityColumn = await hasSiteSettingsCityColumn();

  if (hasCityColumn) {
    await query(
      `INSERT INTO site_settings (key, value, city_id, updated_at, updated_by)
       VALUES ($1, $2, NULL, NOW(), $3)
       ON CONFLICT (key) WHERE city_id IS NULL
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [key, value, userId || null]
    );
  } else {
    await query(
      `INSERT INTO site_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [key, value, userId || null]
    );
  }
}
