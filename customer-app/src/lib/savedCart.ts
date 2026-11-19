// ============================================================================
// THE CART BELONGS TO THE ACCOUNT (owner decision Q5, 15 Nov 2026)
//
// Signing in on another phone or on the website shows the same cart. The rules:
//
//   - Signed in: the cart saved with the account is the real one. Opening the
//     app / coming back to it shows what the account holds (so an order placed
//     or an item removed on another device is seen here too).
//   - A guest's cart is joined to the account's cart at sign-in. A line that is
//     in both keeps the LARGER quantity — never the sum: after an expired
//     session this device's cart is a copy of the saved one, and adding them
//     would double everything.
//   - A change made while the server could not be reached ("pending") is sent
//     as soon as it can be; until then this device's cart wins.
//
// The server keeps one cart per account, for one city at a time (the city last
// used). Carts of other cities stay on the device they were made on.
// ============================================================================
import { ProductQuality, ProductUnit, StoreCartItem, StoreProduct } from '@app-types';
import { priceForUnit } from '@/lib/unitPricing';

/** null = the account has this cart; guest = made while signed out; pending = a change the server has not got yet. */
export type UnsavedKind = 'guest' | 'pending' | null;

export interface SavedCartLine {
  productId: string;
  quantity: number;
  unit: ProductUnit;
  quality: ProductQuality;
  cityId: string | null;
}

export const cartLineKey = (productId: string, unit: ProductUnit = 'full', quality: ProductQuality = 'A') =>
  `${productId}::${unit}::${quality}`;

const keyOf = (item: StoreCartItem) => cartLineKey(item.product.id, item.unit || 'full', item.quality || 'A');

const UNITS: ProductUnit[] = ['full', 'half_kg', 'quarter_kg', 'half_dozen'];
const QUALITIES: ProductQuality[] = ['A', 'B', 'C'];

/** GET /cart items → lines (anything malformed is left out). */
export function parseSavedCart(rawItems: unknown): SavedCartLine[] {
  if (!Array.isArray(rawItems)) return [];
  const lines: SavedCartLine[] = [];
  for (const raw of rawItems as Array<Record<string, unknown>>) {
    const productId = typeof raw?.product_id === 'string' ? raw.product_id : '';
    const quantity = Number(raw?.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
    const unit = UNITS.includes(raw.unit as ProductUnit) ? (raw.unit as ProductUnit) : 'full';
    const quality = QUALITIES.includes(raw.quality as ProductQuality) ? (raw.quality as ProductQuality) : 'A';
    lines.push({ productId, quantity, unit, quality, cityId: typeof raw.city_id === 'string' ? raw.city_id : null });
  }
  return lines;
}

/** Saved lines + the products as they are sold NOW → cart items. A product no longer sold is dropped. */
export function buildItemsFromSaved(lines: SavedCartLine[], products: StoreProduct[]): StoreCartItem[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items: StoreCartItem[] = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;
    items.push({
      product,
      quantity: line.quantity,
      unit: line.unit,
      quality: line.quality,
      unitPrice: priceForUnit(product, line.unit, line.quality),
    });
  }
  return items;
}

/**
 * This device's cart joined with the account's cart: every line of both; a
 * line in both keeps the larger quantity and the account's (fresher) product.
 */
export function mergeCartLines(local: StoreCartItem[], saved: StoreCartItem[]): StoreCartItem[] {
  const savedByKey = new Map(saved.map((item) => [keyOf(item), item]));
  const seen = new Set<string>();
  const merged: StoreCartItem[] = [];
  for (const item of local) {
    const key = keyOf(item);
    const twin = savedByKey.get(key);
    seen.add(key);
    merged.push(twin ? { ...twin, quantity: Math.max(item.quantity, twin.quantity) } : item);
  }
  for (const item of saved) {
    if (!seen.has(keyOf(item))) merged.push(item);
  }
  return merged;
}

/** Lines grouped by the city their product is sold in (lines without one go to `fallbackCityId`). */
export function groupLinesByCity(lines: SavedCartLine[], fallbackCityId: string | null): Map<string, SavedCartLine[]> {
  const groups = new Map<string, SavedCartLine[]>();
  for (const line of lines) {
    const cityId = line.cityId || fallbackCityId;
    if (!cityId) continue;
    groups.set(cityId, [...(groups.get(cityId) || []), line]);
  }
  return groups;
}
