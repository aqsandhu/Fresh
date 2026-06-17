import type { Product, ProductUnit, ProductQuality } from '@/types'

export interface UnitOption {
  unit: ProductUnit
  /** Human label shown in the dropdown ("Per kg", "Half kg", "Quarter kg", "Half dozen"). */
  label: string
  /** Computed price for ONE of this unit (admin override or derived). */
  price: number
  /** Optional explainer ("Admin set" vs "Derived from per-kg"). */
  derived: boolean
}

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Consumer base (per-full-unit) price for a quality tier (null = not offered). */
export function qualityBasePrice(product: Product, quality: ProductQuality = 'A'): number | null {
  if (quality === 'B') return toNumber(product.priceB)
  if (quality === 'C') return toNumber(product.priceC)
  return toNumber(product.price) ?? 0
}

/** Quality tiers a product offers: A always; B/C only when a consumer price is set. */
export function offeredQualities(product: Product): ProductQuality[] {
  const out: ProductQuality[] = ['A']
  if (qualityBasePrice(product, 'B') != null) out.push('B')
  if (qualityBasePrice(product, 'C') != null) out.push('C')
  return out
}

/** Shared stock for a quality tier (consumer + restaurant draw from the same bucket). */
export function qualityStock(product: Product, quality: ProductQuality = 'A'): number {
  if (quality === 'B') return Number(product.stockQuantityB ?? 0) || 0
  if (quality === 'C') return Number(product.stockQuantityC ?? 0) || 0
  return Number(product.stockQuantity ?? product.stock ?? product.stock_quantity ?? 0) || 0
}

/** Returns the unit options to show in the storefront for a product at a quality.
 * Mirrors the server's pricing logic in backend/src/utils/unitPricing.ts. Quality
 * A honours the admin's explicit half/quarter overrides; B/C derive the fraction
 * from the tier's base price (×0.5 / ×0.25).
 */
export function getUnitOptions(product: Product, quality: ProductQuality = 'A'): UnitOption[] {
  const base = qualityBasePrice(product, quality) ?? 0
  if (base <= 0) return []

  const useOverrides = quality === 'A'
  const unit = String(product.unit || '').toLowerCase()

  // Only kg-based products get half/quarter kg; only dozen-based get half dozen.
  if (unit === 'dozen') {
    const halfDozenOverride = useOverrides ? toNumber(product.halfDozenPrice) : null
    return [
      { unit: 'full', label: 'Per Dozen', price: base, derived: false },
      {
        unit: 'half_dozen',
        label: 'Half Dozen (6 pcs)',
        price: halfDozenOverride ?? base * 0.5,
        derived: halfDozenOverride == null,
      },
    ]
  }

  if (unit === 'kg' || unit === 'gram') {
    const halfKgOverride = useOverrides ? toNumber(product.halfKgPrice) : null
    const quarterKgOverride = useOverrides ? toNumber(product.quarterKgPrice) : null
    const options: UnitOption[] = [
      { unit: 'full', label: 'Per Kg', price: base, derived: false },
    ]
    // Each fraction is shown only when the admin has enabled it (default true).
    if (product.allowHalfKg !== false) {
      options.push({
        unit: 'half_kg',
        label: 'Half Kg (\u00BD kg)',
        price: halfKgOverride ?? base * 0.5,
        derived: halfKgOverride == null,
      })
    }
    if (product.allowQuarterKg !== false) {
      options.push({
        unit: 'quarter_kg',
        label: 'Quarter Kg (\u00BC kg)',
        price: quarterKgOverride ?? base * 0.25,
        derived: quarterKgOverride == null,
      })
    }
    return options
  }

  // No fraction units for piece / liter / pack — single option.
  return [{ unit: 'full', label: `Per ${unit || 'unit'}`, price: base, derived: false }]
}

/** Price for one cart/order line of the given unit + quality. */
export function priceForUnit(
  product: Product,
  unit: ProductUnit = 'full',
  quality: ProductQuality = 'A'
): number {
  const opts = getUnitOptions(product, quality)
  const found = opts.find((o) => o.unit === unit)
  return found?.price ?? (qualityBasePrice(product, quality) ?? product.price)
}

/** Prefer stored line price; fall back to product unit + quality pricing. */
export function resolveLineUnitPrice(item: {
  product: Product
  unit?: ProductUnit
  quality?: ProductQuality
  unitPrice?: number
}): number {
  const unit = item.unit || 'full'
  if (item.unitPrice != null && item.unitPrice > 0) return item.unitPrice
  return priceForUnit(item.product, unit, item.quality || 'A')
}

/** Suffix for ProductPrice, e.g. "/kg", "/half kg", "/½ kg". */
export function unitPriceSuffix(product: Product, unit: ProductUnit = 'full'): string {
  if (unit === 'full') {
    const u = (product.unit || 'unit').trim()
    return u ? `/${u}` : ''
  }
  const opt = getUnitOptions(product).find((o) => o.unit === unit)
  if (opt) {
    const label = opt.label.replace(/^Per /i, '').split('(')[0].trim()
    return label ? `/${label}` : ''
  }
  const short = unitLabelShort(unit)
  return short ? `/${short}` : ''
}

/** Caption beside unit price on cart/order lines. */
export function unitPriceCaption(unit: ProductUnit | undefined): string {
  switch (unit) {
    case 'half_kg':
      return 'per ½ kg'
    case 'quarter_kg':
      return 'per ¼ kg'
    case 'half_dozen':
      return 'per ½ dozen'
    default:
      return ''
  }
}

/** Default picker label on product cards when full unit is selected (matches app). */
export function getUnitPickerPrompt(product: Product): string {
  const unit = String(product.unit || '').toLowerCase()
  if (unit === 'dozen') return 'Select Half Dozen'
  if (unit === 'kg' || unit === 'gram') return 'Select Half Kg'
  return 'Select Unit'
}

/** Chip label on product cards — prompt when "full", short name when fraction selected. */
export function getUnitPickerDisplayLabel(
  product: Product,
  selectedUnit: ProductUnit,
  options: UnitOption[]
): string {
  if (selectedUnit === 'full') return getUnitPickerPrompt(product)
  const active = options.find((o) => o.unit === selectedUnit)
  if (!active) return getUnitPickerPrompt(product)
  switch (selectedUnit) {
    case 'half_kg':
      return 'Half Kg'
    case 'quarter_kg':
      return 'Quarter Kg'
    case 'half_dozen':
      return 'Half Dozen'
    default:
      return active.label
  }
}

/** Short label used in cart line items ("\u00BD kg", "\u00BC kg", etc.). */
export function unitLabelShort(unit: ProductUnit | undefined): string {
  switch (unit) {
    case 'half_kg':
      return '\u00BD kg'
    case 'quarter_kg':
      return '\u00BC kg'
    case 'half_dozen':
      return '\u00BD dozen'
    default:
      return ''
  }
}
