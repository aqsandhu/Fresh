// ============================================================================
// ORDER CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import {
  asyncHandler,
  BadRequestError,
  NotFoundError,
  ConflictError,
} from '../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse } from '../utils/response';
import { calculateDeliveryCharge } from '../utils/deliveryCalculator';
import {
  resolveUnitPrice,
  resolveConsumerUnitPrice,
  stockUnitsNeeded,
  qualityStockColumn,
  normalizeQuality,
  FRESH_CART_SUBTOTAL_SQL,
} from '../utils/unitPricing';
import { hasQualityCatalogColumns } from '../config/productSchema';
import { hasCatalogV2Columns } from '../config/catalogV2Schema';
import { reserveProductStock } from '../utils/systemStock';
import { hasRestaurantDeliveryColumns } from '../config/restaurantSchema';
import { roundMoney } from '../utils/money';
import {
  hasCouponsTable,
  couponValidationError,
  computeCouponDiscount,
  isAutoCoupon,
} from '../utils/coupons';
import { hasUserCouponsTable } from '../utils/autoCoupons';
import { restoreOrderInventory } from '../utils/orderStatus';
import { hasOrderCouponColumns, hasUrgentDeliveryColumns } from '../config/orderSchema';
import { emitOrderUpdate, emitToUser, emitToAdmins } from '../config/socket';
import logger from '../utils/logger';
import { normalizePhoneNumber } from '../utils/validators';

