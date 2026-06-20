// ============================================================================
// Shared restaurant (B2B) order placement — used by the restaurant storefront
// and by admin (WhatsApp) restaurant order entry. Server-authoritative quality
// + unit pricing; decrements stock; one transaction.
// ============================================================================

import { query, withTransaction } from '../config/database';
import { roundMoney } from './money';
import { hasUrgentDeliveryColumns } from '../config/orderSchema';
import { hasRestaurantDeliveryColumns } from '../config/restaurantSchema';
import { hasCatalogV2Columns } from '../config/catalogV2Schema';
import { hasTimeSlotBookings } from '../config/timeSlotSchema';
import { reserveProductStock } from './systemStock';
import {
  normalizeProductUnit,
  normalizeQuality,
  resolveRestaurantUnitPrice,
  isQualityOffered,
  qualityStockColumn,
  stockUnitsNeeded,
} from './unitPricing';

// Restaurant fraction + enable columns (migration 37) — pulled into the order
// query so resolveRestaurantUnitPrice honours explicit fractions and the
// per-quality restaurant enable flags gate which tiers a restaurant may order.
const RESTAURANT_V2_COLS =
  ', restaurant_enabled_a, restaurant_enabled_b, restaurant_enabled_c' +
  ', restaurant_half_kg_price_a, restaurant_quarter_kg_price_a, restaurant_half_dozen_price_a' +
  ', restaurant_half_kg_price_b, restaurant_quarter_kg_price_b, restaurant_half_dozen_price_b' +
  ', restaurant_half_kg_price_c, restaurant_quarter_kg_price_c, restaurant_half_dozen_price_c';

export interface RestaurantOrderItemInput {
  product_id: string;
  quantity: number | string;
  unit?: string;
  quality?: string;
}

/** Optional checkout context: time slot / urgent delivery and editable profile. */
export interface PlaceRestaurantOrderOpts {
  customerNotes?: string | null;
  timeSlotId?: string | null;
  requestedDeliveryDate?: string | null;
  isUrgent?: boolean;
  /** Editable restaurant profile — persisted to the master row (shows everywhere). */
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  frontImageUrl?: string | null;
}

