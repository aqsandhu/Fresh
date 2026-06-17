import type { ProductUnit, ProductQuality, StoreProduct } from '@app-types';

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

/** Consumer base (per-full-unit) price for a quality tier (null = not offered). */
export function qualityBasePrice(product: StoreProduct, quality: ProductQuality = 'A'): number | null {
  if (quality === 'B') return toNumber(product.priceB);
  if (quality === 'C') return toNumber(product.priceC);
  return toNumber(product.price) ?? 0;
}

/** Quality tiers a product offers: A always; B/C only when a consumer price is set. */
export function offeredQualities(product: StoreProduct): ProductQuality[] {
  const out: ProductQuality[] = ['A'];
  if (qualityBasePrice(product, 'B') != null) out.push('B');
  if (qualityBasePrice(product, 'C') != null) out.push('C');
  return out;
}

/** Shared stock for a quality tier (consumer + restaurant draw from the same bucket). */
export function qualityStock(product: StoreProduct, quality: ProductQuality = 'A'): number {
  if (quality === 'B') return Number(product.stockQuantityB ?? 0) || 0;
  if (quality === 'C') return Number(product.stockQuantityC ?? 0) || 0;
  return Number(product.stock ?? 0) || 0;
}

/** Returns the unit options to show for a product at a quality tier.
 *  Quality A honours the admin's explicit half/quarter overrides; B/C derive the
 *  fraction from the tier's base price (×0.5 / ×0.25). */
export function getUnitOptions(product: StoreProduct, quality: ProductQuality = 'A'): UnitOption[] {
  const base = qualityBasePrice(product, quality) ?? 0;
  if (base <= 0) return [];

  const useOverrides = quality === 'A';
  const unit = String(product.unit || '').toLowerCase();

  if (unit === 'dozen') {
    const halfDozenOverride = useOverrides ? toNumber(product.halfDozenPrice) : null;
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
    const halfKgOverride = useOverrides ? toNumber(product.halfKgPrice) : null;
    const quarterKgOverride = useOverrides ? toNumber(product.quarterKgPrice) : null;
    const options: UnitOption[] = [
      { unit: 'full', label: 'Per Kg', price: base, derived: false },
    ];
    // Each fraction is shown only when the admin has enabled it (default true).
    if (product.allowHalfKg !== false) {
      options.push({
        unit: 'half_kg',
        label: 'Half Kg (½ kg)',
        price: halfKgOverride ?? base * 0.5,
        derived: halfKgOverride == null,
      });
    }
    if (product.allowQuarterKg !== false) {
      options.push({
        unit: 'quarter_kg',
        label: 'Quarter Kg (¼ kg)',
        price: quarterKgOverride ?? base * 0.25,
        derived: quarterKgOverride == null,
      });
    }
    return options;
  }

  return [{ unit: 'full', label: `Per ${unit || 'Unit'}`, price: base, derived: false }];
}

export function priceForUnit(
  product: StoreProduct,
  unit: ProductUnit = 'full',
  quality: ProductQuality = 'A'
): number {
  const opts = getUnitOptions(product, quality);
  const found = opts.find((o) => o.unit === unit);
  return found?.price ?? (qualityBasePrice(product, quality) ?? product.price);
}

export function resolveLineUnitPrice(item: {
  product: StoreProduct;
  unit?: ProductUnit;
  quality?: ProductQuality;
  unitPrice?: number;
}): number {
  const unit = item.unit || 'full';
  if (item.unitPrice != null && item.unitPrice > 0) return item.unitPrice;
  return priceForUnit(item.product, unit, item.quality || 'A');
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
