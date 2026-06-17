// Shared unit-fraction pricing + stock math for cart and orders.

export const VALID_PRODUCT_UNITS = ['full', 'half_kg', 'quarter_kg', 'half_dozen'] as const;
export type ProductUnit = (typeof VALID_PRODUCT_UNITS)[number];

export function normalizeProductUnit(raw: unknown): ProductUnit {
  const unit = String(raw ?? 'full');
  return (VALID_PRODUCT_UNITS as readonly string[]).includes(unit)
    ? (unit as ProductUnit)
    : 'full';
}

/** How many base stock units (kg / dozen / piece) one line consumes. */
export function unitStockMultiplier(unit: string | null | undefined): number {
  switch (normalizeProductUnit(unit)) {
    case 'half_kg':
      return 0.5;
    case 'quarter_kg':
      return 0.25;
    case 'half_dozen':
      return 0.5;
    default:
      return 1;
  }
}

export function stockUnitsNeeded(
  quantity: number,
  unit: string | null | undefined
): number {
  return quantity * unitStockMultiplier(unit);
}

function parseOptionalPrice(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function resolveUnitPrice(
  product: {
    price: string | number;
    half_kg_price?: string | number | null;
    quarter_kg_price?: string | number | null;
    half_dozen_price?: string | number | null;
  },
  unit: string | null | undefined
): number {
  const base = parseFloat(String(product.price)) || 0;
  switch (normalizeProductUnit(unit)) {
    case 'half_kg':
      return parseOptionalPrice(product.half_kg_price, base * 0.5);
    case 'quarter_kg':
      return parseOptionalPrice(product.quarter_kg_price, base * 0.25);
    case 'half_dozen':
      return parseOptionalPrice(product.half_dozen_price, base * 0.5);
    default:
      return base;
  }
}

export type ProductQuality = 'A' | 'B' | 'C';

export function normalizeQuality(raw: unknown): ProductQuality {
  const q = String(raw ?? 'A').toUpperCase();
  return q === 'B' || q === 'C' ? (q as ProductQuality) : 'A';
}

/**
 * Base (per-unit) price for a restaurant product at a given quality tier.
 * Quality A always uses `price`; B/C use their column and return null when the
 * tier isn't offered for that product (so callers can reject the selection).
 */
export function resolveQualityBasePrice(
  product: { price: string | number; quality_b_price?: string | number | null; quality_c_price?: string | number | null },
  quality: unknown
): number | null {
  const q = normalizeQuality(quality);
  if (q === 'B') {
    return product.quality_b_price == null || product.quality_b_price === ''
      ? null
      : parseFloat(String(product.quality_b_price)) || 0;
  }
  if (q === 'C') {
    return product.quality_c_price == null || product.quality_c_price === ''
      ? null
      : parseFloat(String(product.quality_c_price)) || 0;
  }
  return parseFloat(String(product.price)) || 0;
}

/** Per-unit price for a restaurant product at a quality tier (null if tier N/A). */
export function resolveQualityUnitPrice(
  product: { price: string | number; quality_b_price?: string | number | null; quality_c_price?: string | number | null },
  quality: unknown,
  unit: string | null | undefined
): number | null {
  const base = resolveQualityBasePrice(product, quality);
  if (base == null) return null;
  switch (normalizeProductUnit(unit)) {
    case 'half_kg':
      return base * 0.5;
    case 'quarter_kg':
      return base * 0.25;
    case 'half_dozen':
      return base * 0.5;
    default:
      return base;
  }
}

/** Live line unit price from products — used in SQL subtotal (never stale cart_items). */
export const FRESH_CART_LINE_UNIT_PRICE_SQL = `
  CASE COALESCE(ci.unit, 'full')
    WHEN 'half_kg' THEN COALESCE(p.half_kg_price, p.price * 0.5)
    WHEN 'quarter_kg' THEN COALESCE(p.quarter_kg_price, p.price * 0.25)
    WHEN 'half_dozen' THEN COALESCE(p.half_dozen_price, p.price * 0.5)
    ELSE p.price
  END
`;

export const FRESH_CART_SUBTOTAL_SQL = `
  SELECT COALESCE(SUM(ci.quantity * (${FRESH_CART_LINE_UNIT_PRICE_SQL})), 0) AS fresh_subtotal
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
   WHERE ci.cart_id = $1
`;