/** Effective delivery config for a restaurant (per-restaurant override or global default). */
export async function getRestaurantDelivery(restaurant: {
  free_delivery_threshold?: any;
  delivery_base_charge?: any;
}): Promise<{ baseCharge: number; freeThreshold: number; urgentCharge: number; urgentEta: string; slotCutoffPercent: number }> {
  const s = await query(
    `SELECT key, value FROM site_settings WHERE key IN (
       'restaurant_delivery_base_charge','restaurant_free_delivery_threshold',
       'restaurant_delivery_urgent_charge','restaurant_delivery_urgent_eta',
       'restaurant_slot_cutoff_percent'
     )`
  );
  let baseChargeGlobal = 100;
  let freeThresholdGlobal = 2000;
  let urgentCharge = 0;
  let urgentEta = '';
  let slotCutoffPercent = 60;
  for (const row of s.rows) {
    if (row.key === 'restaurant_delivery_base_charge') baseChargeGlobal = parseFloat(row.value) || baseChargeGlobal;
    if (row.key === 'restaurant_free_delivery_threshold') freeThresholdGlobal = parseFloat(row.value) || freeThresholdGlobal;
    if (row.key === 'restaurant_delivery_urgent_charge') urgentCharge = parseFloat(row.value) || 0;
    if (row.key === 'restaurant_delivery_urgent_eta') urgentEta = String(row.value || '').trim();
    if (row.key === 'restaurant_slot_cutoff_percent') {
      const n = parseFloat(row.value);
      if (Number.isFinite(n)) slotCutoffPercent = Math.min(100, Math.max(0, n));
    }
  }
  const num = (v: any, fb: number) => {
    if (v === null || v === undefined || v === '') return fb;
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  return {
    baseCharge: num(restaurant.delivery_base_charge, baseChargeGlobal),
    freeThreshold: num(restaurant.free_delivery_threshold, freeThresholdGlobal),
    urgentCharge,
    urgentEta,
    slotCutoffPercent,
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
  opts: PlaceRestaurantOrderOpts = {}
): Promise<any> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new RestaurantOrderError('Add at least one item.');
  }
  const customerNotes = opts.customerNotes;

  const deliveryReady = await hasRestaurantDeliveryColumns();
  const frontCol = deliveryReady ? ', front_image_url' : '';
  const restRow = await query(
    `SELECT id, business_name, owner_name, phone, address, city, city_id,
            free_delivery_threshold, delivery_base_charge${frontCol},
            ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
       FROM restaurants WHERE id = $1 AND deleted_at IS NULL AND status = 'approved'`,
    [restaurantId]
  );
  const restaurant = restRow.rows[0];
  if (!restaurant) throw new RestaurantOrderError('Restaurant not available.');

  const delivery = await getRestaurantDelivery(restaurant);
  const urgentReady = await hasUrgentDeliveryColumns();
  const catalogV2Ready = await hasCatalogV2Columns();

  return withTransaction(async (client) => {
    let subtotal = 0;
    const lines: any[] = [];
    for (const item of items) {
      const pr = await client.query(
        // City-bound: a restaurant can only order its own city's catalog. The
        // unified product is shown to restaurants when available_for_restaurants.
        `SELECT id, name_en, primary_image, sku, price, price_b, price_c,
                restaurant_price_a, restaurant_price_b, restaurant_price_c
                ${catalogV2Ready ? RESTAURANT_V2_COLS : ''}
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
      // Per-quality restaurant enable gate (Catalog v2): tier must be enabled for
      // restaurants. When the v2 columns aren't loaded the flags default off here,
      // so we only enforce the gate once they're present (else fall back to price).
      if (catalogV2Ready && !isQualityOffered(p, quality, 'restaurant')) {
        throw new RestaurantOrderError(`Quality ${quality} is not available for ${p.name_en}.`);
      }
      const unitPrice = resolveRestaurantUnitPrice(p, quality, unit);
      if (unitPrice == null) {
        throw new RestaurantOrderError(`Quality ${quality} is not available for ${p.name_en}.`);
      }
      const lineTotal = roundMoney(unitPrice * qty);
      subtotal += lineTotal;
      lines.push({ product_id: p.id, name: p.name_en, image: p.primary_image, sku: p.sku, unit, quality, unitPrice, qty, lineTotal });
    }
    subtotal = roundMoney(subtotal);

    // ── Editable profile (address / location pin / front image) ───────────────
    // Persist edits to the MASTER restaurant row so they become the new default
    // everywhere (storefront, admin, future orders); the order then snapshots the
    // fresh values. Front-image column is gated until migration 35 lands.
    const trimmedAddr =
      opts.address != null && String(opts.address).trim() ? String(opts.address).trim() : null;
    const hasPin = opts.lat != null && opts.lng != null && Number.isFinite(opts.lat) && Number.isFinite(opts.lng);
    const profileSets: string[] = [];
    const profileVals: any[] = [];
    let pIdx = 1;
    if (trimmedAddr) { profileSets.push(`address = $${pIdx++}`); profileVals.push(trimmedAddr); }
    if (hasPin) {
      profileSets.push(`location = ST_SetSRID(ST_MakePoint($${pIdx++}, $${pIdx++}), 4326)::geography`);
      profileVals.push(opts.lng, opts.lat);
    }
    if (deliveryReady && opts.frontImageUrl !== undefined) {
      profileSets.push(`front_image_url = $${pIdx++}`);
      profileVals.push(opts.frontImageUrl || null);
    }
    if (profileSets.length > 0) {
      profileVals.push(restaurant.id);
      await client.query(
        `UPDATE restaurants SET ${profileSets.join(', ')}, updated_at = NOW() WHERE id = $${pIdx}`,
        profileVals
      );
    }
    const effAddress = trimmedAddr ?? restaurant.address;
    const effLat = hasPin ? opts.lat : restaurant.lat;
    const effLng = hasPin ? opts.lng : restaurant.lng;
    const effFront =
      opts.frontImageUrl !== undefined ? (opts.frontImageUrl || null) : (restaurant.front_image_url ?? null);

    // ── Delivery: urgent (flat fee, no slot) | slot (required) | legacy flat ──
    let deliveryCharge: number;
    let effectiveSlotId: string | null = null;
    let slotMaxOrders: number | null = null;
    let urgentEta = '';
    if (opts.isUrgent) {
      if (delivery.urgentCharge <= 0) {
        throw new RestaurantOrderError('Urgent delivery is not available right now.');
      }
      deliveryCharge = roundMoney(delivery.urgentCharge);
      urgentEta = delivery.urgentEta;
    } else if (opts.timeSlotId) {
      const slot = await client.query(
        `SELECT id, is_free_delivery_slot, max_orders FROM time_slots
          WHERE id = $1 AND audience = 'restaurant' AND status = 'available'`,
        [opts.timeSlotId]
      );
      if (slot.rows.length === 0) {
        throw new RestaurantOrderError('Selected time slot is not available. Please pick another.');
      }
      slotMaxOrders = slot.rows[0].max_orders === null ? null : Number(slot.rows[0].max_orders);
      effectiveSlotId = opts.timeSlotId;
      deliveryCharge = slot.rows[0].is_free_delivery_slot === true
        ? 0
        : (subtotal >= delivery.freeThreshold ? 0 : roundMoney(delivery.baseCharge));
    } else {
      // Admin / legacy path (no slot): flat threshold-based charge.
      deliveryCharge = subtotal >= delivery.freeThreshold ? 0 : roundMoney(delivery.baseCharge);
    }
    const totalAmount = roundMoney(subtotal + deliveryCharge);

    const snapshot = JSON.stringify({
      business_name: restaurant.business_name,
      owner_name: restaurant.owner_name,
      phone: restaurant.phone,
      written_address: effAddress || '',
      city: restaurant.city || '',
      location: { latitude: effLat ?? null, longitude: effLng ?? null },
      front_image_url: effFront,
      is_restaurant: true,
    });

    // Urgent ignores the slot/date; otherwise honour the chosen delivery date.
    const reqDate = opts.isUrgent ? null : (opts.requestedDeliveryDate || null);
    const orderRes = await client.query(
      `INSERT INTO orders (
        restaurant_id, delivery_address_snapshot, time_slot_id, requested_delivery_date,
        subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
        payment_method, payment_status, status, source, customer_notes, city_id
      ) VALUES ($1,$2,$3,$4,$5,0,$6,0,$7,'cash_on_delivery','pending','pending','website',$8,$9)
      RETURNING *`,
      [
        restaurant.id, snapshot, effectiveSlotId, reqDate, subtotal, deliveryCharge, totalAmount,
        customerNotes ? String(customerNotes).slice(0, 1000) : null,
        restaurant.city_id,
      ]
    );
    const order = orderRes.rows[0];

    // Stamp urgent flag/eta (gated by migration 28) so admin + rider see it.
    if (opts.isUrgent && urgentReady) {
      await client.query(
        `UPDATE orders SET is_urgent_delivery = TRUE, urgent_delivery_eta = $1 WHERE id = $2`,
        [urgentEta || null, order.id]
      );
      order.is_urgent_delivery = true;
      order.urgent_delivery_eta = urgentEta || null;
    }

    // Atomically claim a per-(slot, date) seat — prevents overbooking under
    // races, and (unlike the old global counter) keeps capacity correct per day.
    if (effectiveSlotId) {
      if (await hasTimeSlotBookings()) {
        const claim = await client.query(
          `INSERT INTO time_slot_bookings (time_slot_id, delivery_date, booked_count)
           VALUES ($1, COALESCE($2::date, CURRENT_DATE), 1)
           ON CONFLICT (time_slot_id, delivery_date)
           DO UPDATE SET booked_count = time_slot_bookings.booked_count + 1, updated_at = NOW()
             WHERE $3::int IS NULL OR time_slot_bookings.booked_count < $3
           RETURNING booked_count`,
          [effectiveSlotId, reqDate, slotMaxOrders]
        );
        if (claim.rowCount === 0) {
          throw new RestaurantOrderError('Selected time slot is fully booked. Please pick another.');
        }
      }
      // Keep the legacy global counter in step for existing displays.
      await client.query(`UPDATE time_slots SET booked_orders = booked_orders + 1 WHERE id = $1`, [effectiveSlotId]);
    }

    for (const l of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, unit, quality)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [order.id, l.product_id, l.name, l.image, l.sku, l.unitPrice, l.qty, l.lineTotal, l.unit, l.quality]
      );
      const need = stockUnitsNeeded(l.qty, l.unit);
      // Catalog v2: SOFT-RESERVE the shared per-quality bucket (same bucket the
      // consumer side draws from); the permanent decrement happens on delivery.
      // Legacy path keeps the immediate hard-deduct. Both atomic, no oversell.
      if (catalogV2Ready) {
        const ok = await reserveProductStock(client, {
          productId: l.product_id, quality: l.quality, need, orderId: order.id, cityId: restaurant.city_id ?? null,
        });
        if (!ok) throw new RestaurantOrderError(`Insufficient stock for ${l.name}.`);
      } else {
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
    }

    if (catalogV2Ready) {
      await client.query('UPDATE orders SET stock_reserved = TRUE WHERE id = $1', [order.id]);
    }

    return { order, restaurant };
  });
}
