import { query } from '../config/database';
import {
  deleteStoragePaths,
  objectPathFromSupabasePublicUrl,
} from '../config/storage';
import logger from './logger';

const BANNER_KEYS = [
  'banner_left_text',
  'banner_middle_text',
  'banner_right_text_en',
  'banner_right_text_ur',
] as const;

export const WHATSAPP_ORDER_URL_KEY = 'whatsapp_order_url';
export const BRAND_LOGO_URL_KEY = 'brand_logo_url';
export const BRAND_LOGO_STORAGE_PATH_KEY = 'brand_logo_storage_path';
export const BRAND_FAVICON_URL_KEY = 'brand_favicon_url';
export const BRAND_FAVICON_STORAGE_PATH_KEY = 'brand_favicon_storage_path';
export const HERO_IMAGE_URL_KEY = 'hero_image_url';
export const HERO_IMAGE_STORAGE_PATH_KEY = 'hero_image_storage_path';

// Global feature flag: when 'true' the Atta Chakki service is live; otherwise the
// website + app show a "coming soon" state (super-admin reversible, no code change).
export const ATTA_CHAKKI_ENABLED_KEY = 'atta_chakki_enabled';

// Out-of-area popup copy (global) for map-based service areas (migration 43).
export const SERVICE_AREA_KEYS = {
  title: 'service_area_out_title',
  messageEn: 'service_area_out_msg_en',
  messageUr: 'service_area_out_msg_ur',
  whatsapp: 'service_area_out_whatsapp',
} as const;

export interface ServiceAreaMessages {
  title: string;
  message_en: string;
  message_ur: string;
  whatsapp: string;
}

