// The admin product form's data rules (moved out of pages/Products.tsx, W21):
// the empty form, loading a product into the form, validation and the data
// that is sent on save. No React here — the screen is ProductFormModal.tsx.
import { productService } from '@/services/product.service';
import type { Product, CreateProductData } from '@/types';
import { isRequired, isPositiveNumber, isNonNegativeNumber } from '@/utils/validators';

/** Default Urdu popup shown when a customer adds a variable-weight product. */
export const DEFAULT_VARIABLE_WEIGHT_NOTE =
  'آرڈر پیک کرتے ہوئے اس پروڈکٹ کا وزن آپ کے آرڈر سے کم یا زیادہ ہو سکتا ہے۔ ایسی صورت میں آپ کا آرڈر اور اس کی رقم آپ کے اصل وزن کے مطابق تبدیل ہو جائے گی۔';

export const UNITS = [
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'gram', label: 'Gram' },
  { value: 'piece', label: 'Piece' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'liter', label: 'Liter' },
  { value: 'ml', label: 'Milliliter (ml)' },
  { value: 'pack', label: 'Pack' },
];

export interface FormErrors {
  [key: string]: string;
}

// Catalog v2 — default per-quality channel flags + explicit fraction prices.
export const CATALOG_V2_DEFAULTS: Partial<CreateProductData> = {
  consumerEnabledA: true, consumerEnabledB: true, consumerEnabledC: true,
  restaurantEnabledA: false, restaurantEnabledB: false, restaurantEnabledC: false,
  halfKgPriceB: null, quarterKgPriceB: null, halfDozenPriceB: null,
  halfKgPriceC: null, quarterKgPriceC: null, halfDozenPriceC: null,
  restaurantHalfKgPriceA: null, restaurantQuarterKgPriceA: null, restaurantHalfDozenPriceA: null,
  restaurantHalfKgPriceB: null, restaurantQuarterKgPriceB: null, restaurantHalfDozenPriceB: null,
  restaurantHalfKgPriceC: null, restaurantQuarterKgPriceC: null, restaurantHalfDozenPriceC: null,
};

// Per-quality field-name map so one <QualityPriceBlock> serves A/B/C.
type QKeys = {
  base: keyof CreateProductData; half: keyof CreateProductData; quarter: keyof CreateProductData;
  halfDozen: keyof CreateProductData; stock: keyof CreateProductData;
  consumer: keyof CreateProductData; restEnabled: keyof CreateProductData;
  restBase: keyof CreateProductData; restHalf: keyof CreateProductData;
  restQuarter: keyof CreateProductData; restHalfDozen: keyof CreateProductData;
};
export const QUALITY_FIELDS: Record<'A' | 'B' | 'C', QKeys> = {
  A: { base: 'price', half: 'halfKgPrice', quarter: 'quarterKgPrice', halfDozen: 'halfDozenPrice', stock: 'stockQuantity', consumer: 'consumerEnabledA', restEnabled: 'restaurantEnabledA', restBase: 'restaurantPriceA', restHalf: 'restaurantHalfKgPriceA', restQuarter: 'restaurantQuarterKgPriceA', restHalfDozen: 'restaurantHalfDozenPriceA' },
  B: { base: 'priceB', half: 'halfKgPriceB', quarter: 'quarterKgPriceB', halfDozen: 'halfDozenPriceB', stock: 'stockQuantityB', consumer: 'consumerEnabledB', restEnabled: 'restaurantEnabledB', restBase: 'restaurantPriceB', restHalf: 'restaurantHalfKgPriceB', restQuarter: 'restaurantQuarterKgPriceB', restHalfDozen: 'restaurantHalfDozenPriceB' },
  C: { base: 'priceC', half: 'halfKgPriceC', quarter: 'quarterKgPriceC', halfDozen: 'halfDozenPriceC', stock: 'stockQuantityC', consumer: 'consumerEnabledC', restEnabled: 'restaurantEnabledC', restBase: 'restaurantPriceC', restHalf: 'restaurantHalfKgPriceC', restQuarter: 'restaurantQuarterKgPriceC', restHalfDozen: 'restaurantHalfDozenPriceC' },
};

// Optional price boxes (blank = automatic / not offered) and how to name them.
export const OPTIONAL_PRICE_FIELDS: Array<[keyof CreateProductData, string]> = (['A', 'B', 'C'] as const).flatMap((q) => {
  const f = QUALITY_FIELDS[q];
  const tier = `Quality ${q}`;
  return [
    [f.half, `${tier} ½ kg price`], [f.quarter, `${tier} ¼ kg price`], [f.halfDozen, `${tier} ½ dozen price`],
    [f.restBase, `${tier} restaurant price`], [f.restHalf, `${tier} restaurant ½ kg price`],
    [f.restQuarter, `${tier} restaurant ¼ kg price`], [f.restHalfDozen, `${tier} restaurant ½ dozen price`],
  ] as Array<[keyof CreateProductData, string]>;
});