/**
 * Get user's orders
 * GET /api/orders
 */
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { page = 1, limit = 10, status, city_id } = req.query;

  let whereSql = `WHERE o.user_id = $1 AND o.deleted_at IS NULL`;
  const params: any[] = [req.user.id];
  let paramIndex = 2;

  if (status) {
    whereSql += ` AND o.status = $${paramIndex++}`;
    params.push(status);
  }

  if (city_id && typeof city_id === 'string') {
    whereSql += ` AND o.city_id = $${paramIndex++}`;
    params.push(city_id);
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) FROM orders o ${whereSql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Until migration 18 is applied the coupon columns don't exist — referencing
  // them would break every order read, so gate on the cached probe.
  const couponCols = (await hasOrderCouponColumns())
    ? 'o.coupon_discount, o.coupon_code,'
    : '';

  // Get orders
  const ordersSql = `
    SELECT
      o.id, o.order_number, o.status, o.source,
      o.subtotal, o.discount_amount, ${couponCols} o.delivery_charge, o.tax_amount, o.total_amount,
      o.payment_method, o.payment_status, o.paid_amount,
      o.placed_at, o.confirmed_at, o.preparing_at, o.ready_at, 
      o.out_for_delivery_at, o.delivered_at, o.cancelled_at,
      o.customer_notes, o.cancellation_reason,
      o.city_id, o.delivery_address_snapshot,
      ts.slot_name, ts.start_time as slot_start, ts.end_time as slot_end,
      o.requested_delivery_date,
      r.id as rider_id, ru.full_name as rider_name, ru.phone as rider_phone
    FROM orders o
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    ${whereSql}
    ORDER BY o.placed_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(ordersSql, params);

  // Batch fetch all order items in ONE query (fix N+1)
  const orderIds = result.rows.map((o) => o.id);
  let ordersWithItems;

  if (orderIds.length === 0) {
    ordersWithItems = [];
  } else {
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(', ');
    const allItemsResult = await query(
      `SELECT
        oi.id, oi.order_id, oi.product_id, oi.product_name, oi.product_image,
        oi.product_sku, oi.unit_price, oi.quantity, oi.total_price,
        oi.weight_kg, oi.status, oi.unit
      FROM order_items oi
      WHERE oi.order_id IN (${placeholders})
      ORDER BY oi.created_at ASC`,
      orderIds
    );

    const itemsByOrderId: Record<string, Record<string, unknown>[]> = {};
    for (const item of allItemsResult.rows) {
      const { order_id, ...itemFields } = item;
      if (!itemsByOrderId[order_id]) {
        itemsByOrderId[order_id] = [];
      }
      itemsByOrderId[order_id].push(itemFields);
    }

    ordersWithItems = result.rows.map((order) => ({
      ...order,
      items: itemsByOrderId[order.id] || [],
    }));
  }

  successResponse(res, {
    orders: ordersWithItems,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  }, 'Orders retrieved successfully');
});

/**
 * Get order by ID
 * GET /api/orders/:id
 */
export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;

  const couponCols = (await hasOrderCouponColumns())
    ? 'o.coupon_discount, o.coupon_code,'
    : '';

  const result = await query(
    `SELECT
      o.id, o.order_number, o.status, o.source,
      o.subtotal, o.discount_amount, ${couponCols} o.delivery_charge, o.tax_amount, o.total_amount,
      o.payment_method, o.payment_status, o.paid_amount,
      o.placed_at, o.confirmed_at, o.preparing_at, o.ready_at, 
      o.out_for_delivery_at, o.delivered_at, o.cancelled_at,
      o.customer_notes, o.cancellation_reason,
      o.delivery_address_snapshot,
      ts.slot_name, ts.start_time as slot_start, ts.end_time as slot_end,
      o.requested_delivery_date,
      r.id as rider_id, ru.full_name as rider_name, ru.phone as rider_phone,
      dcr.rule_name as delivery_rule_applied
    FROM orders o
    LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    LEFT JOIN delivery_charges_config dcr ON o.delivery_charge_rule_id = dcr.id
    WHERE o.id = $1 AND o.user_id = $2 AND o.deleted_at IS NULL`,
    [id, req.user.id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  const order = result.rows[0];

  // Get order items
  const itemsResult = await query(
    `SELECT
      oi.id, oi.product_id, oi.product_name, oi.product_image, oi.product_sku,
      oi.unit_price, oi.quantity, oi.total_price, oi.weight_kg, oi.final_weight_kg, oi.status,
      oi.special_instructions, oi.unit
    FROM order_items oi
    WHERE oi.order_id = $1`,
    [id]
  );

  order.items = itemsResult.rows;

  successResponse(res, order, 'Order retrieved successfully');
});

function buildTrackingPayload(order: Record<string, unknown>) {
  const timeline = [
    { status: 'pending', label: 'Order Placed', time: order.placed_at, completed: true },
    { status: 'confirmed', label: 'Order Confirmed', time: order.confirmed_at, completed: !!order.confirmed_at },
    { status: 'preparing', label: 'Being Prepared', time: order.preparing_at, completed: !!order.preparing_at },
    { status: 'ready_for_pickup', label: 'Ready for Pickup', time: order.ready_at, completed: !!order.ready_at },
    { status: 'out_for_delivery', label: 'Out for Delivery', time: order.out_for_delivery_at, completed: !!order.out_for_delivery_at },
    { status: 'delivered', label: 'Delivered', time: order.delivered_at, completed: !!order.delivered_at },
  ];

  return {
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      delivery_address: order.delivery_address,
    },
    timeline,
    rider: order.rider_id && order.status === 'out_for_delivery' ? {
      id: order.rider_id,
      name: order.rider_name,
      location: order.rider_latitude ? {
        latitude: order.rider_latitude,
        longitude: order.rider_longitude,
        updated_at: order.rider_location_updated_at,
      } : null,
    } : null,
  };
}

/**
 * Track order status (authenticated — owner or staff only)
 * GET /api/orders/track/:id
 */
export const trackOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await query(
    `SELECT 
      o.id, o.order_number, o.status,
      o.placed_at, o.confirmed_at, o.preparing_at, o.ready_at, 
      o.out_for_delivery_at, o.delivered_at, o.cancelled_at,
      o.delivery_address_snapshot->>'written_address' as delivery_address,
      o.user_id,
      r.id as rider_id, ru.full_name as rider_name,
      ST_X(r.current_location::geometry) as rider_longitude,
      ST_Y(r.current_location::geometry) as rider_latitude,
      r.location_updated_at as rider_location_updated_at
    FROM orders o
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  const order = result.rows[0];

  if (req.user) {
    const isOwner = req.user.id === order.user_id;
    const isStaff = ['admin', 'super_admin', 'rider'].includes(req.user.role);
    if (!isOwner && !isStaff) {
      return errorResponse(res, 'You can only track your own orders', 403);
    }
  }

  successResponse(res, buildTrackingPayload(order), 'Order tracking information retrieved');
});

