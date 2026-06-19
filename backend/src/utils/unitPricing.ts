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
  // Catalog v2 — per-quality channel enable flags (default: consumer on, restaurant off).
  consumer_enabled_a?: boolean | null;
  consumer_enabled_b?: boolean | null;
  consumer_enabled_c?: boolean | null;
  restaurant_enabled_a?: boolean | null;
  restaurant_enabled_b?: boolean | null;
  restaurant_enabled_c?: boolean | null;
}

/** Catalog-v2 explicit fraction price columns (per quality, per channel). */
interface FractionPriceProduct {
  half_kg_price?: string | number | null;
  quarter_kg_price?: string | number | null;
  half_dozen_price?: string | number | null;
  half_kg_price_b?: string | number | null;
  quarter_kg_price_b?: string | number | null;
  half_dozen_price_b?: string | number | null;
  half_kg_price_c?: string | number | null;
  quarter_kg_price_c?: string | number | null;
  half_dozen_price_c?: string | number | null;
  restaurant_half_kg_price_a?: string | number | null;
  restaurant_quarter_kg_price_a?: string | number | null;
  restaurant_half_dozen_price_a?: string | number | null;
  restaurant_half_kg_price_b?: string | number | null;
  restaurant_quarter_kg_price_b?: string | number | null;
  restaurant_half_dozen_price_b?: string | number | null;
  restaurant_half_kg_price_c?: string | number | null;
  restaurant_quarter_kg_price_c?: string | number | null;
  restaurant_half_dozen_price_c?: string | number | null;
}

/** A tier is enabled for a channel unless the flag is explicitly false. */
const flagOn = (v: unknown, dflt: boolean): boolean => (v === null || v === undefined ? dflt : v === true);

/** Pick the explicit fraction-price column value for a quality+channel+unit (null if blank/absent). */
function explicitFractionPrice(
  product: FractionPriceProduct,
  quality: ProductQuality,
  unit: string | null | undefined,
  channel: 'consumer' | 'restaurant'
): number | null {
  const u = normalizeProductUnit(unit);
  if (u === 'full') return null;
  const suffix = u === 'half_kg' ? 'half_kg' : u === 'quarter_kg' ? 'quarter_kg' : 'half_dozen';
  let key: string;
  if (channel === 'restaurant') {
    key = `restaurant_${suffix}_price_${quality.toLowerCase()}`;
  } else {
    key = quality === 'A' ? `${suffix}_price` : `${suffix}_price_${quality.toLowerCase()}`;
  }
  return optionalPrice((product as any)[key]);
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
  product: QualityProduct & FractionPriceProduct,
  quality: unknown,
  unit: string | null | undefined
): number | null {
  const q = normalizeQuality(quality);
  const base = resolveConsumerBasePrice(product, q);
  if (base == null) return null;
  if (normalizeProductUnit(unit) === 'full') return base;
  // Honour an explicit per-quality fraction override (A/B/C); else derive.
  const explicit = explicitFractionPrice(product, q, unit, 'consumer');
  return explicit != null ? explicit : applyUnitFraction(base, unit);
}

/** Restaurant per-unit price for a quality + unit (null if tier N/A). */
export function resolveRestaurantUnitPrice(
  product: QualityProduct & FractionPriceProduct,
  quality: unknown,
  unit: string | null | undefined
): number | null {
  const q = normalizeQuality(quality);
  const base = resolveRestaurantBasePrice(product, q);
  if (base == null) return null;
  if (normalizeProductUnit(unit) === 'full') return base;
  const explicit = explicitFractionPrice(product, q, unit, 'restaurant');
  return explicit != null ? explicit : applyUnitFraction(base, unit);
}

// ── Channel-aware offered sets (Catalog v2 enable flags) ─────────────────────
// A tier is shown to a channel only when its enable flag is on AND the channel
// has a usable base price for it. Consumer A defaults on; restaurant defaults
// off (admin opts in per product + per quality). `offeredQualities` above stays
// the price-only set (used where the channel doesn't matter).

/** Quality tiers offered to CONSUMERS (enable flag on + price set). */
export function consumerQualities(product: QualityProduct): ProductQuality[] {
  const out: ProductQuality[] = [];
  if (flagOn(product.consumer_enabled_a, true) && resolveConsumerBasePrice(product, 'A') != null) out.push('A');
  if (flagOn(product.consumer_enabled_b, true) && resolveConsumerBasePrice(product, 'B') != null) out.push('B');
  if (flagOn(product.consumer_enabled_c, true) && resolveConsumerBasePrice(product, 'C') != null) out.push('C');
  return out;
}

/** Quality tiers offered to RESTAURANTS (enable flag on + base resolvable). */
export function restaurantQualities(product: QualityProduct): ProductQuality[] {
  const out: ProductQuality[] = [];
  if (flagOn(product.restaurant_enabled_a, false) && resolveRestaurantBasePrice(product, 'A') != null) out.push('A');
  if (flagOn(product.restaurant_enabled_b, false) && resolveRestaurantBasePrice(product, 'B') != null) out.push('B');
  if (flagOn(product.restaurant_enabled_c, false) && resolveRestaurantBasePrice(product, 'C') != null) out.push('C');
  return out;
}

/** True if the given quality is offered to the channel. */
export function isQualityOffered(
  product: QualityProduct,
  quality: unknown,
  channel: 'consumer' | 'restaurant'
): boolean {
  const q = normalizeQuality(quality);
  return (channel === 'consumer' ? consumerQualities(product) : restaurantQualities(product)).includes(q);
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
        WHEN 'half_kg' THEN COALESCE(p.half_kg_price_b, p.price_b * 0.5)
        WHEN 'quarter_kg' THEN COALESCE(p.quarter_kg_price_b, p.price_b * 0.25)
        WHEN 'half_dozen' THEN COALESCE(p.half_dozen_price_b, p.price_b * 0.5)
        ELSE p.price_b
      END)
    WHEN 'C' THEN (
      CASE COALESCE(ci.unit, 'full')
        WHEN 'half_kg' THEN COALESCE(p.half_kg_price_c, p.price_c * 0.5)
        WHEN 'quarter_kg' THEN COALESCE(p.quarter_kg_price_c, p.price_c * 0.25)
        WHEN 'half_dozen' THEN COALESCE(p.half_dozen_price_c, p.price_c * 0.5)
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