/** A blank "Add product" form. */
export const emptyProductForm = (): CreateProductData => ({
  nameEn: '',
  nameUr: '',
  descriptionEn: '',
  price: 0,
  compareAtPrice: 0,
  halfKgPrice: null,
  quarterKgPrice: null,
  halfDozenPrice: null,
  stockQuantity: 0,
  unitType: 'kg',
  categoryId: '',
  isActive: true,
  isFeatured: false,
  isVariableWeight: false,
  variableWeightNote: '',
  allowHalfKg: true,
  allowQuarterKg: true,
  tags: [],
  priceB: null,
  priceC: null,
  stockQuantityB: null,
  stockQuantityC: null,
  availableForRestaurants: false,
  restaurantPriceA: null,
  restaurantPriceB: null,
  restaurantPriceC: null,
  ...CATALOG_V2_DEFAULTS,
});

/**
 * The edit form for a product: the full product is fetched (the list row lacks
 * the B/C, restaurant and fraction prices) — when that fails, the list row is
 * used. Also returns the stored pictures, RAW and in the backend's order, so
 * removal indexes stay valid and the kept list is sent back verbatim as
 * `existing_images` on save (Contract C1).
 */
export async function loadProductForm(
  product: Product,
): Promise<{ formData: CreateProductData; existingImages: string[] }> {
  let tags: string[] = product.tags || [];
  let isVariableWeight = product.isVariableWeight ?? false;
  let variableWeightNote = product.variableWeightNote ?? '';
  // Default TRUE so legacy products (before migration 25) keep showing the
  // half/quarter options until an admin explicitly unchecks them.
  let allowHalfKg = product.allowHalfKg ?? true;
  let allowQuarterKg = product.allowQuarterKg ?? true;
  let detail: Product = product;
  try {
    detail = await productService.getProductById(product.id);
    tags = detail.tags || [];
    isVariableWeight = detail.isVariableWeight ?? false;
    variableWeightNote = detail.variableWeightNote ?? '';
    allowHalfKg = detail.allowHalfKg ?? true;
    allowQuarterKg = detail.allowQuarterKg ?? true;
  } catch {
    // Keep list tags if detail fetch fails
  }
  // Show existing images (from the fresh detail fetch when available) as
  // previews. RAW stored URLs are kept in backend-array order so removal
  // indexes stay valid and the kept list can be sent back verbatim as
  // `existing_images` on submit (Contract C1); they are resolved for display.
  const rawImages = (detail.images && detail.images.length > 0 ? detail.images : product.images) || [];
  const existingImages =
    rawImages.length > 0 ? rawImages : product.primaryImage ? [product.primaryImage] : [];
  return {
    existingImages,
    formData: {
      nameEn: product.nameEn,
      nameUr: product.nameUr || '',
      descriptionEn: product.descriptionEn || '',
      price: product.price,
      compareAtPrice: product.compareAtPrice || 0,
      halfKgPrice: product.halfKgPrice ?? null,
      quarterKgPrice: product.quarterKgPrice ?? null,
      halfDozenPrice: product.halfDozenPrice ?? null,
      stockQuantity: product.stockQuantity,
      unitType: product.unitType,
      categoryId: product.categoryId,
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      isVariableWeight,
      variableWeightNote,
      allowHalfKg,
      allowQuarterKg,
      tags,
      priceB: detail.priceB ?? null,
      priceC: detail.priceC ?? null,
      stockQuantityB: detail.stockQuantityB ?? null,
      stockQuantityC: detail.stockQuantityC ?? null,
      availableForRestaurants: detail.availableForRestaurants ?? false,
      restaurantPriceA: detail.restaurantPriceA ?? null,
      restaurantPriceB: detail.restaurantPriceB ?? null,
      restaurantPriceC: detail.restaurantPriceC ?? null,
      // Catalog v2 — per-quality channel flags + explicit fractions (default-safe).
      consumerEnabledA: detail.consumerEnabledA ?? true,
      consumerEnabledB: detail.consumerEnabledB ?? true,
      consumerEnabledC: detail.consumerEnabledC ?? true,
      restaurantEnabledA: detail.restaurantEnabledA ?? false,
      restaurantEnabledB: detail.restaurantEnabledB ?? false,
      restaurantEnabledC: detail.restaurantEnabledC ?? false,
      halfKgPriceB: detail.halfKgPriceB ?? null,
      quarterKgPriceB: detail.quarterKgPriceB ?? null,
      halfDozenPriceB: detail.halfDozenPriceB ?? null,
      halfKgPriceC: detail.halfKgPriceC ?? null,
      quarterKgPriceC: detail.quarterKgPriceC ?? null,
      halfDozenPriceC: detail.halfDozenPriceC ?? null,
      restaurantHalfKgPriceA: detail.restaurantHalfKgPriceA ?? null,
      restaurantQuarterKgPriceA: detail.restaurantQuarterKgPriceA ?? null,
      restaurantHalfDozenPriceA: detail.restaurantHalfDozenPriceA ?? null,
      restaurantHalfKgPriceB: detail.restaurantHalfKgPriceB ?? null,
      restaurantQuarterKgPriceB: detail.restaurantQuarterKgPriceB ?? null,
      restaurantHalfDozenPriceB: detail.restaurantHalfDozenPriceB ?? null,
      restaurantHalfKgPriceC: detail.restaurantHalfKgPriceC ?? null,
      restaurantQuarterKgPriceC: detail.restaurantQuarterKgPriceC ?? null,
      restaurantHalfDozenPriceC: detail.restaurantHalfDozenPriceC ?? null,
    },
  };
}

