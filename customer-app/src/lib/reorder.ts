import type { OrderItem, ProductQuality, ProductUnit, StoreProduct } from '@app-types';

export interface ReorderDeps {
  /** Today's product (price, stock, which sizes are on) — throws / returns null when gone. */
  fetchProduct: (productId: string) => Promise<StoreProduct | null | undefined>;
  addItem: (product: StoreProduct, quantity: number, unit: ProductUnit, quality: ProductQuality) => Promise<void>;
}

/**
 * Put the lines of an earlier order back in the cart — same size, same
 * quality, at TODAY's price (the same as the website). It used to rebuild
 * every line from the old order: each came back as a full unit of Quality A
 * carrying the old line's price (a half-kg Quality B line became 1 kg of
 * Quality A at the half-kg price). Lines whose product is gone or out of
 * stock are skipped. Returns how many units were added.
 */
export async function reorderItems(items: OrderItem[], deps: ReorderDeps): Promise<number> {
  let added = 0;
  for (const item of items) {
    if (!item.productId) continue;
    try {
      const product = await deps.fetchProduct(item.productId);
      if (!product || !product.inStock) continue;
      await deps.addItem(product, item.quantity, item.saleUnit || 'full', item.quality || 'A');
      added += item.quantity;
    } catch {
      // Product no longer available — skip it.
    }
  }
  return added;
}
