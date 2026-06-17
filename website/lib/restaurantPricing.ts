// Client-side restaurant pricing — mirrors backend resolveQualityUnitPrice.

export type Quality = 'A' | 'B' | 'C'
export type Unit = 'full' | 'half_kg' | 'quarter_kg' | 'half_dozen'

export interface RestaurantProduct {
  id: string
  name_en: string
  name_ur?: string
  price: number | string
  quality_b_price?: number | string | null
  quality_c_price?: number | string | null
  half_kg_price?: number | string | null
  quarter_kg_price?: number | string | null
  half_dozen_price?: number | string | null
  allow_half_kg?: boolean
  allow_quarter_kg?: boolean
  unit_type?: string
  stock_quantity?: number
  primary_image?: string | null
  category_name?: string
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/** Base (per-unit) price for a quality tier — null when the tier isn't offered. */
export function qualityBasePrice(product: RestaurantProduct, quality: Quality): number | null {
  if (quality === 'B') return n(product.quality_b_price)
  if (quality === 'C') return n(product.quality_c_price)
  return n(product.price) ?? 0
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
