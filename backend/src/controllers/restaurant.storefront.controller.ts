// ============================================================================
// RESTAURANT STOREFRONT CONTROLLER (restaurant-authed)
// Catalog browse (quality tiers), delivery settings, and order placement into
// the unified orders pipeline (so riders + accounting stay combined).
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, createdResponse, errorResponse } from '../utils/response';
import { hasRestaurantCatalogColumns } from '../config/productSchema';
import { hasRestaurantOrderColumns } from '../config/orderSchema';
import { emitToAdmins } from '../config/socket';
import { placeRestaurantOrder, getRestaurantDelivery } from '../utils/restaurantOrders';
import logger from '../utils/logger';

/** GET /api/restaurant/categories — restaurant categories in the restaurant's city. */
export const getRestaurantCategories = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantCatalogColumns())) return successResponse(res, [], 'Categories');
  // City-bound: a restaurant only ever sees its own city's catalog. Filtering on
  // city_id = NULL (no city) returns nothing, which is the correct safe default.
  const cityId = req.restaurant!.city_id;
  const result = await query(
    `SELECT c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url, c.display_order,
            COUNT(p.id) FILTER (WHERE p.is_active = TRUE AND p.is_restaurant = TRUE) AS product_count
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id
      WHERE c.is_active = TRUE AND c.is_restaurant = TRUE AND c.city_id = $1
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name_en ASC`,
    [cityId]
  );
  return successResponse(res, result.rows, 'Categories');
});

/** GET /api/restaurant/products?category= — restaurant products with quality prices. */
export const getRestaurantProducts = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantCatalogColumns())) return successResponse(res, [], 'Products');
  // City-bound: only the restaurant's own city catalog (NULL city → empty).
  const cityId = req.restaurant!.city_id;
  const params: any[] = [cityId];
  let sql = `
    SELECT p.id, p.name_ur, p.name_en, p.slug, p.price, p.quality_b_price, p.quality_c_price,
           p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
           p.allow_half_kg, p.allow_quarter_kg,
           p.unit_type, p.unit_value, p.stock_quantity, p.primary_image, p.images,
           p.short_description, p.description_en,
           c.name_en AS category_name, c.slug AS category_slug, p.category_id
      FROM products p
      JOIN categories c ON p.category_id = c.id
     WHERE p.is_active = TRUE AND p.is_restaurant = TRUE AND p.city_id = $1`;
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

  let order: any;
  let restaurant: any;
  try {
    ({ order, restaurant } = await placeRestaurantOrder(req.restaurant!.id, items, customer_notes));
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