/**
 * Public order tracking with order number + phone verification
 * GET /api/orders/track/public/:orderNumber?phone=03XXXXXXXXX
 */
export const trackOrderPublic = asyncHandler(async (req: Request, res: Response) => {
  const { orderNumber } = req.params;
  const phone = String(req.query.phone || '');

  if (!phone) {
    return errorResponse(res, 'Phone number is required for tracking', 400);
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizePhoneNumber(phone);
  } catch {
    return errorResponse(res, 'Invalid phone number', 400);
  }

  const result = await query(
    `SELECT 
      o.id, o.order_number, o.status,
      o.placed_at, o.confirmed_at, o.preparing_at, o.ready_at, 
      o.out_for_delivery_at, o.delivered_at, o.cancelled_at,
      o.delivery_address_snapshot->>'written_address' as delivery_address,
      o.user_id,
      r.id as rider_id, ru.full_name as rider_name,
      ST_X(r.current_location::geometry) as rider_longitude,
      ST_Y(r.current_location::geometry) as rider_latitude,
      r.location_updated_at as rider_location_updated_at
    FROM orders o
    JOIN users u ON o.user_id = u.id
    LEFT JOIN riders r ON o.rider_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    WHERE o.order_number = $1 AND u.phone = $2 AND o.deleted_at IS NULL`,
    [orderNumber, normalizedPhone]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Order not found');
  }

  successResponse(res, buildTrackingPayload(result.rows[0]), 'Order tracking information retrieved');
});

