import type { ProductUnit, StoreProduct } from '@app-types';

export interface UnitOption {
  unit: ProductUnit;
  label: string;
  price: number;
  derived: boolean;
}

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Returns the unit options to show in the storefront for a product. */
export function getUnitOptions(product: StoreProduct): UnitOption[] {
  const base = toNumber(product.price) ?? 0;
  if (base <= 0) return [];

  const unit = String(product.unit || '').toLowerCase();

  if (unit === 'dozen') {
    const halfDozenOverride = toNumber(product.halfDozenPrice);
    return [
      { unit: 'full', label: 'Per Dozen', price: base, derived: false },
      {
        unit: 'half_dozen',
        label: 'Half Dozen (6 pcs)',
        price: halfDozenOverride ?? base * 0.5,
        derived: halfDozenOverride == null,
      },
    ];
  }

  if (unit === 'kg' || unit === 'gram') {
    const halfKgOverride = toNumber(product.halfKgPrice);
    const quarterKgOverride = toNumber(product.quarterKgPrice);
    return [
      { unit: 'full', label: 'Per Kg', price: base, derived: false },
      {
        unit: 'half_kg',
        label: 'Half Kg (½ kg)',
        price: halfKgOverride ?? base * 0.5,
        derived: halfKgOverride == null,
      },
      {
        unit: 'quarter_kg',
        label: 'Quarter Kg (¼ kg)',
        price: quarterKgOverride ?? base * 0.25,
        derived: quarterKgOverride == null,
      },
    ];
  }

  return [{ unit: 'full', label: `Per ${unit || 'Unit'}`, price: base, derived: false }];
}

export function priceForUnit(product: StoreProduct, unit: ProductUnit = 'full'): number {
  const opts = getUnitOptions(product);
  const found = opts.find((o) => o.unit === unit);
  return found?.price ?? product.price;
}

export function resolveLineUnitPrice(item: {
  product: StoreProduct;
  unit?: ProductUnit;
  unitPrice?: number;
}): number {
  const unit = item.unit || 'full';
  if (item.unitPrice != null && item.unitPrice > 0) return item.unitPrice;
  return priceForUnit(item.product, unit);
}

export function unitLabelShort(unit: ProductUnit | undefined): string {
  switch (unit) {
    case 'half_kg':
      return '½ kg';
    case 'quarter_kg':
      return '¼ kg';
    case 'half_dozen':
      return '½ dozen';
    default:
      return '';
  }
}

/** Default picker CTA on product cards when full unit is selected. */
export function getUnitPickerPrompt(product: StoreProduct): string {
  const unit = String(product.unit || '').toLowerCase();
  if (unit === 'dozen') return 'Select Half Dozen';
  if (unit === 'kg' || unit === 'gram') return 'Select Half Kg';
  return 'Select Unit';
}

export function getUnitPickerDisplayLabel(
  product: StoreProduct,
  selectedUnit: ProductUnit,
  options: UnitOption[]
): string {
  if (selectedUnit === 'full') return getUnitPickerPrompt(product);
  const active = options.find((o) => o.unit === selectedUnit);
  if (!active) return getUnitPickerPrompt(product);
  switch (selectedUnit) {
    case 'half_kg':
      return 'Half Kg';
    case 'quarter_kg':
      return 'Quarter Kg';
    case 'half_dozen':
      return 'Half Dozen';
    default:
      return active.label;
  }
}

/** Shared unit-picker chip styling for product cards and detail page. */
export const UNIT_PICKER_CHIP = {
  backgroundColor: '#F4F9F6',
  borderColor: '#C5DECF',
  textColor: '#2F6B4F',
} as const;

export function unitPriceCaption(unit: ProductUnit | undefined): string {
  switch (unit) {
    case 'half_kg':
      return 'per ½ kg';
    case 'quarter_kg':
      return 'per ¼ kg';
    case 'half_dozen':
      return 'per ½ dozen';
    default:
      return '';
  }
}
