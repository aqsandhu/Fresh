// WhatsApp / manual orders placed by the office — moved from orders.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../../utils/caughtError';
import { Request, Response } from 'express';
import { withTransaction } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { errorResponse, createdResponse } from '../../../utils/response';
import { emitOrderEventToAdmins } from '../../../config/socket';
import logger from '../../../utils/logger';
import { resolveCityScope, orderInScope } from '../../../utils/cityScope';
import { getDeliverySettings } from '../../../utils/deliverySettings';
import { reserveProductStock } from '../../../utils/systemStock';
import { roundMoney } from '../../../utils/money';
import { unitNotOfferedMessage } from '../../../utils/unitOffer';
import {
  resolveUnitPrice,
  resolveConsumerUnitPrice,
  normalizeProductUnit,
  normalizeQuality,
  qualityStockColumn,
  consumerQualities,
  stockUnitsNeeded,
  type PricedOrderLine,
} from '../../../utils/unitPricing';
import { normalizePhoneNumber } from '../../../utils/validators';
import { hasQualityCatalogColumns } from '../../../config/productSchema';
import { hasCatalogV2Columns } from '../../../config/catalogV2Schema';
import { ensureTimeSlotBookings } from '../../../config/timeSlotSchema';
import { ensureControlColumns } from '../../../config/controlSchema';
import { validateAndClaimTimeSlot } from '../../../utils/timeSlots';
import { approvalForValue } from '../../../utils/adminApproval';
import { hasUrgentDeliveryColumns } from '../../../config/orderSchema';