/**
 * Place new order
 * POST /api/orders
 */
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

  // Urgent (on-demand) delivery: a flat super-admin rate instead of a time
  // slot. It deliberately ignores free-delivery thresholds, free slots and
  // coupons (handled below).
  const isUrgent = urgent_delivery === true || urgent_delivery === 'true';

  const order = await withTransaction(async (client) => {
    // Get cart
    const cartResult = await client.query(
      `SELECT * FROM carts 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
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
      `SELECT a.*, dz.code as zone_code
       FROM addresses a
       LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
       WHERE a.id = $1 AND a.user_id = $2 AND a.deleted_at IS NULL`,
      [address_id, req.user!.id]
    );

    if (addressResult.rows.length === 0) {
      throw new NotFoundError('Address not found');
    }

    const address = addressResult.rows[0];

    // Resolve service city for admin routing (explicit body > address name > cart product).
    let orderCityId: string | null =
      typeof bodyCityId === 'string' && bodyCityId.length > 0 ? bodyCityId : null;

    if (!orderCityId && address.city) {
      const cityRow = await client.query(
        `SELECT id FROM service_cities
         WHERE LOWER(name) = LOWER($1) AND is_active = TRUE
         LIMIT 1`,
        [address.city]
      );
      orderCityId = cityRow.rows[0]?.id || null;
    }

    if (!orderCityId && cartItemsResult.rows.length > 0) {
      const productCity = await client.query(
        'SELECT city_id FROM products WHERE id = $1',
        [cartItemsResult.rows[0].product_id]
      );
      orderCityId = productCity.rows[0]?.city_id || null;
    }

    // Quality tiers (A/B/C) gated until migration 34 lands. Each tier has its own
    // shared stock bucket; consumer + restaurant orders draw from the same bucket.
    const qualityReady = await hasQualityCatalogColumns();
    // Catalog v2 (migration 37): use the reservation model (soft hold at placement,
    // permanent decrement on delivery) instead of the legacy hard-deduct.
    const catalogV2Ready = await hasCatalogV2Columns();

    // Re-fetch current product prices — never trust stale cart_items.unit_price.
    for (const item of cartItemsResult.rows) {
      const priceResult = await client.query(
        `SELECT price, half_kg_price, quarter_kg_price, half_dozen_price,
                stock_status, is_active, name_en
                ${qualityReady ? ', price_b, price_c, stock_quantity_b, stock_quantity_c' : ''}
           FROM products
          WHERE id = $1
          FOR UPDATE`,
        [item.product_id]
      );

      if (priceResult.rows.length === 0) {
        throw new BadRequestError(`Product unavailable: ${item.product_id}`);
      }

      const product = priceResult.rows[0];
      const quality = qualityReady ? normalizeQuality(item.quality) : 'A';
      if (!product.is_active) {
        throw new BadRequestError(`Product unavailable: ${product.name_en}`);
      }
      // out_of_stock is a Quality-A flag; B/C availability is enforced atomically
      // by the decrement guard below.
      if (quality === 'A' && product.stock_status === 'out_of_stock') {
        throw new BadRequestError(`Out of stock: ${product.name_en}`);
      }

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
      const u = await client.query(
        `SELECT key, value FROM site_settings WHERE key IN ('delivery_urgent_charge', 'delivery_urgent_eta')`
      );
      let urgentCharge = 0;
      for (const r of u.rows) {
        if (r.key === 'delivery_urgent_charge') urgentCharge = parseFloat(r.value) || 0;
        if (r.key === 'delivery_urgent_eta') urgentEta = String(r.value || '').trim();
      }
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
        client
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
        throw new BadRequestError(
          `Coupon "${couponCode}" is no longer available. Please remove it and try again.`
        );
      }
      const coupon = couponRes.rows[0];

      // Auto coupons (welcome-back / milestone) require a per-customer GRANT.
      // Lock it so the same grant can't be spent by two concurrent checkouts.
      let grantId: string | null = null;
      if (isAutoCoupon(coupon)) {
        if (!(await hasUserCouponsTable())) {
          throw new BadRequestError(`Coupon "${couponCode}" is not available.`);
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
        throw new BadRequestError(`Coupon "${couponCode}": ${reason}`);
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
        latitude: address.location ? address.location.y : null,
        longitude: address.location ? address.location.x : null,
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

    // Create order items and decrement stock
    for (const item of cartItemsResult.rows) {
      const productResult = await client.query(
        `SELECT name_en, primary_image, sku, stock_quantity, stock_status
           FROM products WHERE id = $1 FOR UPDATE`,
        [item.product_id]
      );

      if (productResult.rows.length === 0) {
        throw new NotFoundError(`Product not found: ${item.product_id}`);
      }

      const product = productResult.rows[0];
      const quality = qualityReady ? normalizeQuality(item.quality) : 'A';
      const stockDeduction = stockUnitsNeeded(item.quantity, item.unit);
      const unitPrice = parseFloat(String(item.unit_price));
      const totalPrice = unitPrice * item.quantity;

      if (qualityReady) {
        await client.query(
          `INSERT INTO order_items (
            order_id, product_id, product_name, product_image, product_sku,
            unit_price, quantity, total_price, weight_kg, unit, quality
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            order.id, item.product_id, product.name_en, product.primary_image, product.sku,
            unitPrice, item.quantity, totalPrice, item.weight_kg || null,
            item.unit || 'full', quality,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO order_items (
            order_id, product_id, product_name, product_image, product_sku,
            unit_price, quantity, total_price, weight_kg, unit
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            order.id, item.product_id, product.name_en, product.primary_image, product.sku,
            unitPrice, item.quantity, totalPrice, item.weight_kg || null,
            item.unit || 'full',
          ]
        );
      }

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

    // Mark the order as holding soft reservations so delivery commits the sale
    // and a pre-delivery cancel releases the hold (vs. the legacy hard-deduct).
    if (catalogV2Ready) {
      await client.query('UPDATE orders SET stock_reserved = TRUE WHERE id = $1', [order.id]);
    }

    // Update cart status to converted
    await client.query(
      'UPDATE carts SET status = $1, converted_to_order_id = $2 WHERE id = $3',
      ['converted', order.id, cart.id]
    );

    // Assign house number if not assigned
    if (!address.house_number) {
      await client.query(
        'SELECT assign_house_number($1)',
        [address_id]
      );
    }

    // Atomically claim a time-slot seat — prevents overbooking under
    // concurrent checkouts. If max_orders is NULL the slot has no cap.
    if (time_slot_id) {
      const slotClaim = await client.query(
        `UPDATE time_slots
            SET booked_orders = booked_orders + 1
          WHERE id = $1
            AND (max_orders IS NULL OR booked_orders < max_orders)
          RETURNING id`,
        [time_slot_id]
      );
      if (slotClaim.rowCount === 0) {
        throw new ConflictError(
          'Selected time slot is fully booked. Please pick another slot.'
        );
      }
    }

    return order;
  });

  logger.info('Order created', { userId: req.user.id, orderId: order.id });

  // Emit real-time events
  emitToAdmins('order:new', {
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

/**
 * Cancel order
 * PUT /api/orders/:id/cancel
 */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  // Clients disagree on the key — mobile sends `reason`, the website sends
  // `cancellation_reason`. Accept both so neither silently drops the reason.
  const reason: string | null =
    req.body?.reason ?? req.body?.cancellation_reason ?? null;

  let cancelledOrder: any;

  await withTransaction(async (client) => {
    // Check if order exists and belongs to user. FOR UPDATE so two concurrent
    // cancels can't both pass the status check and restore stock twice.
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE',
      [id, req.user!.id]
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundError('Order not found');
    }

    const order = orderResult.rows[0];

    // Check if order can be cancelled based on status
    if (['delivered', 'cancelled', 'out_for_delivery'].includes(order.status)) {
      throw new ConflictError(`Order cannot be cancelled in ${order.status} status`);
    }

    // Orders can only be cancelled within 30 minutes of placement (or any
    // time while still pending).
    const placedAt = new Date(order.placed_at);
    const now = new Date();
    const minutesSincePlacement = (now.getTime() - placedAt.getTime()) / (1000 * 60);
    const CANCELLATION_WINDOW_MINUTES = 30;

    if (order.status !== 'pending' && minutesSincePlacement > CANCELLATION_WINDOW_MINUTES) {
      throw new BadRequestError(
        `Order can only be cancelled within ${CANCELLATION_WINDOW_MINUTES} minutes of placement`
      );
    }

    // Update order status
    await client.query(
      `UPDATE orders 
       SET status = 'cancelled', 
           cancelled_at = NOW(), 
           cancellation_reason = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [reason, id]
    );

    // Restore time-slot seat + stock (shared with admin/webhook cancel paths).
    await restoreOrderInventory(client, order);

    cancelledOrder = order;
  });

  // Emit real-time cancellation events
  emitOrderUpdate(id, {
    orderId: id,
    status: 'cancelled',
    reason,
    message: `Order #${cancelledOrder.order_number} has been cancelled`,
  });

  emitToAdmins('order:cancelled', {
    orderId: id,
    orderNumber: cancelledOrder.order_number,
    reason,
    message: `Order #${cancelledOrder.order_number} cancelled by customer`,
  });

  successResponse(res, null, 'Order cancelled successfully');
});

