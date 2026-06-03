/**
 * Re-export delivery rules from the shared package (single source of truth).
 */
export {
  VEG_FRUIT_CATEGORY_SLUGS,
  NON_VEG_FRUIT_CATEGORY_SLUGS,
  isVegOrFruitProduct as isVegOrFruitCategory,
  getVegFruitSubtotal,
  calculateClientDeliveryCharge,
  getDeliveryHint,
} from '@freshbazar/shared-types';

import { getDeliveryHint } from '@freshbazar/shared-types';

/** @deprecated Use getDeliveryHint — kept for older imports */
export const getMixedOrderDeliveryHint = getDeliveryHint;

export type CartLineItem = {
  product: { category?: string; price: number };
  quantity: number;
  unitPrice?: number;
};

export function getCartSubtotal(items: CartLineItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.unitPrice ?? item.product.price) * item.quantity,
    0
  );
}
