// ============================================================================
// DELIVERY SETTINGS — per city with a global fallback.
//
// Every other part of the platform is city-scoped (products, stock, riders,
// orders, banners). Delivery pricing used to be ONE global row set, so a city
// admin changing "base charge" silently changed every city's price. Now:
//   • a city row (site_settings.city_id = <city>) overrides
//   • the global row (city_id IS NULL) is the default for cities without one
//   • built-in defaults apply when neither exists
// Readers always pass the city of the cart / order / request.
// ============================================================================

import { query } from '../config/database';
import { hasSiteSettingsCityColumn } from './siteSettings';

type Runner = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const defaultRunner: Runner = { query: (sql, params) => query(sql, params as any[]) };

export const DELIVERY_SETTING_KEYS = {
  baseCharge: 'delivery_base_charge',
  freeThreshold: 'delivery_free_delivery_threshold',
  expressCharge: 'delivery_express_charge',
  urgentCharge: 'delivery_urgent_charge',
  urgentEta: 'delivery_urgent_eta',
  slotCutoffPercent: 'delivery_slot_cutoff_percent',
} as const;

export interface DeliverySettings {
  baseCharge: number;
  freeThreshold: number;
  expressCharge: number;
  urgentCharge: number;
  urgentEta: string;
  slotCutoffPercent: number;
  /** True when this city has its own row for at least one key. */
  cityOverride: boolean;
}

export const DELIVERY_DEFAULTS: Omit<DeliverySettings, 'cityOverride'> = {
  baseCharge: parseFloat(process.env.DEFAULT_DELIVERY_CHARGE || '100'),
  freeThreshold: parseFloat(process.env.FREE_DELIVERY_MIN_AMOUNT || '500'),
  expressCharge: 100,
  urgentCharge: 0,
  urgentEta: '',
  slotCutoffPercent: 60,
};

const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

/** Effective delivery settings for a city (global fallback, then defaults). */
export async function getDeliverySettings(
  cityId?: string | null,
  runner: Runner = defaultRunner
): Promise<DeliverySettings> {
  const keys = Object.values(DELIVERY_SETTING_KEYS);
  const cityAware = await hasSiteSettingsCityColumn();
  const result = cityAware
    ? await runner.query(
        `SELECT key, value, city_id FROM site_settings
          WHERE key = ANY($1::text[]) AND (city_id IS NULL OR city_id = $2)`,
        [keys, cityId || null]
      )
    : await runner.query(`SELECT key, value, NULL::uuid AS city_id FROM site_settings WHERE key = ANY($1::text[])`, [keys]);

  const global: Record<string, string> = {};
  const city: Record<string, string> = {};
  for (const row of result.rows) {
    if (row.city_id) city[row.key] = row.value;
    else global[row.key] = row.value;
  }
  const pick = (key: string) => (key in city ? city[key] : global[key]);

  const out: DeliverySettings = { ...DELIVERY_DEFAULTS, cityOverride: Object.keys(city).length > 0 };
  const K = DELIVERY_SETTING_KEYS;
  const base = num(pick(K.baseCharge));
  if (base !== null && base >= 0) out.baseCharge = base;
  const thr = num(pick(K.freeThreshold));
  if (thr !== null && thr >= 0) out.freeThreshold = thr;
  const exp = num(pick(K.expressCharge));
  if (exp !== null && exp >= 0) out.expressCharge = exp;
  const urg = num(pick(K.urgentCharge));
  if (urg !== null && urg >= 0) out.urgentCharge = urg;
  const eta = pick(K.urgentEta);
  if (typeof eta === 'string') out.urgentEta = eta.trim();
  const cut = num(pick(K.slotCutoffPercent));
  if (cut !== null) out.slotCutoffPercent = Math.min(100, Math.max(0, cut));
  return out;
}

/** Write delivery settings for one city (cityId) or the global default (null). */
export async function saveDeliverySettings(
  cityId: string | null,
  values: Partial<Record<keyof typeof DELIVERY_SETTING_KEYS, string>>,
  userId?: string | null
): Promise<void> {
  const cityAware = await hasSiteSettingsCityColumn();
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const key = DELIVERY_SETTING_KEYS[field as keyof typeof DELIVERY_SETTING_KEYS];
    if (!key) continue;
    if (cityAware && cityId) {
      await query(
        `INSERT INTO site_settings (key, value, city_id, updated_at, updated_by)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (key, city_id) WHERE city_id IS NOT NULL
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [key, value, cityId, userId || null]
      );
    } else if (cityAware) {
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
}

/** Remove a city's own delivery rows so it falls back to the global default. */
export async function clearCityDeliverySettings(cityId: string): Promise<void> {
  if (!(await hasSiteSettingsCityColumn())) return;
  await query(
    `DELETE FROM site_settings WHERE city_id = $1 AND key = ANY($2::text[])`,
    [cityId, Object.values(DELIVERY_SETTING_KEYS)]
  );
}

/** City of a cart, from its products (carts carry no city of their own). */
export async function getCartCityId(cartId: string, runner: Runner = defaultRunner): Promise<string | null> {
  const r = await runner.query(
    `SELECT p.city_id FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = $1 AND p.city_id IS NOT NULL LIMIT 1`,
    [cartId]
  );
  return r.rows[0]?.city_id ?? null;
}
