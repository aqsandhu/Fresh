// Client-side restaurant pricing — mirrors backend resolveQualityUnitPrice.

export type Quality = 'A' | 'B' | 'C'
export type Unit = 'full' | 'half_kg' | 'quarter_kg' | 'half_dozen'

export interface RestaurantProduct {
  id: string
  name_en: string
  name_ur?: string
  // Consumer prices per tier (used to know which tiers are offered + as the
  // restaurant fallback when no restaurant price is set).
  price: number | string
  price_b?: number | string | null
  price_c?: number | string | null
  // Restaurant prices per tier (what the restaurant actually pays).
  restaurant_price_a?: number | string | null
  restaurant_price_b?: number | string | null
  restaurant_price_c?: number | string | null
  // Shared per-quality stock buckets (sold-out display).
  stock_quantity?: number
  stock_quantity_b?: number
  stock_quantity_c?: number
  allow_half_kg?: boolean
  allow_quarter_kg?: boolean
  unit_type?: string
  primary_image?: string | null
  category_name?: string
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/**
 * Restaurant base (per-unit) price for a quality tier — null when the tier isn't
 * offered. Mirrors the backend: the tier is offered only when its CONSUMER price
 * exists; the restaurant pays restaurant_price_* (falling back to that consumer
 * price when blank).
 */
export function qualityBasePrice(product: RestaurantProduct, quality: Quality): number | null {
  if (quality === 'B') {
    if (n(product.price_b) == null) return null
    return n(product.restaurant_price_b) ?? n(product.price_b)
  }
  if (quality === 'C') {
    if (n(product.price_c) == null) return null
    return n(product.restaurant_price_c) ?? n(product.price_c)
  }
  return n(product.restaurant_price_a) ?? n(product.price) ?? 0
}

/** Shared stock for a quality tier (consumer + restaurant draw from the same bucket). */
export function qualityStock(product: RestaurantProduct, quality: Quality): number {
  if (quality === 'B') return Number(product.stock_quantity_b ?? 0) || 0
  if (quality === 'C') return Number(product.stock_quantity_c ?? 0) || 0
  return Number(product.stock_quantity ?? 0) || 0
}

/** Qualities a product offers (A always; B/C only when priced). */
export function availableQualities(product: RestaurantProduct): Quality[] {
  const out: Quality[] = ['A']
  if (qualityBasePrice(product, 'B') != null) out.push('B')
  if (qualityBasePrice(product, 'C') != null) out.push('C')
  return out
}

export interface UnitOption {
  value: Unit
  label: string
  short: string
}

/** Units the admin enabled for a product. */
export function availableUnits(product: RestaurantProduct): UnitOption[] {
  const unitType = String(product.unit_type || 'kg').toLowerCase()
  const baseShort = unitType === 'dozen' ? 'dozen' : unitType === 'kg' || unitType === 'gram' ? 'kg' : unitType || 'unit'
  const units: UnitOption[] = [{ value: 'full', label: `Per ${baseShort}`, short: baseShort }]
  if (unitType === 'kg' || unitType === 'gram') {
    if (product.allow_half_kg !== false) units.push({ value: 'half_kg', label: 'Half kg (½)', short: '½ kg' })
    if (product.allow_quarter_kg !== false) units.push({ value: 'quarter_kg', label: 'Quarter kg (¼)', short: '¼ kg' })
  } else if (unitType === 'dozen') {
    units.push({ value: 'half_dozen', label: 'Half dozen', short: '½ dozen' })
  }
  return units
}

/** Per-unit price for a quality + unit (null if tier N/A). */
export function unitPrice(product: RestaurantProduct, quality: Quality, unit: Unit): number | null {
  const base = qualityBasePrice(product, quality)
  if (base == null) return null
  if (unit === 'half_kg') return base * 0.5
  if (unit === 'quarter_kg') return base * 0.25
  if (unit === 'half_dozen') return base * 0.5
  return base
}

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
export const money = (x: number) => `Rs. ${round2(x).toLocaleString('en-PK')}`
