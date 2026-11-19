// Shared helpers for the products handlers (moved from products.controller.ts, W21).



/** Largest single price cut (%) a non-super admin may make. */
export const PRICE_CUT_LIMIT_PCT = Math.min(95, Math.max(5, Number(process.env.PRICE_CUT_LIMIT_PCT || 40)));

// Catalog v2 (migration 37) column groups — reused by create + update.
export const CATALOG_V2_ENABLE_FLAGS = [
  'consumer_enabled_a', 'consumer_enabled_b', 'consumer_enabled_c',
  'restaurant_enabled_a', 'restaurant_enabled_b', 'restaurant_enabled_c',
];

export const CATALOG_V2_FRACTION_PRICES = [
  'half_kg_price_b', 'quarter_kg_price_b', 'half_dozen_price_b',
  'half_kg_price_c', 'quarter_kg_price_c', 'half_dozen_price_c',
  'restaurant_half_kg_price_a', 'restaurant_quarter_kg_price_a', 'restaurant_half_dozen_price_a',
  'restaurant_half_kg_price_b', 'restaurant_quarter_kg_price_b', 'restaurant_half_dozen_price_b',
  'restaurant_half_kg_price_c', 'restaurant_quarter_kg_price_c', 'restaurant_half_dozen_price_c',
];

// Columns returned by the list + detail product reads (gated by hasCatalogV2Columns).
export const CATALOG_V2_READ_COLS = [
  ...CATALOG_V2_ENABLE_FLAGS, ...CATALOG_V2_FRACTION_PRICES,
  'reserved_quantity', 'reserved_quantity_b', 'reserved_quantity_c',
].map((c) => `p.${c}`).join(', ') + ',';

/** Default Urdu popup shown when a customer adds a variable-weight product. */
export const DEFAULT_VARIABLE_WEIGHT_NOTE =
  'آرڈر پیک کرتے ہوئے اس پروڈکٹ کا وزن آپ کے آرڈر سے کم یا زیادہ ہو سکتا ہے۔ ایسی صورت میں آپ کا آرڈر اور اس کی رقم آپ کے اصل وزن کے مطابق تبدیل ہو جائے گی۔';

export function toBool(v: unknown): boolean {
  return v === true || v === 'true' || v === '1' || v === 1;
}

/** Boolean coercion that keeps the default when the field is absent. */
export function toBoolOr(v: unknown, def: boolean): boolean {
  if (v === undefined || v === null || v === '') return def;
  return toBool(v);
}

export const MAX_PRODUCT_IMAGES = 5;

/** `existing_images` arrives as a JSON string (multipart) or an array. */
export function parseExistingImages(raw: unknown): string[] | null {
  if (raw === undefined || raw === null || raw === '') return null;
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(list)) return null;
  return list.filter((u): u is string => typeof u === 'string' && u.length > 0).slice(0, MAX_PRODUCT_IMAGES);
}