export const SERVICE_AREA_MESSAGE_DEFAULTS: ServiceAreaMessages = {
  title: "We're not in your area yet",
  message_en:
    "FreshBazar delivery hasn't started in your area yet. We're expanding fast — please share your area with us on WhatsApp and we'll prioritise it, in sha Allah.",
  message_ur:
    'فی الحال آپ کے علاقے میں فریش بازار کی سروسز شروع نہیں ہوئیں۔ بہت جلد ہم آپ کے علاقے میں سروسز شروع کریں گے، ان شاء اللّٰہ۔ براہِ کرم اپنا علاقہ واٹس ایپ پر بتائیں۔',
  whatsapp: '03451111346',
};

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

  const result = await query(
    `SELECT key, value, city_id FROM site_settings
     WHERE key LIKE 'banner_%' AND (city_id IS NULL OR city_id = $1)`,
    [cityId]
  );
  return {
    ...rowsToMap(result.rows.filter((r) => !r.city_id)),
    ...rowsToMap(result.rows.filter((r) => r.city_id)),
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

  const result = await query(
    `SELECT key, value, city_id FROM site_settings
     WHERE (key = $1 OR key LIKE $2) AND (city_id IS NULL OR city_id = $3)`,
    [exactKey, keyPrefix, cityId]
  );
  return {
    ...rowsToMap(result.rows.filter((r) => !r.city_id)),
    ...rowsToMap(result.rows.filter((r) => r.city_id)),
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

/** Read one global (city_id NULL) setting value, or null when unset. */
export async function fetchGlobalSetting(key: string): Promise<string | null> {
  const hasCityColumn = await hasSiteSettingsCityColumn();
  const result = await query(
    hasCityColumn
      ? `SELECT value FROM site_settings WHERE key = $1 AND city_id IS NULL LIMIT 1`
      : `SELECT value FROM site_settings WHERE key = $1 LIMIT 1`,
    [key]
  );
  return result.rows[0]?.value ?? null;
}

/** Read several global (city_id NULL) settings as a key→value map. */
export async function fetchGlobalSettings(keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const hasCityColumn = await hasSiteSettingsCityColumn();
  const result = await query(
    hasCityColumn
      ? `SELECT key, value FROM site_settings WHERE key = ANY($1::text[]) AND city_id IS NULL`
      : `SELECT key, value FROM site_settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  return rowsToMap(result.rows);
}

/** Out-of-area popup copy with defaults applied. */
export async function fetchServiceAreaMessages(): Promise<ServiceAreaMessages> {
  const map = await fetchGlobalSettings([
    SERVICE_AREA_KEYS.title,
    SERVICE_AREA_KEYS.messageEn,
    SERVICE_AREA_KEYS.messageUr,
    SERVICE_AREA_KEYS.whatsapp,
  ]);
  return {
    title: map[SERVICE_AREA_KEYS.title] || SERVICE_AREA_MESSAGE_DEFAULTS.title,
    message_en: map[SERVICE_AREA_KEYS.messageEn] || SERVICE_AREA_MESSAGE_DEFAULTS.message_en,
    message_ur: map[SERVICE_AREA_KEYS.messageUr] || SERVICE_AREA_MESSAGE_DEFAULTS.message_ur,
    whatsapp: map[SERVICE_AREA_KEYS.whatsapp] || SERVICE_AREA_MESSAGE_DEFAULTS.whatsapp,
  };
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

/** Collect storage paths for the current logo (path field + URL fallback). */
export function brandLogoStoragePaths(settings: BrandLogoSettings): string[] {
  const paths = new Set<string>();
  const stored = settings.brand_logo_storage_path?.trim();
  if (stored) paths.add(stored);
  const fromUrl = objectPathFromSupabasePublicUrl(settings.brand_logo_url || '');
  if (fromUrl) paths.add(fromUrl);
  return [...paths];
}

/** Remove logo file(s) from Supabase; skips `exceptPath` (e.g. newly uploaded file). */
export async function deleteBrandLogoFromStorage(
  settings: BrandLogoSettings,
  exceptPath?: string
): Promise<number> {
  const skip = exceptPath?.trim();
  const toDelete = brandLogoStoragePaths(settings).filter((p) => p !== skip);
  const count = await deleteStoragePaths(toDelete);
  if (count > 0) {
    logger.info('Deleted previous brand logo file(s) from storage', {
      count,
      paths: toDelete,
    });
  }
  return count;
}

export async function clearBrandLogoSettings(userId?: string): Promise<BrandLogoSettings> {
  await upsertGlobalSiteSetting(BRAND_LOGO_URL_KEY, '', userId);
  await upsertGlobalSiteSetting(BRAND_LOGO_STORAGE_PATH_KEY, '', userId);
  return fetchBrandLogoSettings();
}

export interface BrandFaviconSettings {
  brand_favicon_url: string;
  brand_favicon_storage_path: string;
}

export async function fetchBrandFaviconSettings(): Promise<BrandFaviconSettings> {
  const hasCityColumn = await hasSiteSettingsCityColumn();
  const result = await query(
    hasCityColumn
      ? `SELECT key, value FROM site_settings
         WHERE key IN ($1, $2) AND city_id IS NULL`
      : `SELECT key, value FROM site_settings WHERE key IN ($1, $2)`,
    [BRAND_FAVICON_URL_KEY, BRAND_FAVICON_STORAGE_PATH_KEY]
  );
  const map = rowsToMap(result.rows);
  return {
    brand_favicon_url: map[BRAND_FAVICON_URL_KEY] || '',
    brand_favicon_storage_path: map[BRAND_FAVICON_STORAGE_PATH_KEY] || '',
  };
}

export function brandFaviconStoragePaths(settings: BrandFaviconSettings): string[] {
  const paths = new Set<string>();
  const stored = settings.brand_favicon_storage_path?.trim();
  if (stored) paths.add(stored);
  const fromUrl = objectPathFromSupabasePublicUrl(settings.brand_favicon_url || '');
  if (fromUrl) paths.add(fromUrl);
  return [...paths];
}

export async function deleteBrandFaviconFromStorage(
  settings: BrandFaviconSettings,
  exceptPath?: string
): Promise<number> {
  const skip = exceptPath?.trim();
  const toDelete = brandFaviconStoragePaths(settings).filter((p) => p !== skip);
  const count = await deleteStoragePaths(toDelete);
  if (count > 0) {
    logger.info('Deleted previous brand favicon file(s) from storage', {
      count,
      paths: toDelete,
    });
  }
  return count;
}

export async function clearBrandFaviconSettings(userId?: string): Promise<BrandFaviconSettings> {
  await upsertGlobalSiteSetting(BRAND_FAVICON_URL_KEY, '', userId);
  await upsertGlobalSiteSetting(BRAND_FAVICON_STORAGE_PATH_KEY, '', userId);
  return fetchBrandFaviconSettings();
}

// ============================================================================
// HERO SECTION IMAGE (per-city, like the banner text)
// ----------------------------------------------------------------------------
// Each service city can set its own homepage hero image (website + customer
// app). A global (city_id NULL) row acts as the fallback when a city hasn't
// set one. Every city admin manages their own city's image; the super admin
// manages any city plus the global fallback.
// ============================================================================

export interface HeroImageSettings {
  hero_image_url: string;
  hero_image_storage_path: string;
}

/** City hero image with global fallback (city value wins when present). */
export async function fetchHeroImageSettings(
  cityId?: string | null
): Promise<HeroImageSettings> {
  const hasCityColumn = await hasSiteSettingsCityColumn();
  const keys = [HERO_IMAGE_URL_KEY, HERO_IMAGE_STORAGE_PATH_KEY];

  if (!hasCityColumn || !cityId) {
    const result = await query(
      hasCityColumn
        ? `SELECT key, value FROM site_settings
           WHERE key = ANY($1::text[]) AND city_id IS NULL`
        : `SELECT key, value FROM site_settings WHERE key = ANY($1::text[])`,
      [keys]
    );
    const map = rowsToMap(result.rows);
    return {
      hero_image_url: map[HERO_IMAGE_URL_KEY] || '',
      hero_image_storage_path: map[HERO_IMAGE_STORAGE_PATH_KEY] || '',
    };
  }

  const result = await query(
    `SELECT key, value, city_id FROM site_settings
     WHERE key = ANY($1::text[]) AND (city_id IS NULL OR city_id = $2)`,
    [keys, cityId]
  );

  const merged = {
    ...rowsToMap(result.rows.filter((r) => !r.city_id)),
    ...rowsToMap(result.rows.filter((r) => r.city_id)),
  };
  return {
    hero_image_url: merged[HERO_IMAGE_URL_KEY] || '',
    hero_image_storage_path: merged[HERO_IMAGE_STORAGE_PATH_KEY] || '',
  };
}

/** Save a city's hero image (URL + storage path). */
export async function upsertHeroImageSettings(
  url: string,
  storagePath: string,
  cityId: string | null,
  userId?: string
): Promise<HeroImageSettings> {
  await upsertKeyedSetting(HERO_IMAGE_URL_KEY, url, cityId, userId);
  await upsertKeyedSetting(HERO_IMAGE_STORAGE_PATH_KEY, storagePath, cityId, userId);
  return fetchHeroImageSettings(cityId);
}

/** Storage object paths for a hero image (path field + URL fallback). */
export function heroImageStoragePaths(settings: HeroImageSettings): string[] {
  const paths = new Set<string>();
  const stored = settings.hero_image_storage_path?.trim();
  if (stored) paths.add(stored);
  const fromUrl = objectPathFromSupabasePublicUrl(settings.hero_image_url || '');
  if (fromUrl) paths.add(fromUrl);
  return [...paths];
}

/** Remove a city's hero file(s) from storage, skipping `exceptPath`. */
export async function deleteHeroImageFromStorage(
  settings: HeroImageSettings,
  exceptPath?: string
): Promise<number> {
  const skip = exceptPath?.trim();
  const toDelete = heroImageStoragePaths(settings).filter((p) => p !== skip);
  const count = await deleteStoragePaths(toDelete);
  if (count > 0) {
    logger.info('Deleted previous hero image file(s) from storage', {
      count,
      paths: toDelete,
    });
  }
  return count;
}

/** Clear a city's hero image (keeps the global fallback intact). */
export async function clearHeroImageSettings(
  cityId: string | null,
  userId?: string
): Promise<HeroImageSettings> {
  await upsertKeyedSetting(HERO_IMAGE_URL_KEY, '', cityId, userId);
  await upsertKeyedSetting(HERO_IMAGE_STORAGE_PATH_KEY, '', cityId, userId);
  return fetchHeroImageSettings(cityId);
}
