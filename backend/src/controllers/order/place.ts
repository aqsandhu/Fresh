// Placing an order (checkout) — moved from order.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { isEnabledPaymentMethod } from '../../config/payments';
import { getDeliverySettings } from '../../utils/deliverySettings';
import { query, withTransaction } from '../../config/database';
import {
  asyncHandler,
  BadRequestError,
  NotFoundError,
  ConflictError,
} from '../../middleware';
import { errorResponse, createdResponse } from '../../utils/response';
import { calculateDeliveryCharge } from '../../utils/deliveryCalculator';
import {
  resolveUnitPrice,
  resolveConsumerUnitPrice,
  stockUnitsNeeded,
  qualityStockColumn,
  normalizeQuality,
  consumerQualities,
  FRESH_CART_SUBTOTAL_SQL,
} from '../../utils/unitPricing';
import { hasQualityCatalogColumns } from '../../config/productSchema';
import { hasCatalogV2Columns } from '../../config/catalogV2Schema';
import { reserveProductStock } from '../../utils/systemStock';
import { roundMoney } from '../../utils/money';
import {
  hasCouponsTable,
  couponValidationError,
  computeCouponDiscount,
  isAutoCoupon,
} from '../../utils/coupons';
import { hasUserCouponsTable } from '../../utils/autoCoupons';
import { ensureTimeSlotBookings } from '../../config/timeSlotSchema';
import { validateAndClaimTimeSlot } from '../../utils/timeSlots';
import { hasOrderCouponColumns, hasUrgentDeliveryColumns } from '../../config/orderSchema';
import { emitToUser, emitOrderEventToAdmins } from '../../config/socket';
import logger from '../../utils/logger';
import { unitNotOfferedMessage } from '../../utils/unitOffer';
import { CATALOG_V2_CONSUMER_COLS, couponNoLongerValid } from './shared';

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const {
    address_id,
    time_slot_id,
    requested_delivery_date,
    payment_method = 'cash_on_delivery',
    customer_notes,
    city_id: bodyCityId,
    urgent_delivery,
  } = req.body;

  // Defence in depth behind the Joi schema: COD is the only live method. A
  // non-COD order would be shown to the rider as already paid (no cash taken)
  // although no gateway ever collected the money.
  if (!isEnabledPaymentMethod(payment_method)) {
    return errorResponse(res, 'Only Cash on Delivery is available right now.', 400);
  }

  // Urgent (on-demand) delivery: a flat super-admin rate instead of a time
  // slot. It deliberately ignores free-delivery thresholds, free slots and
  // coupons (handled below).
  const isUrgent = urgent_delivery === true || urgent_delivery === 'true';

  await ensureTimeSlotBookings();

  const order = await withTransaction(async (client) => {
    // Get cart. FOR UPDATE serialises concurrent checkouts on the same cart so
    // a double-submit can't pass the 'active' check twice and convert the same
    // cart into two orders.
    const cartResult = await client.query(
      `SELECT * FROM carts 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [req.user!.id]
    );

    if (cartResult.rows.length === 0) {
      throw new NotFoundError('Cart not found');
    }

    const cart = cartResult.rows[0];

    // Check if cart has items
    const cartItemsResult = await client.query(
      'SELECT * FROM cart_items WHERE cart_id = $1',
      [cart.id]
    );

    if (cartItemsResult.rows.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    // Lock-ordering: both FOR UPDATE loops below must lock products in a
    // deterministic order, or two concurrent checkouts holding the same
    // products in opposite order can deadlock.
    cartItemsResult.rows.sort((a, b) =>
      String(a.product_id).localeCompare(String(b.product_id))
    );

    // Get address
    const addressResult = await client.query(
      `SELECT a.*, dz.code as zone_code,
              ST_Y(a.location::geometry) as latitude,
              ST_X(a.location::geometry) as longitude
       FROM addresses a
       LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
       WHERE a.id = $1 AND a.user_id = $2 AND a.deleted_at IS NULL`,
      [address_id, req.user!.id]
    );

    if (addressResult.rows.length === 0) {
      throw new NotFoundError('Address not found');
    }

    const address = addressResult.rows[0];

    const orderCityId: string | null =
      typeof bodyCityId === 'string' && bodyCityId.length > 0 ? bodyCityId : null;
    if (!orderCityId) {
      throw new BadRequestError('Please select a service city before placing the order.');
    }

    const selectedCity = await client.query(
      'SELECT id, name FROM service_cities WHERE id = $1 AND is_active = TRUE',
      [orderCityId]
    );
    if (selectedCity.rows.length === 0) {
      throw new BadRequestError('Selected service city is not available.');
    }

    if (address.city) {
      const addressCity = await client.query(
        `SELECT id FROM service_cities
         WHERE LOWER(name) = LOWER($1) AND is_active = TRUE
         LIMIT 1`,
        [address.city]
      );
      if (!addressCity.rows[0]?.id || addressCity.rows[0].id !== orderCityId) {
        throw new BadRequestError('Delivery address is not in the selected service city.');
      }
    }

    // Quality tiers (A/B/C) gated until migration 34 lands. Each tier has its own
    // shared stock bucket; consumer + restaurant orders draw from the same bucket.
    const qualityReady = await hasQualityCatalogColumns();
    // Catalog v2 (migration 37): use the reservation model (soft hold at placement,
    // permanent decrement on delivery) instead of the legacy hard-deduct.
    const catalogV2Ready = await hasCatalogV2Columns();

    // Lock + fetch ALL ordered products in ONE batched query (was an N+1 loop of
    // per-item SELECT ... FOR UPDATE, repeated again later — a major source of
    // connection-hold under concurrent checkouts). ORDER BY id keeps the row-lock
    // order deterministic across concurrent orders, so no deadlocks. The locked
    // rows carry every column both loops below need, so the second loop reuses
    // this map instead of re-querying.
    const orderedProductIds = cartItemsResult.rows.map((r) => r.product_id);
    const lockedProductsResult = await client.query(
      `SELECT id, price, half_kg_price, quarter_kg_price, half_dozen_price,
              stock_status, is_active, name_en, city_id, primary_image, sku, stock_quantity
              ${qualityReady ? ', price_b, price_c, stock_quantity_b, stock_quantity_c' : ''}
              ${catalogV2Ready ? CATALOG_V2_CONSUMER_COLS : ''}
         FROM products
        WHERE id = ANY($1::uuid[])
        ORDER BY id
        FOR UPDATE`,
      [orderedProductIds]
    );
    const lockedProductById = new Map<string, any>();
    for (const row of lockedProductsResult.rows) lockedProductById.set(String(row.id), row);

    // Re-fetch current product prices — never trust stale cart_items.unit_price.
    for (const item of cartItemsResult.rows) {
      const product = lockedProductById.get(String(item.product_id));
      if (!product) {
        throw new BadRequestError(`Product unavailable: ${item.product_id}`);
      }

      const quality = qualityReady ? normalizeQuality(item.quality) : 'A';
      if (!product.is_active) {
        throw new BadRequestError(`Product unavailable: ${product.name_en}`);
      }
      if (product.city_id !== orderCityId) {
        throw new BadRequestError(`Product is not available in the selected city: ${product.name_en}`);
      }
      if (qualityReady && !consumerQualities(product).includes(quality)) {
        throw new BadRequestError(`Selected quality is not available: ${product.name_en}`);
      }
      // out_of_stock is a Quality-A flag; B/C availability is enforced atomically
      // by the decrement guard below.
      if (quality === 'A' && product.stock_status === 'out_of_stock') {
        throw new BadRequestError(`Out of stock: ${product.name_en}`);
      }

      // A line saved before the admin switched a size off must not be sold.
      const unitProblem = await unitNotOfferedMessage(client, item.product_id, item.unit);
      if (unitProblem) throw new BadRequestError(`${unitProblem} Remove it from the cart and add it again.`);

      const freshUnitPrice = qualityReady
        ? (resolveConsumerUnitPrice(product, quality, item.unit) ?? resolveUnitPrice(product, item.unit))
        : resolveUnitPrice(product, item.unit);
      await client.query(
        `UPDATE cart_items
            SET unit_price = $1, updated_at = NOW()
          WHERE id = $2`,
        [freshUnitPrice, item.id]
      );

      item.unit_price = freshUnitPrice;
      item.total_price = freshUnitPrice * item.quantity;
    }

    const refreshedCartResult = await client.query(
      'SELECT * FROM carts WHERE id = $1',
      [cart.id]
    );
    const refreshedCart = refreshedCartResult.rows[0];

    // Calculate delivery charge. Urgent orders use the flat super-admin rate;
    // otherwise the normal slot/threshold-aware calculation applies.
    let deliveryCharge: number;
    let deliveryChargeRuleId: string | undefined;
    let urgentEta = '';

    if (isUrgent) {
      // Urgent rate of the ORDER's city (global default when the city has none).
      const citySettings = await getDeliverySettings(orderCityId, client);
      const urgentCharge = citySettings.urgentCharge;
      urgentEta = citySettings.urgentEta;
      if (urgentCharge <= 0) {
        throw new BadRequestError('Urgent delivery is not available right now.');
      }
      deliveryCharge = roundMoney(urgentCharge);
      deliveryChargeRuleId = undefined;
    } else {
      const deliveryChargeResult = await calculateDeliveryCharge(
        cart.id,
        time_slot_id,
        new Date(),
        client,
        orderCityId
      );
      deliveryCharge = deliveryChargeResult.delivery_charge;
      const ruleResult = await client.query(
        'SELECT id FROM delivery_charges_config WHERE rule_code = $1',
        [deliveryChargeResult.rule_applied]
      );
      deliveryChargeRuleId = ruleResult.rows[0]?.id;
    }

    // Fresh subtotal from live products table (JOIN), not cached carts.subtotal.
    const freshSubtotalResult = await client.query(FRESH_CART_SUBTOTAL_SQL, [cart.id]);
    const subtotal = roundMoney(
      parseFloat(freshSubtotalResult.rows[0]?.fresh_subtotal || '0')
    );

    // ── Coupon (server-authoritative, locked) ──────────────────────────────
    // The cart stores only the coupon CODE (the customer's intent). The actual
    // discount and EVERY usage-limit check are recomputed here against the
    // fresh subtotal under a FOR UPDATE lock on the coupon row, so a limited
    // coupon can't be over-redeemed by concurrent checkouts and the client can
    // never choose its own discount. There is no client path that sets a cart
    // discount, so the cart-level discount stays 0.
    const discountAmount = 0;
    let effectiveDelivery = deliveryCharge;
    let couponDiscount = 0;
    let appliedCoupon: {
      id: string;
      code: string;
      grantId: string | null;
      isAuto: boolean;
      reusable: boolean;
    } | null = null;

    const couponCode = refreshedCart.coupon_code
      ? String(refreshedCart.coupon_code).trim().toUpperCase()
      : '';

    if (!isUrgent && couponCode && (await hasCouponsTable())) {
      const couponRes = await client.query(
        `SELECT * FROM coupons
          WHERE UPPER(code) = $1 AND (city_id IS NULL OR city_id = $2)
          ORDER BY (city_id IS NOT NULL) DESC
          LIMIT 1
          FOR UPDATE`,
        [couponCode, orderCityId]
      );
      if (couponRes.rows.length === 0) {
        throw couponNoLongerValid(`Coupon "${couponCode}" is no longer available.`);
      }
      const coupon = couponRes.rows[0];

      // Auto coupons (welcome-back / milestone) require a per-customer GRANT.
      // Lock it so the same grant can't be spent by two concurrent checkouts.
      let grantId: string | null = null;
      if (isAutoCoupon(coupon)) {
        if (!(await hasUserCouponsTable())) {
          throw couponNoLongerValid(`Coupon "${couponCode}" is not available.`);
        }
        const grantRes = await client.query(
          `SELECT id FROM user_coupons
            WHERE user_id = $1 AND coupon_id = $2 AND status = 'available'
            FOR UPDATE`,
          [req.user!.id, coupon.id]
        );
        if (grantRes.rows.length === 0) {
          throw new BadRequestError(
            `Coupon "${couponCode}" is not available for your account.`
          );
        }
        grantId = grantRes.rows[0].id;
      }

      const userUsedRes = await client.query(
        'SELECT COUNT(*)::int AS n FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2',
        [coupon.id, req.user!.id]
      );
      const priorOrderRes = await client.query(
        `SELECT 1 FROM orders
          WHERE user_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL
          LIMIT 1`,
        [req.user!.id]
      );

      const reason = couponValidationError(coupon, {
        subtotal,
        totalUsed: coupon.used_count,
        userUsed: userUsedRes.rows[0]?.n ?? 0,
        isFirstOrder: priorOrderRes.rows.length === 0,
      });
      if (reason) {
        throw couponNoLongerValid(`Coupon "${couponCode}": ${reason}`);
      }

      const { productDiscount, freeDelivery } = computeCouponDiscount(coupon, subtotal);
      if (freeDelivery) {
        effectiveDelivery = 0;
      } else {
        couponDiscount = productDiscount;
      }
      appliedCoupon = {
        id: coupon.id,
        code: coupon.code,
        grantId,
        isAuto: isAutoCoupon(coupon),
        reusable: coupon.auto_reusable === true,
      };
    }

    // Round every monetary component to 2dp so the stored row reconciles
    // exactly (subtotal - discount - coupon + delivery = total) without float
    // residue, and so the payment webhook's amount equality check is clean.
    const totalAmount = roundMoney(
      Math.max(0, subtotal + effectiveDelivery - discountAmount - couponDiscount)
    );

    const addressSnapshot = JSON.stringify({
      written_address: address.written_address,
      landmark: address.landmark,
      house_number: address.house_number,
      area_name: address.area_name,
      city: address.city,
      province: address.province,
      postal_code: address.postal_code,
      door_picture_url: address.door_picture_url || '',
      location: {
        latitude: address.latitude ?? null,
        longitude: address.longitude ?? null,
      },
    });

    // Persist the coupon portion of the deduction so the stored row always
    // reconciles: subtotal - discount_amount - coupon_discount + delivery
    // = total_amount. Falls back to the legacy column set until migration 18
    // has been applied (couponDiscount is folded into discount_amount there
    // so the totals still add up — the split is just not recoverable).
    const couponReady = await hasOrderCouponColumns();

    const orderResult = couponReady
      ? await client.query(
          `INSERT INTO orders (
            user_id, address_id, delivery_address_snapshot,
            time_slot_id, requested_delivery_date,
            subtotal, discount_amount, coupon_discount, coupon_code,
            delivery_charge, tax_amount, total_amount,
            delivery_charge_rule_id,
            payment_method, payment_status,
            status, source, customer_notes, city_id
          ) VALUES (
            $1, $2, $3,
            $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13,
            $14, 'pending',
            'pending', 'website', $15, $16
          ) RETURNING *`,
          [
            req.user!.id, address_id, addressSnapshot,
            isUrgent ? null : time_slot_id, isUrgent ? null : requested_delivery_date,
            subtotal, discountAmount, couponDiscount, appliedCoupon?.code ?? null,
            effectiveDelivery, 0, totalAmount,
            deliveryChargeRuleId,
            payment_method, customer_notes,
            orderCityId,
          ]
        )
      : await client.query(
          `INSERT INTO orders (
            user_id, address_id, delivery_address_snapshot,
            time_slot_id, requested_delivery_date,
            subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
            delivery_charge_rule_id,
            payment_method, payment_status,
            status, source, customer_notes, city_id
          ) VALUES (
            $1, $2, $3,
            $4, $5,
            $6, $7, $8, $9, $10,
            $11,
            $12, 'pending',
            'pending', 'website', $13, $14
          ) RETURNING *`,
          [
            req.user!.id, address_id, addressSnapshot,
            isUrgent ? null : time_slot_id, isUrgent ? null : requested_delivery_date,
            subtotal, discountAmount + couponDiscount, effectiveDelivery, 0, totalAmount,
            deliveryChargeRuleId,
            payment_method, customer_notes,
            orderCityId,
          ]
        );

    const order = orderResult.rows[0];

    // Mark the order as urgent (gated until migration 28 is applied).
    if (isUrgent && (await hasUrgentDeliveryColumns())) {
      await client.query(
        `UPDATE orders SET is_urgent_delivery = TRUE, urgent_delivery_eta = $1 WHERE id = $2`,
        [urgentEta || null, order.id]
      );
      order.is_urgent_delivery = true;
      order.urgent_delivery_eta = urgentEta || null;
    }

    // Record the coupon redemption + bump its usage counter (same transaction,
    // same FOR UPDATE lock taken above — serialises concurrent redemptions).
    if (appliedCoupon) {
      await client.query(
        'UPDATE coupons SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1',
        [appliedCoupon.id]
      );
      const recordedDiscount =
        couponDiscount > 0 ? couponDiscount : roundMoney(deliveryCharge - effectiveDelivery);
      await client.query(
        `INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
         VALUES ($1, $2, $3, $4)`,
        [appliedCoupon.id, req.user!.id, order.id, recordedDiscount]
      );

      // Consume a single-use auto-coupon grant (reusable grants stay available).
      if (appliedCoupon.isAuto && appliedCoupon.grantId && !appliedCoupon.reusable) {
        await client.query(
          `UPDATE user_coupons SET status = 'used', used_at = NOW(), order_id = $1 WHERE id = $2`,
          [order.id, appliedCoupon.grantId]
        );
      }
    }

    // Create order items (batched) and decrement stock (per-item, atomic).
    // The per-item product SELECT ... FOR UPDATE here was redundant — every row
    // is already locked + fetched in lockedProductById above — so we reuse it.
    // order_items are collected and inserted in ONE multi-row statement after the
    // loop; the stock reserve/decrement + order_count stay per-item (the atomic
    // oversell guards must run individually).
    const orderItemRows: unknown[][] = [];
    for (const item of cartItemsResult.rows) {
      const product = lockedProductById.get(String(item.product_id));
      if (!product) {
        throw new NotFoundError(`Product not found: ${item.product_id}`);
      }

      const quality = qualityReady ? normalizeQuality(item.quality) : 'A';
      const stockDeduction = stockUnitsNeeded(item.quantity, item.unit);
      const unitPrice = parseFloat(String(item.unit_price));
      const totalPrice = unitPrice * item.quantity;

      orderItemRows.push(
        qualityReady
          ? [
              order.id, item.product_id, product.name_en, product.primary_image, product.sku,
              unitPrice, item.quantity, totalPrice, item.weight_kg || null, item.unit || 'full', quality,
            ]
          : [
              order.id, item.product_id, product.name_en, product.primary_image, product.sku,
              unitPrice, item.quantity, totalPrice, item.weight_kg || null, item.unit || 'full',
            ]
      );

      // Catalog v2: SOFT-RESERVE the shared bucket (reserved += need, atomic guard
      // available >= need). The permanent decrement happens on delivery. Legacy
      // path (pre-migration-37) keeps the immediate hard-deduct.
      if (catalogV2Ready) {
        const ok = await reserveProductStock(client, {
          productId: item.product_id, quality, need: stockDeduction,
          orderId: order.id, cityId: order.city_id ?? orderCityId ?? null, createdBy: req.user?.id ?? null,
        });
        if (!ok) {
          throw new ConflictError(`Insufficient stock for product ${item.product_id}`);
        }
      } else {
        // Decrement the SHARED stock bucket for the chosen quality. The column is a
        // whitelist literal (qualityStockColumn) so it's safe to interpolate. The
        // `>= need` guard makes the decrement atomic — no oversell under races.
        const stockCol = qualityReady ? qualityStockColumn(quality) : 'stock_quantity';
        const statusSet =
          stockCol === 'stock_quantity'
            ? `, stock_status = CASE WHEN stock_quantity - $1 <= 0 THEN 'out_of_stock'::product_status ELSE 'active'::product_status END`
            : '';
        const stockUpdate = await client.query(
          `UPDATE products
              SET ${stockCol} = ${stockCol} - $1${statusSet},
                  updated_at = NOW()
            WHERE id = $2 AND ${stockCol} >= $1
            RETURNING id`,
          [stockDeduction, item.product_id]
        );
        if (stockUpdate.rowCount === 0) {
          throw new ConflictError(`Insufficient stock for product ${item.product_id}`);
        }
      }

      // Update product order count
      await client.query(
        'UPDATE products SET order_count = order_count + $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    // Insert all order items in ONE multi-row statement (was one INSERT/item).
    if (orderItemRows.length > 0) {
      const colCount = qualityReady ? 11 : 10;
      const valuesSql = orderItemRows
        .map(
          (_, r) =>
            `(${Array.from({ length: colCount }, (_, c) => `$${r * colCount + c + 1}`).join(', ')})`
        )
        .join(', ');
      const colNames = qualityReady
        ? 'order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, weight_kg, unit, quality'
        : 'order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, weight_kg, unit';
      await client.query(
        `INSERT INTO order_items (${colNames}) VALUES ${valuesSql}`,
        orderItemRows.flat()
      );
    }

    // The amount charged (subtotal) was read from the cart a moment after the
    // lines above were read. If the cart was changed in between — the same
    // account adding or removing an item from a second device — the customer
    // would be billed for something that is not in the order. Refuse instead;
    // the whole order rolls back and the app shows the cart again.
    const linesTotal = roundMoney(
      cartItemsResult.rows.reduce(
        (sum: number, item: any) => sum + (parseFloat(String(item.unit_price)) || 0) * (Number(item.quantity) || 0),
        0
      )
    );
    if (Math.abs(linesTotal - subtotal) > 0.05) {
      throw new ConflictError('Your cart changed while the order was being placed. Please check your cart and try again.');
    }

    // Mark the order as holding soft reservations so delivery commits the sale
    // and a pre-delivery cancel releases the hold (vs. the legacy hard-deduct).
    if (catalogV2Ready) {
      await client.query('UPDATE orders SET stock_reserved = TRUE WHERE id = $1', [order.id]);
    }

    // Update cart status to converted. The status='active' guard + rowCount
    // check is the atomic anti-double-submit gate: even if the FOR UPDATE lock
    // above were bypassed (e.g. a second active cart row racing), only ONE
    // checkout can flip this cart. Anything else rolls the whole order back.
    const cartConversion = await client.query(
      `UPDATE carts
          SET status = 'converted', converted_to_order_id = $1
        WHERE id = $2 AND status = 'active'`,
      [order.id, cart.id]
    );
    if ((cartConversion.rowCount ?? 0) !== 1) {
      throw new ConflictError('Cart was already converted to another order. Please refresh your cart.');
    }

    // Assign house number if not assigned
    if (!address.house_number) {
      await client.query(
        'SELECT assign_house_number($1)',
        [address_id]
      );
    }

    // Validate the slot (enabled / weekday / not past / not expired) and claim a
    // per-(slot, date) seat atomically — prevents overbooking under concurrent
    // checkouts. A NULL max_orders means the slot has no cap.
    await validateAndClaimTimeSlot(client, {
      slotId: time_slot_id,
      deliveryDate: requested_delivery_date,
      isUrgent,
      cityId: orderCityId,
    });

    // When no explicit delivery date was requested, the claim above booked a
    // seat for *today* (Asia/Karachi). Persist that effective date on the
    // order so a later cancel releases the seat for the SAME day the claim
    // consumed — otherwise a next-day cancel decrements the wrong date and
    // the booked day leaks one seat permanently.
    if (!isUrgent && time_slot_id && !requested_delivery_date) {
      await client.query(
        `UPDATE orders
            SET requested_delivery_date = (NOW() AT TIME ZONE 'Asia/Karachi')::date
          WHERE id = $1 AND requested_delivery_date IS NULL`,
        [order.id]
      );
    }

    return order;
  }).catch(async (err: any) => {
    // The coupon saved on the cart stopped being valid (switched off, expired,
    // used up, order now below its minimum). The order was rolled back; a
    // retry would fail the same way until the customer found and removed the
    // coupon by hand. Take it off the cart here and say so, so the next press
    // of "Place order" goes through at the full price.
    if (err?.couponProblem) {
      await query(
        `UPDATE carts SET coupon_code = NULL, coupon_discount = 0, updated_at = NOW()
          WHERE user_id = $1 AND status = 'active'`,
        [req.user!.id]
      ).catch(() => undefined);
      throw new BadRequestError(
        `${err.message} It has been removed from your cart — please check the total and place the order again.`
      );
    }
    throw err;
  });

  logger.info('Order created', { userId: req.user.id, orderId: order.id });

  // Emit real-time events
  emitOrderEventToAdmins(order.id, 'order:new', {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalAmount: parseFloat(order.total_amount),
    isUrgent,
    urgentEta: isUrgent ? order.urgent_delivery_eta || null : null,
    message: isUrgent
      ? `URGENT order #${order.order_number} placed`
      : `New order #${order.order_number} placed`,
  });

  emitToUser(req.user.id, 'order:created', {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    message: `Your order #${order.order_number} has been placed successfully`,
  });

  createdResponse(res, {
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_amount: parseFloat(order.total_amount),
    },
  }, 'Order placed successfully');
});