/** Every reason the form can't be saved (empty object = fine). */
export function validateProductForm(formData: CreateProductData): FormErrors {
  const errors: FormErrors = {};

  // Product Name (English) - Required
  if (!isRequired(formData.nameEn)) {
    errors.nameEn = 'Product name (English) is required';
  } else if (formData.nameEn.length < 2) {
    errors.nameEn = 'Product name must be at least 2 characters';
  }

  // Product Name (Urdu) - Optional but validate if provided
  if (formData.nameUr && formData.nameUr.length < 2) {
    errors.nameUr = 'Product name must be at least 2 characters';
  }

  // Quality A price — must be greater than 0.
  if (!isPositiveNumber(formData.price)) {
    errors.price = 'Price must be greater than 0';
  }
  // Quality B / C — if the tier is offered, its price must be greater than 0.
  if (formData.priceB != null && !isPositiveNumber(formData.priceB)) {
    errors.priceB = 'Quality B price must be greater than 0 (or remove the tier)';
  }
  if (formData.priceC != null && !isPositiveNumber(formData.priceC)) {
    errors.priceC = 'Quality C price must be greater than 0 (or remove the tier)';
  }

  // Compare At Price - If provided, must be non-negative and greater than price
  if (formData.compareAtPrice && formData.compareAtPrice > 0) {
    if (!isNonNegativeNumber(formData.compareAtPrice)) {
      errors.compareAtPrice = 'Compare at price must be non-negative';
    } else if (formData.compareAtPrice <= formData.price) {
      errors.compareAtPrice = 'Compare at price should be higher than regular price';
    }
  }
  // Stock is NOT set here — it is managed via Management → Expenses/Stock.

  // Every optional price box: blank = automatic, but never 0 — a 0 sold
  // that unit for Rs. 0 (B37; the server now refuses it too).
  const zeroPrice = OPTIONAL_PRICE_FIELDS.find(([key]) => {
    const v = formData[key] as unknown;
    return v != null && v !== '' && !(Number(v) > 0);
  });
  if (zeroPrice) {
    errors.optionalPrices = `${zeroPrice[1]} must be greater than 0 — leave it blank for the automatic price`;
  }

  // Category - Required
  if (!isRequired(formData.categoryId)) {
    errors.categoryId = 'Please select a category';
  }

  // Unit Type - Required
  if (!isRequired(formData.unitType)) {
    errors.unitType = 'Please select a unit type';
  }

  return errors;
}

/** What is sent to the server for this form (pictures are added by the caller). */
export function productSubmitData(
  formData: CreateProductData,
  selectedCategoryAllowsRestaurants: boolean,
): CreateProductData {
  // The legacy "available for restaurants" flag is now derived from the
  // per-quality restaurant toggles (and only when the category permits) — it
  // gates whether the product appears on the restaurant storefront at all.
  const anyRestaurantQuality =
    formData.restaurantEnabledA === true ||
    formData.restaurantEnabledB === true ||
    formData.restaurantEnabledC === true;
  const submitData: CreateProductData = {
    ...formData,
    availableForRestaurants: selectedCategoryAllowsRestaurants && anyRestaurantQuality,
    // If the category forbids restaurants, force all restaurant toggles off.
    ...(selectedCategoryAllowsRestaurants
      ? {}
      : { restaurantEnabledA: false, restaurantEnabledB: false, restaurantEnabledC: false }),
  };
  // Stock is NEVER added/updated from the product form — it only comes from
  // Management → Expenses (stock purchase) / Stock. Drop the stock fields so a
  // create starts at 0 and an update leaves existing stock untouched.
  delete (submitData as Partial<CreateProductData>).stockQuantity;
  delete (submitData as Partial<CreateProductData>).stockQuantityB;
  delete (submitData as Partial<CreateProductData>).stockQuantityC;
  return submitData;
}
