/**
 * Free delivery rules (website + must mirror backend deliveryCalculator):
 * - Chicken-only or meat-only → always paid delivery
 * - All other orders (including mixed) → free only when BOTH:
 *   1) vegetables + fruits subtotal ≥ free-delivery threshold
 *   2) total cart subtotal ≥ free-delivery threshold
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
  return (VEG_FRUIT_CATEGORY_SLUGS as readonly string[]).includes(category.toLowerCase())
}

export function getCartSubtotal(items: CartLineItem[]): number {
  return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
}

export function getVegFruitSubtotal(items: CartLineItem[]): number {
  return items
    .filter((item) => isVegOrFruitCategory(item.product.category))
    .reduce((sum, item) => sum + item.product.price * item.quantity, 0)
}

export function calculateClientDeliveryCharge(
  items: CartLineItem[],
  baseCharge: number,
  freeThreshold: number
): number {
  if (items.length === 0) return 0

  const subtotal = getCartSubtotal(items)
  const hasOnlyChicken =
    items.length > 0 && items.every((item) => item.product.category === 'chicken')
  const hasOnlyMeat =
    items.length > 0 && items.every((item) => item.product.category === 'meat')

  if (hasOnlyChicken || hasOnlyMeat) {
    return baseCharge
  }

  const vegFruitSubtotal = getVegFruitSubtotal(items)
  if (vegFruitSubtotal >= freeThreshold && subtotal >= freeThreshold) {
    return 0
  }

  return baseCharge
}

export function getMixedOrderDeliveryHint(
  items: CartLineItem[],
  freeThreshold: number
): string | null {
  if (items.length === 0) return null

  const hasOnlyChicken =
    items.every((item) => item.product.category === 'chicken')
  const hasOnlyMeat = items.every((item) => item.product.category === 'meat')

  if (hasOnlyChicken || hasOnlyMeat) {
    return 'Delivery charges apply for chicken/meat-only orders'
  }

  const subtotal = getCartSubtotal(items)
  const vegFruitSubtotal = getVegFruitSubtotal(items)

  if (vegFruitSubtotal >= freeThreshold && subtotal >= freeThreshold) {
    return 'You qualify for free delivery!'
  }

  const parts: string[] = []
  if (vegFruitSubtotal < freeThreshold) {
    parts.push(`Add Rs. ${freeThreshold - vegFruitSubtotal} more vegetables/fruits`)
  }
  if (subtotal < freeThreshold) {
    parts.push(`Add Rs. ${freeThreshold - subtotal} more to your order`)
  }

  return parts.length > 0
    ? `${parts.join(' and ')} for free delivery`
    : null
}
