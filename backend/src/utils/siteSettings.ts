import { query } from '../config/database';

const BANNER_KEYS = [
  'banner_left_text',
  'banner_middle_text',
  'banner_right_text_en',
  'banner_right_text_ur',
] as const;

export const WHATSAPP_ORDER_URL_KEY = 'whatsapp_order_url';
export const BRAND_LOGO_URL_KEY = 'brand_logo_url';
export const BRAND_LOGO_STORAGE_PATH_KEY = 'brand_logo_storage_path';

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

export type WhatsAppCitySettingRow = {
  cityId: string;
  cityName: string;
  province: string;
  whatsappOrderUrl: string;
};

export type WhatsAppOrderSettingsAll = {
  globalWhatsappOrderUrl: string;
  cities: WhatsAppCitySettingRow[];
};

/** All active cities with per-city WhatsApp URLs plus optional global fallback. */
export async function fetchWhatsAppOrderSettingsAll(): Promise<WhatsAppOrderSettingsAll> {
  const hasCityColumn = await hasSiteSettingsCityColumn();

  const citiesResult = await query(
    `SELECT id, name, province FROM service_cities WHERE is_active = true ORDER BY name`
  );

  let globalWhatsappOrderUrl = '';
  const perCity = new Map<string, string>();

  if (hasCityColumn) {
    const settingsResult = await query(
      `SELECT city_id, value FROM site_settings WHERE key = $1`,
      [WHATSAPP_ORDER_URL_KEY]
    );
    for (const row of settingsResult.rows) {
      if (row.city_id == null) {
        globalWhatsappOrderUrl = row.value || '';
      } else {
        perCity.set(row.city_id, row.value || '');
      }
    }
  } else {
    const settingsResult = await query(
      `SELECT value FROM site_settings WHERE key = $1 LIMIT 1`,
      [WHATSAPP_ORDER_URL_KEY]
    );
    globalWhatsappOrderUrl = settingsResult.rows[0]?.value || '';
  }

  return {
    globalWhatsappOrderUrl,
    cities: citiesResult.rows.map((row) => ({
      cityId: row.id,
      cityName: row.name,
      province: row.province,
      whatsappOrderUrl: perCity.get(row.id) || '',
    })),
  };
}

export type WhatsAppBulkEntry = { cityId: string; whatsappOrderUrl: string };

export async function upsertWhatsAppOrderSettingsBulk(
  payload: {
    globalWhatsappOrderUrl?: string;
    cities?: WhatsAppBulkEntry[];
  },
  userId?: string
): Promise<WhatsAppOrderSettingsAll> {
  if (payload.globalWhatsappOrderUrl !== undefined) {
    await upsertGlobalSiteSetting(
      WHATSAPP_ORDER_URL_KEY,
      String(payload.globalWhatsappOrderUrl).trim(),
      userId
    );
  }

  for (const entry of payload.cities || []) {
    if (!entry.cityId) continue;
    await upsertKeyedSetting(
      WHATSAPP_ORDER_URL_KEY,
      String(entry.whatsappOrderUrl ?? '').trim(),
      entry.cityId,
      userId
    );
  }

  return fetchWhatsAppOrderSettingsAll();
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

export interface BrandLogoSettings {
  brand_logo_url: string;
  brand_logo_storage_path: string;
}

/** Global brand logo (same across all cities). */
export async function fetchBrandLogoSettings(): Promise<BrandLogoSettings> {
  const hasCityColumn = await hasSiteSettingsCityColumn();
  const result = await query(
    hasCityColumn
      ? `SELECT key, value FROM site_settings
         WHERE key IN ($1, $2) AND city_id IS NULL`
      : `SELECT key, value FROM site_settings WHERE key IN ($1, $2)`,
    [BRAND_LOGO_URL_KEY, BRAND_LOGO_STORAGE_PATH_KEY]
  );
  const map = rowsToMap(result.rows);
  return {
    brand_logo_url: map[BRAND_LOGO_URL_KEY] || '',
    brand_logo_storage_path: map[BRAND_LOGO_STORAGE_PATH_KEY] || '',
  };
}
