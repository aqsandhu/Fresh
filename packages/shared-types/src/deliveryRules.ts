/**
 * Client-side delivery rules — must mirror backend/src/utils/deliveryCalculator.ts
 * and the DB seed (database/schema.sql: categories.qualifies_for_free_delivery
 * and the FREE_VEG_FRUIT_MIN rule).
 *
 *   1. Free-delivery time slot → FREE
 *   2. Vegetables + fruits + dry fruits subtotal ≥ threshold → FREE
 *   3. Otherwise → base charge
 *
 * Dry fruits DO count toward the free-delivery minimum (the DB seed marks the
 * 'dry-fruits' category qualifies_for_free_delivery = TRUE and includes it in
 * FREE_VEG_FRUIT_MIN). Chicken, meat, and other categories never count.
 */

export const VEG_FRUIT_CATEGORY_SLUGS = [
  'vegetables',
  'fruits',
  'sabzi',
  'fruit',
  'dry-fruits',
  'dry fruits',
  'dryfruit',
  'dryfruits',
] as const;

/** Slugs that must never be treated as qualifying for the free-delivery minimum. */
export const NON_VEG_FRUIT_CATEGORY_SLUGS = [
  'chicken',
  'meat',
  'grocery',
] as const;

export type DeliveryCartLine = {
  product: {
    category?: string;
    categorySlug?: string;
    category_slug?: string;
    categoryName?: string;
    category_name?: string;
    /** From API / categories.qualifies_for_free_delivery — preferred over slug heuristics. */
    qualifiesForFreeDelivery?: boolean;
    qualifies_for_free_delivery?: boolean;
    price: number;
  };
  quantity: number;
  unitPrice?: number;
};

const linePrice = (item: DeliveryCartLine) =>
  (item.unitPrice ?? item.product.price) * item.quantity;

function normalizeSlug(product: DeliveryCartLine['product']): string {
  return String(
    product.categorySlug || product.category_slug || product.category || ''
  )
    .toLowerCase()
    .trim();
}

function isNonVegFruitSlug(slug: string): boolean {
  if (!slug) return false;
  return NON_VEG_FRUIT_CATEGORY_SLUGS.some(
    (excluded) => slug === excluded || slug.includes(excluded)
  );
}

function categoryQualifiesForFreeDelivery(product: DeliveryCartLine['product']): boolean | null {
  if (product.qualifiesForFreeDelivery === true || product.qualifies_for_free_delivery === true) {
    return true;
  }
  if (product.qualifiesForFreeDelivery === false || product.qualifies_for_free_delivery === false) {
    return false;
  }
  return null;
}

/**
 * True when the product's category counts toward the free-delivery threshold.
 * Uses admin-controlled `qualifies_for_free_delivery` when present; falls back to slug heuristics for legacy carts.
 */
export function isVegOrFruitProduct(product: DeliveryCartLine['product']): boolean {
  const dbFlag = categoryQualifiesForFreeDelivery(product);
  if (dbFlag !== null) return dbFlag;

  const slug = normalizeSlug(product);
  if (!slug || isNonVegFruitSlug(slug)) return false;
  return (VEG_FRUIT_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

export function getVegFruitSubtotal(items: DeliveryCartLine[]): number {
  return items
    .filter((item) => isVegOrFruitProduct(item.product))
    .reduce((sum, item) => sum + linePrice(item), 0);
}

export function isFreeDelivery(
  items: DeliveryCartLine[],
  freeThreshold: number,
  isFreeDeliverySlot = false
): boolean {
  if (isFreeDeliverySlot) return true;
  return getVegFruitSubtotal(items) >= freeThreshold;
}

export function calculateClientDeliveryCharge(
  items: DeliveryCartLine[],
  baseCharge: number,
  freeThreshold: number,
  isFreeDeliverySlot = false
): number {
  if (items.length === 0) return 0;
  if (isFreeDeliverySlot) return 0;
  if (getVegFruitSubtotal(items) >= freeThreshold) return 0;
  return baseCharge;
}

export function getDeliveryHint(
  items: DeliveryCartLine[],
  freeThreshold: number,
  isFreeDeliverySlot = false
): string | null {
  if (items.length === 0) return null;
  if (isFreeDeliverySlot) {
    return 'You qualify for free delivery — selected slot is free.';
  }

  const vegFruitSubtotal = getVegFruitSubtotal(items);
  if (vegFruitSubtotal >= freeThreshold) {
    return `You qualify for free delivery (Rs. ${vegFruitSubtotal} in vegetables/fruits/dry fruits).`;
  }

  const remaining = Math.max(0, freeThreshold - vegFruitSubtotal);
  return `Add Rs. ${remaining} more in vegetables/fruits/dry fruits for free delivery — other items don't count.`;
}
