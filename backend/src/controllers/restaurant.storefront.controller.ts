// ============================================================================
// RESTAURANT STOREFRONT CONTROLLER (restaurant-authed)
// Catalog browse (quality tiers), delivery settings, and order placement into
// the unified orders pipeline (so riders + accounting stay combined).
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, createdResponse, errorResponse } from '../utils/response';
import { roundMoney } from '../utils/money';
import {
  normalizeProductUnit,
  normalizeQuality,
  resolveQualityUnitPrice,
  stockUnitsNeeded,
} from '../utils/unitPricing';
import { hasRestaurantCatalogColumns } from '../config/productSchema';
import { hasRestaurantOrderColumns } from '../config/orderSchema';
import { emitToAdmins } from '../config/socket';
import logger from '../utils/logger';

/** Resolve the effective delivery config for a restaurant. */
async function getRestaurantDelivery(restaurant: { free_delivery_threshold?: any; delivery_base_charge?: any }) {
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

/** GET /api/restaurant/categories — restaurant categories in the restaurant's city. */
export const getRestaurantCategories = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantCatalogColumns())) return successResponse(res, [], 'Categories');
  const cityId = req.restaurant!.city_id;
  const params: any[] = [];
  let cityClause = '';
  if (cityId) {
    params.push(cityId);
    cityClause = ` AND c.city_id = $${params.length}`;
  }
  const result = await query(
    `SELECT c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url, c.display_order,
            COUNT(p.id) FILTER (WHERE p.is_active = TRUE AND p.is_restaurant = TRUE) AS product_count
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id
      WHERE c.is_active = TRUE AND c.is_restaurant = TRUE${cityClause}
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name_en ASC`,
    params
  );
  return successResponse(res, result.rows, 'Categories');
});

/** GET /api/restaurant/products?category= — restaurant products with quality prices. */
export const getRestaurantProducts = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantCatalogColumns())) return successResponse(res, [], 'Products');
  const cityId = req.restaurant!.city_id;
  const params: any[] = [];
  let sql = `
    SELECT p.id, p.name_ur, p.name_en, p.slug, p.price, p.quality_b_price, p.quality_c_price,
           p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
           p.allow_half_kg, p.allow_quarter_kg,
           p.unit_type, p.unit_value, p.stock_quantity, p.primary_image, p.images,
           p.short_description, p.description_en,
           c.name_en AS category_name, c.slug AS category_slug, p.category_id
      FROM products p
      JOIN categories c ON p.category_id = c.id
     WHERE p.is_active = TRUE AND p.is_restaurant = TRUE`;
  if (cityId) {
    params.push(cityId);
    sql += ` AND p.city_id = $${params.length}`;
  }
  if (typeof req.query.category === 'string' && req.query.category) {
    params.push(req.query.category);
    sql += ` AND p.category_id = $${params.length}`;
  }
  sql += ` ORDER BY p.order_count DESC, p.created_at DESC`;
  const result = await query(sql, params);
  return successResponse(res, result.rows, 'Products');
});

/** GET /api/restaurant/delivery — the restaurant's effective delivery settings. */
export const getRestaurantDeliverySettings = asyncHandler(async (req: Request, res: Response) => {
  const r = await query(
    `SELECT free_delivery_threshold, delivery_base_charge FROM restaurants WHERE id = $1`,
    [req.restaurant!.id]
  );
  const conf = await getRestaurantDelivery(r.rows[0] || {});
  return successResponse(res, { base_charge: conf.baseCharge, free_delivery_threshold: conf.freeThreshold }, 'Delivery settings');
});

/**
 * POST /api/restaurant/orders — place a restaurant order (server-authoritative
 * quality + unit pricing) into the unified orders pipeline.
 */
export const createRestaurantOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantOrderColumns()) || !(await hasRestaurantCatalogColumns())) {
    return errorResponse(res, 'Restaurant ordering is being set up. Please try again shortly.', 503);
  }

  const { items, customer_notes } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse(res, 'Add at least one item.', 400);
  }

  const restRow = await query(
    `SELECT id, business_name, owner_name, phone, address, city, city_id, free_delivery_threshold, delivery_base_charge,
            ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
       FROM restaurants WHERE id = $1 AND deleted_at IS NULL`,
    [req.restaurant!.id]
  );
  const restaurant = restRow.rows[0];
  if (!restaurant) return errorResponse(res, 'Restaurant account not found.', 400);

  const delivery = await getRestaurantDelivery(restaurant);

  let order: any;
  try {
    order = await withTransaction(async (client) => {
      let subtotal = 0;
      const lines: any[] = [];
      for (const item of items) {
        const pr = await client.query(
          `SELECT id, name_en, primary_image, sku, price, quality_b_price, quality_c_price,
                  half_kg_price, quarter_kg_price, half_dozen_price
             FROM products
            WHERE id = $1 AND is_active = TRUE AND is_restaurant = TRUE
              AND ($2::uuid IS NULL OR city_id = $2)
            FOR UPDATE`,
          [item.product_id, restaurant.city_id]
        );
        if (pr.rows.length === 0) {
          throw Object.assign(new Error(`Product not available: ${item.product_id}`), { http: 400 });
        }
        const p = pr.rows[0];
        const unit = normalizeProductUnit(item.unit);
        const quality = normalizeQuality(item.quality);
        const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
        const unitPrice = resolveQualityUnitPrice(p, quality, unit);
        if (unitPrice == null) {
          throw Object.assign(new Error(`Quality ${quality} is not available for ${p.name_en}.`), { http: 400 });
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
          customer_notes ? String(customer_notes).slice(0, 1000) : null,
          restaurant.city_id,
        ]
      );
      const o = orderRes.rows[0];

      for (const l of lines) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, product_image, product_sku, unit_price, quantity, total_price, unit, quality)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [o.id, l.product_id, l.name, l.image, l.sku, l.unitPrice, l.qty, l.lineTotal, l.unit, l.quality]
        );
        const need = stockUnitsNeeded(l.qty, l.unit);
        await client.query(
          `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2`,
          [need, l.product_id]
        );
      }
      return o;
    });
  } catch (err: any) {
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  logger.info('Restaurant order placed', { orderId: order.id, restaurantId: restaurant.id });
  emitToAdmins('order:new', {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalAmount: parseFloat(order.total_amount),
    source: 'restaurant',
    message: `New restaurant order #${order.order_number} from ${restaurant.business_name}`,
  });

  return createdResponse(res, order, 'Order placed');
});

/** GET /api/restaurant/orders — the restaurant's own orders. */
export const getRestaurantOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantOrderColumns())) return successResponse(res, [], 'Orders');
  const result = await query(
    `SELECT o.id, o.order_number, o.status, o.subtotal, o.delivery_charge, o.total_amount,
            o.created_at, o.placed_at,
            COALESCE(json_agg(json_build_object(
              'product_name', oi.product_name, 'quantity', oi.quantity, 'unit', oi.unit,
              'quality', oi.quality, 'unit_price', oi.unit_price, 'total_price', oi.total_price
            )) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.restaurant_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 100`,
    [req.restaurant!.id]
  );
  return successResponse(res, result.rows, 'Orders');
});
