/**
 * Delivery rule (must mirror backend/src/utils/deliveryCalculator.ts):
 *
 *   1. Free-delivery time slot selected → FREE (regardless of order amount)
 *   2. Vegetables + fruits subtotal ≥ free-delivery threshold → FREE
 *   3. Otherwise → standard base charge
 *
 * Chicken / meat / grocery items are completely ignored when deciding free
 * delivery — even a 5000 rupee chicken-only order is paid. The user must
 * have at least `threshold` worth of vegetables + fruits.
 */

export const VEG_FRUIT_CATEGORY_SLUGS = [
  'vegetables',
  'fruits',
  'sabzi',
  'fruit',
] as const

export type CartLineItem = {
  product: { category?: string; price: number }
  quantity: number
}

export function isVegOrFruitCategory(category?: string): boolean {
  if (!category) return false
  return (VEG_FRUIT_CATEGORY_SLUGS as readonly string[]).includes(
    category.toLowerCase()
  )
}

export function getCartSubtotal(items: CartLineItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
}

export function getVegFruitSubtotal(items: CartLineItem[]): number {
  return items
    .filter((item) => isVegOrFruitCategory(item.product.category))
    .reduce((sum, item) => sum + item.product.price * item.quantity, 0)
}

export function calculateClientDeliveryCharge(
  items: CartLineItem[],
  baseCharge: number,
  freeThreshold: number,
  isFreeDeliverySlot = false
): number {
  if (items.length === 0) return 0
  if (isFreeDeliverySlot) return 0

  const vegFruitSubtotal = getVegFruitSubtotal(items)
  if (vegFruitSubtotal >= freeThreshold) return 0

  return baseCharge
}

/**
 * Single-line hint shown next to delivery rows. Identical text everywhere so
 * the cart / dropdown / checkout / cart screen all describe the same rule.
 */
export function getDeliveryHint(
  items: CartLineItem[],
  freeThreshold: number,
  isFreeDeliverySlot = false
): string | null {
  if (items.length === 0) return null
  if (isFreeDeliverySlot) {
    return 'You qualify for free delivery — selected slot is free.'
  }

  const vegFruitSubtotal = getVegFruitSubtotal(items)
  if (vegFruitSubtotal >= freeThreshold) {
    return `You qualify for free delivery (Rs. ${vegFruitSubtotal} in vegetables/fruits).`
  }

  const remaining = Math.max(0, freeThreshold - vegFruitSubtotal)
  return `Add Rs. ${remaining} more in vegetables/fruits for free delivery — other items don't count.`
}

// Backwards compat alias used by older code paths.
export const getMixedOrderDeliveryHint = getDeliveryHint
