/**
 * Client-side delivery rules — must mirror backend/src/utils/deliveryCalculator.ts
 *
 *   1. Free-delivery time slot → FREE
 *   2. Vegetables + fruits subtotal ≥ threshold → FREE
 *   3. Otherwise → base charge
 *
 * Dry fruits, chicken, and other categories never count toward the veg/fruit minimum.
 */

export const VEG_FRUIT_CATEGORY_SLUGS = [
  'vegetables',
  'fruits',
  'sabzi',
  'fruit',
] as const;

/** Slugs that must never be treated as fresh veg/fruit (e.g. dry-fruit contains "fruit"). */
export const NON_VEG_FRUIT_CATEGORY_SLUGS = [
  'dry-fruit',
  'dry-fruits',
  'dryfruit',
  'dryfruits',
  'dry fruit',
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

/**
 * True only for fresh vegetables / fruits categories (slug-based, same as website cart).
 */
export function isVegOrFruitProduct(product: DeliveryCartLine['product']): boolean {
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
    return `You qualify for free delivery (Rs. ${vegFruitSubtotal} in vegetables/fruits).`;
  }

  const remaining = Math.max(0, freeThreshold - vegFruitSubtotal);
  return `Add Rs. ${remaining} more in vegetables/fruits for free delivery — other items don't count.`;
}
