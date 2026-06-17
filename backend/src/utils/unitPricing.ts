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

// ── Quality tiers (A/B/C) ────────────────────────────────────────────────────
// ONE product row carries up to three quality tiers. A is always offered
// (consumer `price` + `stock_quantity`). B/C are offered only when their
// consumer price is set (`price_b` / `price_c`), each with its own shared stock
// bucket (`stock_quantity_b` / `stock_quantity_c`). Consumer and restaurant draw
// from the SAME per-quality stock; only the price differs by channel.

export type ProductQuality = 'A' | 'B' | 'C';

export function normalizeQuality(raw: unknown): ProductQuality {
  const q = String(raw ?? 'A').toUpperCase();
  return q === 'B' || q === 'C' ? (q as ProductQuality) : 'A';
}

interface QualityProduct {
  price: string | number;
  price_b?: string | number | null;
  price_c?: string | number | null;
  restaurant_price_a?: string | number | null;
  restaurant_price_b?: string | number | null;
  restaurant_price_c?: string | number | null;
}

const optionalPrice = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Which quality tiers a product offers (channel-independent). A always; B/C when priced. */
export function offeredQualities(product: QualityProduct): ProductQuality[] {
  const out: ProductQuality[] = ['A'];
  if (optionalPrice(product.price_b) != null) out.push('B');
  if (optionalPrice(product.price_c) != null) out.push('C');
  return out;
}

/**
 * Consumer base (per-unit, full) price for a quality tier.
 * A → `price`; B → `price_b`; C → `price_c`. Returns null when the tier isn't
 * offered, so callers can reject the selection.
 */
export function resolveConsumerBasePrice(product: QualityProduct, quality: unknown): number | null {
  const q = normalizeQuality(quality);
  if (q === 'B') return optionalPrice(product.price_b);
  if (q === 'C') return optionalPrice(product.price_c);
  return parseFloat(String(product.price)) || 0;
}

/**
 * Restaurant base (per-unit, full) price for a quality tier. Same offered set as
 * the consumer side; a blank restaurant price falls back to the consumer price
 * for that tier. Returns null when the tier isn't offered at all.
 */
export function resolveRestaurantBasePrice(product: QualityProduct, quality: unknown): number | null {
  const q = normalizeQuality(quality);
  const consumer = resolveConsumerBasePrice(product, q);
  if (consumer == null) return null; // tier not offered
  if (q === 'B') return optionalPrice(product.restaurant_price_b) ?? consumer;
  if (q === 'C') return optionalPrice(product.restaurant_price_c) ?? consumer;
  return optionalPrice(product.restaurant_price_a) ?? consumer;
}

/** Apply the unit-fraction multiplier (half/quarter-kg, half-dozen) to a base price. */
export function applyUnitFraction(base: number, unit: string | null | undefined): number {
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

/**
 * Consumer per-unit price for a quality + unit (null if the tier isn't offered).
 * Quality A honours the product's explicit half/quarter/half-dozen overrides
 * (existing behaviour via resolveUnitPrice); B/C derive the fraction from base.
 */
export function resolveConsumerUnitPrice(
  product: QualityProduct & {
    half_kg_price?: string | number | null;
    quarter_kg_price?: string | number | null;
    half_dozen_price?: string | number | null;
  },
  quality: unknown,
  unit: string | null | undefined
): number | null {
  const q = normalizeQuality(quality);
  if (q === 'A') return resolveUnitPrice(product, unit);
  const base = resolveConsumerBasePrice(product, q);
  return base == null ? null : applyUnitFraction(base, unit);
}

/** Restaurant per-unit price for a quality + unit (null if tier N/A). */
export function resolveRestaurantUnitPrice(
  product: QualityProduct,
  quality: unknown,
  unit: string | null | undefined
): number | null {
  const base = resolveRestaurantBasePrice(product, quality);
  return base == null ? null : applyUnitFraction(base, unit);
}

/**
 * The shared stock column for a quality tier — a whitelist so callers can build
 * the decrement SQL without interpolating user input.
 */
export function qualityStockColumn(quality: unknown): 'stock_quantity' | 'stock_quantity_b' | 'stock_quantity_c' {
  const q = normalizeQuality(quality);
  if (q === 'B') return 'stock_quantity_b';
  if (q === 'C') return 'stock_quantity_c';
  return 'stock_quantity';
}

/** Live line unit price from products — used in SQL subtotal (never stale cart_items). */
export const FRESH_CART_LINE_UNIT_PRICE_SQL = `
  CASE COALESCE(ci.quality, 'A')
    WHEN 'B' THEN (
      CASE COALESCE(ci.unit, 'full')
        WHEN 'half_kg' THEN p.price_b * 0.5
        WHEN 'quarter_kg' THEN p.price_b * 0.25
        WHEN 'half_dozen' THEN p.price_b * 0.5
        ELSE p.price_b
      END)
    WHEN 'C' THEN (
      CASE COALESCE(ci.unit, 'full')
        WHEN 'half_kg' THEN p.price_c * 0.5
        WHEN 'quarter_kg' THEN p.price_c * 0.25
        WHEN 'half_dozen' THEN p.price_c * 0.5
        ELSE p.price_c
      END)
    ELSE (
      CASE COALESCE(ci.unit, 'full')
        WHEN 'half_kg' THEN COALESCE(p.half_kg_price, p.price * 0.5)
        WHEN 'quarter_kg' THEN COALESCE(p.quarter_kg_price, p.price * 0.25)
        WHEN 'half_dozen' THEN COALESCE(p.half_dozen_price, p.price * 0.5)
        ELSE p.price
      END)
  END
`;

export const FRESH_CART_SUBTOTAL_SQL = `
  SELECT COALESCE(SUM(ci.quantity * (${FRESH_CART_LINE_UNIT_PRICE_SQL})), 0) AS fresh_subtotal
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
   WHERE ci.cart_id = $1
`;