/**
 * Get available time slots
 * GET /api/orders/time-slots
 */
export const getTimeSlots = asyncHandler(async (req: Request, res: Response) => {
  const { date } = req.query;

  // Get day of week (0 = Sunday, 6 = Saturday). Reject malformed dates so
  // they don't silently produce NaN and return zero slots.
  let targetDate: Date;
  if (typeof date === 'string' && date.length > 0) {
    targetDate = new Date(date);
    if (Number.isNaN(targetDate.getTime())) {
      return errorResponse(res, 'Invalid date format', 400);
    }
  } else {
    targetDate = new Date();
  }
  const dayOfWeek = targetDate.getDay();

  const audienceClause = (await hasRestaurantDeliveryColumns()) ? `AND audience = 'consumer'` : '';
  const result = await query(
    `SELECT
      id, slot_name, start_time, end_time,
      max_orders, booked_orders,
      (max_orders - booked_orders) as available_slots,
      is_free_delivery_slot, is_express_slot
    FROM time_slots
    WHERE status = 'available'
    ${audienceClause}
    AND (applicable_days IS NULL OR $1 = ANY(applicable_days))
    ORDER BY start_time ASC`,
    [dayOfWeek]
  );

  successResponse(res, result.rows, 'Time slots retrieved successfully');
});
