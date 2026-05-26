import type { Product, ProductUnit } from '@/types'

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

/**
 * Returns the unit options to show in the storefront for a product.
 * Mirrors the server's pricing logic in backend/src/controllers/cart.controller.ts.
 */
export function getUnitOptions(product: Product): UnitOption[] {
  const base = toNumber(product.price) ?? 0
  if (base <= 0) return []

  const unit = String(product.unit || '').toLowerCase()

  // Only kg-based products get half/quarter kg; only dozen-based get half dozen.
  if (unit === 'dozen') {
    const halfDozenOverride = toNumber(product.halfDozenPrice)
    return [
      { unit: 'full', label: 'Per dozen', price: base, derived: false },
      {
        unit: 'half_dozen',
        label: 'Half dozen (6)',
        price: halfDozenOverride ?? base * 0.5,
        derived: halfDozenOverride == null,
      },
    ]
  }

  if (unit === 'kg' || unit === 'gram') {
    const halfKgOverride = toNumber(product.halfKgPrice)
    const quarterKgOverride = toNumber(product.quarterKgPrice)
    return [
      { unit: 'full', label: 'Per kg', price: base, derived: false },
      {
        unit: 'half_kg',
        label: 'Half kg (\u00BD kg)',
        price: halfKgOverride ?? base * 0.5,
        derived: halfKgOverride == null,
      },
      {
        unit: 'quarter_kg',
        label: 'Quarter kg (\u00BC kg)',
        price: quarterKgOverride ?? base * 0.25,
        derived: quarterKgOverride == null,
      },
    ]
  }

  // No fraction units for piece / liter / pack — single option.
  return [{ unit: 'full', label: `Per ${unit || 'unit'}`, price: base, derived: false }]
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