export const createWhatsappOrder = asyncHandler(async (req: Request, res: Response) => {
  const {
    items,
    admin_notes,
    user_id,
    address_id,
    urgent_delivery,
    time_slot_id,
    requested_delivery_date,
    whatsapp_number,
    customer_name,
    address_text,
    latitude,
    longitude,
    door_picture_url,
    // Complaint replacement (admin-only): link this new order to the complained
    // original; per-item `override_price` lets the admin send it free or partial.
    replacement_for_order_id,
    complaint_id,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse(res, 'Add at least one item.', 400);
  }
  // The order can be placed for a looked-up customer + saved address, OR by
  // typing the customer's number + a delivery address for an unregistered
  // customer (the account + address are created on the fly). Either way we
  // need an address to deliver to.
  if (!address_id && !(typeof address_text === 'string' && address_text.trim())) {
    return errorResponse(res, 'Select a saved address or enter a delivery address.', 400);
  }

  const scope = await resolveCityScope(req);
  const isUrgent = urgent_delivery === true || urgent_delivery === 'true';

  // Optional manual coordinates (typed lat/long).
  const latNum = latitude === '' || latitude == null ? NaN : Number(latitude);
  const lngNum = longitude === '' || longitude == null ? NaN : Number(longitude);
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const doorPic = typeof door_picture_url === 'string' && door_picture_url.trim() ? door_picture_url.trim() : null;

  await ensureTimeSlotBookings();
  await ensureControlColumns();

  let order;
  try {
    order = await withTransaction(async (client) => {
      // ── Resolve the customer: prefer the looked-up account, else find-or-
      //    create one from the phone so WhatsApp orders for unregistered
      //    customers still become real, trackable orders. ───────────────────
      let resolvedUserId: string | null = null;
      if (user_id) {
        const u = await client.query(
          `SELECT id FROM users WHERE id = $1 AND role = 'customer' AND deleted_at IS NULL`,
          [user_id]
        );
        if (u.rows[0]) resolvedUserId = u.rows[0].id;
      }
      if (!resolvedUserId) {
        let normPhone: string;
        try {
          normPhone = normalizePhoneNumber(String(whatsapp_number || ''));
        } catch {
          throw Object.assign(new Error('A valid WhatsApp/phone number is required.'), { http: 400 });
        }
        const existing = await client.query(
          'SELECT id, role, deleted_at FROM users WHERE phone = $1 LIMIT 1',
          [normPhone]
        );
        if (existing.rows[0]) {
          const ex = existing.rows[0];
          if (ex.role === 'customer' && !ex.deleted_at) {
            resolvedUserId = ex.id;
          } else {
            throw Object.assign(new Error('This number is registered to a non-customer or deleted account.'), { http: 400 });
          }
        } else {
          const name = typeof customer_name === 'string' && customer_name.trim() ? customer_name.trim() : 'WhatsApp Customer';
          const created = await client.query(
            `INSERT INTO users (phone, full_name, role, status, is_phone_verified)
             VALUES ($1, $2, 'customer', 'active', FALSE) RETURNING id`,
            [normPhone, name]
          );
          resolvedUserId = created.rows[0].id;
        }
      }

      // ── Resolve the address: a saved one (IDOR-checked), else create one
      //    from the typed address + coordinates. ────────────────────────────
      let addrRow: any = null;
      if (address_id) {
        const a = await client.query(
          `SELECT a.*, ST_X(a.location::geometry) AS lng, ST_Y(a.location::geometry) AS lat
             FROM addresses a WHERE a.id = $1 AND a.user_id = $2 AND a.deleted_at IS NULL`,
          [address_id, resolvedUserId]
        );
        if (a.rows[0]) addrRow = a.rows[0];
      }
      if (!addrRow) {
        const text = typeof address_text === 'string' ? address_text.trim() : '';
        if (!text) throw Object.assign(new Error('Enter a delivery address.'), { http: 400 });
        const created = hasCoords
          ? await client.query(
              `INSERT INTO addresses (user_id, written_address, location, city, door_picture_url, address_type)
               VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3::float, $4::float), 4326)::geography, $5, $6, 'home')
               RETURNING *, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat`,
              [resolvedUserId, text, lngNum, latNum, scope.cityName || 'Gujrat', doorPic]
            )
          : await client.query(
              `INSERT INTO addresses (user_id, written_address, city, door_picture_url, address_type)
               VALUES ($1, $2, $3, $4, 'home')
               RETURNING *, NULL::float AS lng, NULL::float AS lat`,
              [resolvedUserId, text, scope.cityName || 'Gujrat', doorPic]
            );
        addrRow = created.rows[0];
      }

      // Delivery city: from the address, else the admin's scope.
      let orderCityId: string | null = scope.cityId ?? null;
      if (addrRow.city) {
        const cityRow = await client.query(
          `SELECT id FROM service_cities WHERE LOWER(name) = LOWER($1) AND is_active = TRUE LIMIT 1`,
          [addrRow.city]
        );
        if (cityRow.rows[0]?.id) orderCityId = cityRow.rows[0].id;
      }

      // A custom/discounted price is ONLY allowed on a genuine complaint
      // replacement: the new order must point at a real, in-scope original order
      // AND a complaint that belongs to it. Otherwise a "manual order" could be
      // priced at 0 to walk stock out as a free sale. Validated up front so the
      // pricing loop can refuse override prices on a normal manual order.
      let isReplacement = false;
      if (replacement_for_order_id) {
        if (!(await orderInScope(scope, replacement_for_order_id))) {
          throw Object.assign(new Error('Original order not found.'), { http: 400 });
        }
        if (!complaint_id) {
          throw Object.assign(new Error('A linked complaint is required for a replacement order.'), { http: 400 });
        }
        const comp = await client.query(
          `SELECT id FROM complaints WHERE id = $1 AND order_id = $2`,
          [complaint_id, replacement_for_order_id]
        );
        if (comp.rows.length === 0) {
          throw Object.assign(new Error('The complaint does not match the original order.'), { http: 400 });
        }
        isReplacement = true;
      }
      let discountValueTotal = 0;

      // Price each line by its unit + quality; track the free-delivery subtotal.
      const qualityReady = await hasQualityCatalogColumns();
      const catalogV2Ready = await hasCatalogV2Columns();
      const v2Cols = catalogV2Ready
        ? ', p.consumer_enabled_a, p.consumer_enabled_b, p.consumer_enabled_c, p.half_kg_price_b, p.quarter_kg_price_b, p.half_dozen_price_b, p.half_kg_price_c, p.quarter_kg_price_c, p.half_dozen_price_c'
        : '';
      let subtotal = 0;
      let vegFruitSubtotal = 0;
      const lines: PricedOrderLine[] = [];
      for (const item of items) {
        const pr = await client.query(
          `SELECT p.name_en, p.primary_image, p.sku, p.price, p.half_kg_price, p.quarter_kg_price,
                  p.half_dozen_price, p.city_id, cat.qualifies_for_free_delivery
                  ${qualityReady ? ', p.price_b, p.price_c, p.stock_quantity_b, p.stock_quantity_c' : ''}
                  ${v2Cols}
             FROM products p JOIN categories cat ON p.category_id = cat.id
            WHERE p.id = $1 AND p.is_active = TRUE FOR UPDATE`,
          [item.product_id]
        );
        if (pr.rows.length === 0) {
          throw Object.assign(new Error(`Product not found: ${item.product_id}`), { http: 400 });
        }
        const p = pr.rows[0];
        // Product city must match the order's city — an id alone must never let a
        // foreign-city product onto a city order (catalog is per-city).
        if (orderCityId && p.city_id && p.city_id !== orderCityId) {
          throw Object.assign(new Error(`${p.name_en} is not available in this city.`), { http: 400 });
        }
        const unit = normalizeProductUnit(item.unit);
        const unitProblem = await unitNotOfferedMessage(client, p.id, unit);
        if (unitProblem) throw Object.assign(new Error(unitProblem), { http: 400 });
        const quality = qualityReady ? normalizeQuality(item.quality) : 'A';
        if (qualityReady && !consumerQualities(p).includes(quality)) {
          throw Object.assign(new Error(`Quality ${quality} not available for ${p.name_en}.`), { http: 400 });
        }
        const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
        // The live (normal) price is always the baseline.
        const liveUnit = qualityReady
          ? (resolveConsumerUnitPrice(p, quality, unit) ?? resolveUnitPrice(p, unit))
          : resolveUnitPrice(p, unit);
        // An override (free/partial) price is honoured ONLY on a complaint
        // replacement, and can never exceed the live price. On a normal manual
        // order any override is rejected — no zero-priced stock walkout.
        const override = item.override_price;
        const hasOverride = override !== undefined && override !== null && override !== '' && Number.isFinite(parseFloat(String(override))) && parseFloat(String(override)) >= 0;
        if (hasOverride && !isReplacement) {
          throw Object.assign(new Error('Custom or discounted prices are only allowed on a complaint replacement order.'), { http: 400 });
        }
        let unitPrice = liveUnit;
        if (hasOverride) {
          const ov = roundMoney(parseFloat(String(override)));
          if (ov > liveUnit + 1e-6) {
            throw Object.assign(new Error(`A replacement line price can't exceed the normal price (Rs. ${liveUnit}).`), { http: 400 });
          }
          unitPrice = ov;
        }
        discountValueTotal += roundMoney(Math.max(0, liveUnit - unitPrice) * qty);
        const lineTotal = roundMoney(unitPrice * qty);
        subtotal += lineTotal;
        if (p.qualifies_for_free_delivery === true) vegFruitSubtotal += lineTotal;
        lines.push({ product_id: item.product_id, name: p.name_en, image: p.primary_image, sku: p.sku, unit, quality, unitPrice, qty, lineTotal });
      }
      subtotal = roundMoney(subtotal);

      // A free/discounted replacement above the value threshold needs a SECOND
      // admin to co-sign (anti-fraud) — one admin can't hand out big free stock.
      let discountApproval: { approvedBy: string | null; approvedAt: string | null } = { approvedBy: null, approvedAt: null };
      if (discountValueTotal > 0) {
        discountApproval = await approvalForValue(client, req, discountValueTotal, { label: 'a free/discounted order', kind: 'discount' });
      }

      // Delivery settings.
      // Delivery settings of the order's city (global default otherwise).
      const sset = await getDeliverySettings(orderCityId, client);
      const { baseCharge, freeThreshold, urgentCharge, urgentEta } = sset;

      // Delivery charge — same rules as the website (urgent flat rate; free
      // slot → free; else free only when the eligible subtotal meets the
      // threshold). Urgent ignores slots + the threshold.
      // effectiveSlotId is nulled out if the slot no longer exists, so the
      // orders.time_slot_id FK never fails on a stale id.
      let effectiveSlotId: string | null = isUrgent ? null : (time_slot_id || null);
      let deliveryCharge = 0;
      if (isUrgent) {
        if (urgentCharge <= 0) throw Object.assign(new Error('Urgent delivery is not available right now.'), { http: 400 });
        deliveryCharge = roundMoney(urgentCharge);
      } else if (effectiveSlotId) {
        const slot = await client.query(`SELECT is_free_delivery_slot FROM time_slots WHERE id = $1`, [effectiveSlotId]);
        if (slot.rows.length === 0) {
          effectiveSlotId = null;
          deliveryCharge = vegFruitSubtotal >= freeThreshold ? 0 : baseCharge;
        } else {
          deliveryCharge = slot.rows[0].is_free_delivery_slot === true
            ? 0
            : (vegFruitSubtotal >= freeThreshold ? 0 : baseCharge);
        }
      } else {
        deliveryCharge = vegFruitSubtotal >= freeThreshold ? 0 : baseCharge;
      }

      const totalAmount = roundMoney(subtotal + deliveryCharge);

      const snapshot = JSON.stringify({
        written_address: addrRow.written_address,
        landmark: addrRow.landmark,
        house_number: addrRow.house_number,
        area_name: addrRow.area_name,
        city: addrRow.city,
        province: addrRow.province,
        postal_code: addrRow.postal_code,
        door_picture_url: addrRow.door_picture_url || '',
        location: { latitude: addrRow.lat ?? null, longitude: addrRow.lng ?? null },
      });

      const orderRes = await client.query(
        `INSERT INTO orders (
          user_id, address_id, delivery_address_snapshot, time_slot_id, requested_delivery_date,
          subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
          payment_method, payment_status, status, source, customer_notes, city_id
        ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,0,$8,'cash_on_delivery','pending','pending','whatsapp',$9,$10)
        RETURNING *`,
        [
          resolvedUserId, addrRow.id, snapshot, effectiveSlotId,
          isUrgent ? null : (requested_delivery_date || null),
          subtotal, deliveryCharge, totalAmount, admin_notes || null, orderCityId,
        ]
      );
      const o = orderRes.rows[0];

      if (isUrgent && (await hasUrgentDeliveryColumns())) {
        await client.query(`UPDATE orders SET is_urgent_delivery = TRUE, urgent_delivery_eta = $1 WHERE id = $2`, [urgentEta || null, o.id]);
        o.is_urgent_delivery = true;
        o.urgent_delivery_eta = urgentEta || null;
      }

      // Link the (already-validated) complaint replacement to its original order
      // and stamp who co-approved any discount.
      if (isReplacement && catalogV2Ready) {
        await client.query(
          `UPDATE orders SET replacement_for_order_id = $1, complaint_id = $2,
                  discount_approved_by = $3, discount_approved_at = $4
            WHERE id = $5`,
          [replacement_for_order_id, complaint_id, discountApproval.approvedBy, discountApproval.approvedAt, o.id]
        );
      }

      for (const l of lines) {
        if (qualityReady) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, unit, quality)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [o.id, l.product_id, l.name, l.image, l.sku, l.unitPrice, l.qty, l.lineTotal, l.unit, l.quality]
          );
        } else {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, unit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [o.id, l.product_id, l.name, l.image, l.sku, l.unitPrice, l.qty, l.lineTotal, l.unit]
          );
        }
        // Reserve the SHARED per-quality bucket through the same path checkout
        // uses: an atomic guard (on_hand − reserved ≥ need) prevents oversell,
        // and delivery converts the reserve to a permanent sale (+ OCP deduct).
        const need = stockUnitsNeeded(l.qty, l.unit);
        if (catalogV2Ready) {
          const ok = await reserveProductStock(client, {
            productId: l.product_id, quality: l.quality, need,
            orderId: o.id, cityId: orderCityId, createdBy: req.user?.id ?? null,
          });
          if (!ok) throw Object.assign(new Error(`Not enough stock for ${l.name}.`), { http: 400 });
        } else {
          // Legacy (pre-reservation) fallback: still guard against oversell.
          const stockCol = qualityReady ? qualityStockColumn(l.quality) : 'stock_quantity';
          const statusSet =
            stockCol === 'stock_quantity'
              ? `, stock_status = CASE WHEN ${stockCol} - $1 <= 0 THEN 'out_of_stock'::product_status ELSE 'active'::product_status END`
              : '';
          const dec = await client.query(
            `UPDATE products SET ${stockCol} = ${stockCol} - $1${statusSet}, updated_at = NOW()
              WHERE id = $2 AND ${stockCol} >= $1 RETURNING id`,
            [need, l.product_id]
          );
          if (dec.rowCount === 0) throw Object.assign(new Error(`Not enough stock for ${l.name}.`), { http: 400 });
        }
      }

      // Reservation orders commit their sale (and OCP deduct) on delivery.
      if (catalogV2Ready) {
        await client.query(`UPDATE orders SET stock_reserved = TRUE WHERE id = $1`, [o.id]);
      }

      // Count this manual order against the slot's per-date capacity (trusted:
      // admins aren't blocked by the cutoff/cap but the seat is still counted).
      await validateAndClaimTimeSlot(client, {
        slotId: effectiveSlotId,
        deliveryDate: isUrgent ? null : (requested_delivery_date || null),
        isUrgent,
        trusted: true,
        cityId: o.city_id ?? null, // the order's city's slots only (A30)
      });

      return o;
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  logger.info('WhatsApp order placed as real order', { orderId: order.id, by: req.user?.id });
  emitOrderEventToAdmins(order.id, 'order:new', {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalAmount: parseFloat(order.total_amount),
    isUrgent: order.is_urgent_delivery === true,
    source: 'whatsapp',
    message: `New WhatsApp order #${order.order_number} placed`,
  });

  createdResponse(res, order, 'WhatsApp order placed');
});

/**
 * List customer addresses (admin)
 * GET /api/admin/addresses
 */
