// ============================================================================
// Shared restaurant (B2B) order placement — used by the restaurant storefront
// and by admin (WhatsApp) restaurant order entry. Server-authoritative quality
// + unit pricing; decrements stock; one transaction.
// ============================================================================

import { query, withTransaction } from '../config/database';
import { roundMoney } from './money';
import {
  normalizeProductUnit,
  normalizeQuality,
  resolveRestaurantUnitPrice,
  qualityStockColumn,
  stockUnitsNeeded,
} from './unitPricing';

export interface RestaurantOrderItemInput {
  product_id: string;
  quantity: number | string;
  unit?: string;
  quality?: string;
}

/** Effective delivery config for a restaurant (per-restaurant override or global default). */
export async function getRestaurantDelivery(restaurant: {
  free_delivery_threshold?: any;
  delivery_base_charge?: any;
}): Promise<{ baseCharge: number; freeThreshold: number }> {
  const s = await query(
    `SELECT key, value FROM site_settings WHERE key IN ('restaurant_delivery_base_charge','restaurant_free_delivery_threshold')`
  );
  let baseChargeGlobal = 100;
  let freeThresholdGlobal = 2000;
  for (const row of s.rows) {
    if (row.key === 'restaurant_delivery_base_charge') baseChargeGlobal = parseFloat(row.value) || baseChargeGlobal;
    if (row.key === 'restaurant_free_delivery_threshold') freeThresholdGlobal = parseFloat(row.value) || freeThresholdGlobal;
  }
  const num = (v: any, fb: number) => {
    if (v === null || v === undefined || v === '') return fb;
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  return {
    baseCharge: num(restaurant.delivery_base_charge, baseChargeGlobal),
    freeThreshold: num(restaurant.free_delivery_threshold, freeThresholdGlobal),
  };
}

class RestaurantOrderError extends Error {
  http = 400;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Place a restaurant order. Returns the created `orders` row. Throws
 * RestaurantOrderError (http=400) on validation failures.
 */
export async function placeRestaurantOrder(
  restaurantId: string,
  items: RestaurantOrderItemInput[],
  customerNotes?: string | null
): Promise<any> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new RestaurantOrderError('Add at least one item.');
  }

  const restRow = await query(
    `SELECT id, business_name, owner_name, phone, address, city, city_id,
            free_delivery_threshold, delivery_base_charge,
            ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
       FROM restaurants WHERE id = $1 AND deleted_at IS NULL AND status = 'approved'`,
    [restaurantId]
  );
  const restaurant = restRow.rows[0];
  if (!restaurant) throw new RestaurantOrderError('Restaurant not available.');

  const delivery = await getRestaurantDelivery(restaurant);

  return withTransaction(async (client) => {
    let subtotal = 0;
    const lines: any[] = [];
    for (const item of items) {
      const pr = await client.query(
        // City-bound: a restaurant can only order its own city's catalog. The
        // unified product is shown to restaurants when available_for_restaurants.
        `SELECT id, name_en, primary_image, sku, price, price_b, price_c,
                restaurant_price_a, restaurant_price_b, restaurant_price_c
           FROM products
          WHERE id = $1 AND is_active = TRUE AND available_for_restaurants = TRUE
            AND city_id = $2
          FOR UPDATE`,
        [item.product_id, restaurant.city_id]
      );
      if (pr.rows.length === 0) {
        throw new RestaurantOrderError(`Product not available: ${item.product_id}`);
      }
      const p = pr.rows[0];
      const unit = normalizeProductUnit(item.unit);
      const quality = normalizeQuality(item.quality);
      const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
      const unitPrice = resolveRestaurantUnitPrice(p, quality, unit);
      if (unitPrice == null) {
        throw new RestaurantOrderError(`Quality ${quality} is not available for ${p.name_en}.`);
      }
      const lineTotal = roundMoney(unitPrice * qty);
      subtotal += lineTotal;
      lines.push({ product_id: p.id, name: p.name_en, image: p.primary_image, sku: p.sku, unit, quality, unitPrice, qty, lineTotal });
    }
    subtotal = roundMoney(subtotal);

    const deliveryCharge = subtotal >= delivery.freeThreshold ? 0 : roundMoney(delivery.baseCharge);
    const totalAmount = roundMoney(subtotal + deliveryCharge);

    const snapshot = JSON.stringify({
      business_name: restaurant.business_name,
      owner_name: restaurant.owner_name,
      phone: restaurant.phone,
      written_address: restaurant.address || '',
      city: restaurant.city || '',
      location: { latitude: restaurant.lat ?? null, longitude: restaurant.lng ?? null },
      is_restaurant: true,
    });

    const orderRes = await client.query(
      `INSERT INTO orders (
        restaurant_id, delivery_address_snapshot,
        subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
        payment_method, payment_status, status, source, customer_notes, city_id
      ) VALUES ($1,$2,$3,0,$4,0,$5,'cash_on_delivery','pending','pending','website',$6,$7)
      RETURNING *`,
      [
        restaurant.id, snapshot, subtotal, deliveryCharge, totalAmount,
        customerNotes ? String(customerNotes).slice(0, 1000) : null,
        restaurant.city_id,
      ]
    );
    const order = orderRes.rows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, unit, quality)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [order.id, l.product_id, l.name, l.image, l.sku, l.unitPrice, l.qty, l.lineTotal, l.unit, l.quality]
      );
      // Decrement the SHARED per-quality stock bucket (same bucket consumer
      // orders draw from). Whitelisted column + `>= need` guard = atomic, no
      // oversell. stock_status is a Quality-A flag, recomputed only for tier A.
      const need = stockUnitsNeeded(l.qty, l.unit);
      const stockCol = qualityStockColumn(l.quality);
      const statusSet =
        stockCol === 'stock_quantity'
          ? `, stock_status = CASE WHEN stock_quantity - $1 <= 0 THEN 'out_of_stock'::product_status ELSE 'active'::product_status END`
          : '';
      const dec = await client.query(
        `UPDATE products
            SET ${stockCol} = ${stockCol} - $1${statusSet}, updated_at = NOW()
          WHERE id = $2 AND ${stockCol} >= $1
          RETURNING id`,
        [need, l.product_id]
      );
      if (dec.rowCount === 0) {
        throw new RestaurantOrderError(`Insufficient stock for ${l.name}.`);
      }
    }

    return { order, restaurant };
  });
}
