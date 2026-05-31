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
