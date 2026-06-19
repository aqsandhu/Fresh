// ============================================================================
// CART CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import {
  asyncHandler,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../middleware';
import { successResponse, errorResponse } from '../utils/response';
import { calculateDeliveryCharge, updateCartDeliveryCharge } from '../utils/deliveryCalculator';
import {
  resolveUnitPrice,
  resolveConsumerUnitPrice,
  stockUnitsNeeded,
  qualityStockColumn,
  normalizeQuality,
  consumerQualities,
  FRESH_CART_SUBTOTAL_SQL,
} from '../utils/unitPricing';
import { hasQualityCatalogColumns } from '../config/productSchema';
import { hasCatalogV2Columns } from '../config/catalogV2Schema';
import { loadCartSnapshotFromClient, buildCartResponse } from '../utils/cartResponse';
import { roundMoney } from '../utils/money';
import {
  hasCouponsTable,
  couponValidationError,
  computeCouponDiscount,
  buildCouponSummary,
  isAutoCoupon,
} from '../utils/coupons';
import { hasUserCouponsTable } from '../utils/autoCoupons';

/**
 * Get or create cart for user
 */
/** Per-quality columns appended to product SELECTs once migration 34 lands. */
const QUALITY_PRODUCT_COLS = ', price_b, price_c, stock_quantity_b, stock_quantity_c';
/** Catalog-v2 columns (migration 37): consumer enable flags + explicit B/C fractions. */
const CATALOG_V2_CART_COLS =
  ', consumer_enabled_a, consumer_enabled_b, consumer_enabled_c' +
  ', half_kg_price_b, quarter_kg_price_b, half_dozen_price_b' +
  ', half_kg_price_c, quarter_kg_price_c, half_dozen_price_c';

/** Shared stock available for the chosen quality tier on a product row. */
const qualityStock = (product: Record<string, any>, quality: string): number => {
  const col = qualityStockColumn(quality);
  return parseFloat(String(product[col] ?? 0)) || 0;
};

const getOrCreateCart = async (userId: string) => {
  // Check for existing active cart
  let cartResult = await query(
    `SELECT * FROM carts 
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (cartResult.rows.length === 0) {
    // Create new cart
    cartResult = await query(
      `INSERT INTO carts (user_id, status, expires_at)
       VALUES ($1, 'active', NOW() + INTERVAL '7 days')
       RETURNING *`,
      [userId]
    );
  }

  return cartResult.rows[0];
};

/**
 * Get cart with items
 * GET /api/cart
 */
export const getCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  // SECURITY FIX: Verify user ownership - ensure cart belongs to authenticated user
  const cart = await getOrCreateCart(req.user.id);
  
  // Double-check cart ownership
  if (cart.user_id !== req.user.id) {
    return errorResponse(res, 'Unauthorized access to cart', 403);
  }

  // buildCartResponse is self-gating: it surfaces the chosen quality + matching
  // per-quality stock once migration 34 lands, else falls back to quality 'A'.
  const response = await buildCartResponse(cart.id, cart);
  successResponse(res, response, 'Cart retrieved successfully');
});

/**
 * Add item to cart
 * POST /api/cart/add
 */
export const addToCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { product_id, quantity, special_instructions } = req.body;
  // `unit` selects which fraction of the product the customer is buying:
  // 'full' | 'half_kg' | 'quarter_kg' | 'half_dozen'. Old clients omit it
  // and fall back to 'full'.
  const rawUnit = (req.body?.unit ?? 'full').toString();
  const unit = ['full', 'half_kg', 'quarter_kg', 'half_dozen'].includes(rawUnit)
    ? rawUnit
    : 'full';

  // Quality tier (A/B/C) gated until migration 34 lands; old clients omit it.
  const qualityReady = await hasQualityCatalogColumns();
  const catalogV2Ready = await hasCatalogV2Columns();
  const quality = qualityReady ? normalizeQuality(req.body?.quality) : 'A';

  const transactionResult = await withTransaction(async (client) => {
    // Get or create cart
    let cartResult = await client.query(
      `SELECT * FROM carts 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user!.id]
    );

    if (cartResult.rows.length === 0) {
      cartResult = await client.query(
        `INSERT INTO carts (user_id, status, expires_at)
         VALUES ($1, 'active', NOW() + INTERVAL '7 days')
         RETURNING *`,
        [req.user!.id]
      );
    }

    const cart = cartResult.rows[0];

    // Get product details — including the unit-specific price overrides
    // so the server is the source of truth for prices (never trust the
    // client to send the price).
    const productResult = await client.query(
      `SELECT id, price, half_kg_price, quarter_kg_price, half_dozen_price,
              stock_quantity, stock_status, unit_value, unit_type
              ${qualityReady ? QUALITY_PRODUCT_COLS : ''}
              ${catalogV2Ready ? CATALOG_V2_CART_COLS : ''}
         FROM products
        WHERE id = $1 AND is_active = TRUE`,
      [product_id]
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundError('Product not found or inactive');
    }

    const product = productResult.rows[0];

    // The chosen quality tier must be offered to CONSUMERS (price set + enabled).
    if (qualityReady && !consumerQualities(product).includes(quality)) {
      throw new BadRequestError('Selected quality is not available for this product');
    }

    const unitPrice = qualityReady
      ? (resolveConsumerUnitPrice(product, quality, unit) ?? resolveUnitPrice(product, unit))
      : resolveUnitPrice(product, unit);
    const stockNeeded = stockUnitsNeeded(quantity, unit);
    // Stock is per-quality (shared with restaurant). Quality A also respects the
    // legacy out_of_stock flag; B/C rely purely on their own bucket.
    const availableStock = qualityReady
      ? qualityStock(product, quality)
      : parseFloat(String(product.stock_quantity)) || 0;

    if ((quality === 'A' && product.stock_status === 'out_of_stock') || availableStock < stockNeeded) {
      throw new BadRequestError('Insufficient stock');
    }

    // A cart line is unique per (product, unit, quality).
    const existingItemResult = await client.query(
      `SELECT id, quantity FROM cart_items
        WHERE cart_id = $1 AND product_id = $2 AND COALESCE(unit, 'full') = $3
          ${qualityReady ? `AND COALESCE(quality, 'A') = $4` : ''}`,
      qualityReady ? [cart.id, product_id, unit, quality] : [cart.id, product_id, unit]
    );

    if (existingItemResult.rows.length > 0) {
      // Update existing item
      const existingItem = existingItemResult.rows[0];
      const newQuantity = existingItem.quantity + quantity;
      const totalStockNeeded = stockUnitsNeeded(newQuantity, unit);

      if (availableStock < totalStockNeeded) {
        throw new BadRequestError('Insufficient stock for requested quantity');
      }

      await client.query(
        `UPDATE cart_items
         SET quantity = $1, unit_price = $2, unit = $3, updated_at = NOW()
         WHERE id = $4`,
        [newQuantity, unitPrice, unit, existingItem.id]
      );
    } else if (qualityReady) {
      await client.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, unit, quality, special_instructions)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cart.id, product_id, quantity, unitPrice, unit, quality, special_instructions || null]
      );
    } else {
      await client.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, unit, special_instructions)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cart.id, product_id, quantity, unitPrice, unit, special_instructions || null]
      );
    }

    return loadCartSnapshotFromClient(client, cart.id);
  });

  successResponse(res, transactionResult, 'Item added to cart successfully');
});

/**
 * Atomically replace the server cart with the client's cart.
 * POST /api/cart/sync   Body: { items: [{ product_id, quantity, unit? }] }
 *
 * Replaces the old client-side "DELETE /cart/clear + N × POST /cart/add"
 * loop, which was slow (N+1 round-trips) and non-atomic: a failure mid-loop
 * left a half-synced cart on the server right before order placement.
 * Pricing stays server-resolved — the client only sends product/quantity/unit.
 */
export const syncCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const items = req.body.items as Array<{
    product_id: string;
    quantity: number;
    unit?: string;
    quality?: string;
  }>;

  const qualityReady = await hasQualityCatalogColumns();
  const catalogV2Ready = await hasCatalogV2Columns();

  const transactionResult = await withTransaction(async (client) => {
    let cartResult = await client.query(
      `SELECT * FROM carts
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user!.id]
    );

    if (cartResult.rows.length === 0) {
      cartResult = await client.query(
        `INSERT INTO carts (user_id, status, expires_at)
         VALUES ($1, 'active', NOW() + INTERVAL '7 days')
         RETURNING *`,
        [req.user!.id]
      );
    }

    const cart = cartResult.rows[0];

    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);

    for (const item of items) {
      const unit = ['full', 'half_kg', 'quarter_kg', 'half_dozen'].includes(item.unit || '')
        ? item.unit!
        : 'full';
      const quality = qualityReady ? normalizeQuality(item.quality) : 'A';

      const productResult = await client.query(
        `SELECT id, name_en, price, half_kg_price, quarter_kg_price, half_dozen_price,
                stock_quantity, stock_status
                ${qualityReady ? QUALITY_PRODUCT_COLS : ''}
                ${catalogV2Ready ? CATALOG_V2_CART_COLS : ''}
           FROM products
          WHERE id = $1 AND is_active = TRUE`,
        [item.product_id]
      );

      if (productResult.rows.length === 0) {
        throw new NotFoundError(`Product not found or inactive: ${item.product_id}`);
      }

      const product = productResult.rows[0];

      if (qualityReady && !consumerQualities(product).includes(quality)) {
        throw new BadRequestError(`Selected quality is not available: ${product.name_en}`);
      }

      const stockNeeded = stockUnitsNeeded(item.quantity, unit);
      const availableStock = qualityReady
        ? qualityStock(product, quality)
        : parseFloat(String(product.stock_quantity)) || 0;

      if ((quality === 'A' && product.stock_status === 'out_of_stock') || availableStock < stockNeeded) {
        throw new BadRequestError(`Insufficient stock: ${product.name_en}`);
      }

      const unitPrice = qualityReady
        ? (resolveConsumerUnitPrice(product, quality, unit) ?? resolveUnitPrice(product, unit))
        : resolveUnitPrice(product, unit);

      if (qualityReady) {
        await client.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, unit, quality)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [cart.id, item.product_id, item.quantity, unitPrice, unit, quality]
        );
      } else {
        await client.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, unit)
           VALUES ($1, $2, $3, $4, $5)`,
          [cart.id, item.product_id, item.quantity, unitPrice, unit]
        );
      }
    }

    return loadCartSnapshotFromClient(client, cart.id);
  });

  successResponse(res, transactionResult, 'Cart synced successfully');
});

/**
 * Update cart item quantity
 * PUT /api/cart/update/:itemId
 */
export const updateCartItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { itemId } = req.params;
  const { quantity } = req.body;

  if (quantity < 1) {
    return errorResponse(res, 'Quantity must be at least 1', 400);
  }

  const transactionResult = await withTransaction(async (client) => {
    const itemResult = await client.query(
      `SELECT ci.*, c.user_id 
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       WHERE ci.id = $1`,
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundError('Cart item not found');
    }

    const item = itemResult.rows[0];

    if (item.user_id !== req.user!.id) {
      throw new ForbiddenError('You do not have permission to modify this cart item');
    }

    const qualityReady = await hasQualityCatalogColumns();
    const catalogV2Ready = await hasCatalogV2Columns();
    const quality = qualityReady ? normalizeQuality(item.quality) : 'A';

    const productResult = await client.query(
      `SELECT id, price, half_kg_price, quarter_kg_price, half_dozen_price,
              stock_quantity, stock_status, unit_value, unit_type
              ${qualityReady ? QUALITY_PRODUCT_COLS : ''}
              ${catalogV2Ready ? CATALOG_V2_CART_COLS : ''}
       FROM products WHERE id = $1`,
      [item.product_id]
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundError('Product not found');
    }

    const product = productResult.rows[0];
    const unitPrice = qualityReady
      ? (resolveConsumerUnitPrice(product, quality, item.unit) ?? resolveUnitPrice(product, item.unit))
      : resolveUnitPrice(product, item.unit);
    const stockNeeded = stockUnitsNeeded(quantity, item.unit);
    const availableStock = qualityReady
      ? qualityStock(product, quality)
      : parseFloat(String(product.stock_quantity)) || 0;

    if ((quality === 'A' && product.stock_status === 'out_of_stock') || availableStock < stockNeeded) {
      throw new BadRequestError('Insufficient stock');
    }

    await client.query(
      `UPDATE cart_items 
       SET quantity = $1, unit_price = $2, updated_at = NOW()
       WHERE id = $3`,
      [quantity, unitPrice, itemId]
    );

    return loadCartSnapshotFromClient(client, item.cart_id);
  });

  successResponse(res, transactionResult, 'Cart item updated successfully');
});

/**
 * Remove item from cart
 * DELETE /api/cart/remove/:itemId
 */
export const removeFromCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { itemId } = req.params;

  const transactionResult = await withTransaction(async (client) => {
    const itemResult = await client.query(
      `SELECT ci.*, c.user_id 
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       WHERE ci.id = $1`,
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundError('Cart item not found');
    }

    const item = itemResult.rows[0];

    if (item.user_id !== req.user!.id) {
      throw new ForbiddenError('You do not have permission to modify this cart item');
    }

    await client.query('DELETE FROM cart_items WHERE id = $1', [itemId]);
    return loadCartSnapshotFromClient(client, item.cart_id);
  });

  successResponse(res, transactionResult, 'Item removed from cart successfully');
});

/**
 * Clear cart
 * DELETE /api/cart/clear
 */
export const clearCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const cart = await getOrCreateCart(req.user.id);

  // SECURITY FIX: Verify cart ownership before clearing
  if (cart.user_id !== req.user.id) {
    return errorResponse(res, 'Unauthorized access to cart', 403);
  }

  await query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);

  successResponse(res, null, 'Cart cleared successfully');
});

/**
 * Calculate delivery charge
 * POST /api/cart/delivery-charge
 */
export const calculateCartDeliveryCharge = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { time_slot_id } = req.body;

  // SECURITY FIX: Validate time_slot_id format if provided
  if (time_slot_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(time_slot_id)) {
    return errorResponse(res, 'Invalid time slot ID format', 400);
  }

  const cart = await getOrCreateCart(req.user.id);

  // SECURITY FIX: Verify cart ownership
  if (cart.user_id !== req.user.id) {
    return errorResponse(res, 'Unauthorized access to cart', 403);
  }

  // Check if cart has items
  const itemsCount = await query(
    'SELECT COUNT(*) FROM cart_items WHERE cart_id = $1',
    [cart.id]
  );

  if (parseInt(itemsCount.rows[0].count) === 0) {
    return successResponse(res, {
      delivery_charge: 0,
      rule_applied: 'EMPTY_CART',
      rule_name: 'Empty Cart',
      explanation: 'Cart is empty, no delivery charge applicable',
    }, 'Delivery charge calculated');
  }

  // Calculate delivery charge
  const deliveryResult = await calculateDeliveryCharge(cart.id, time_slot_id);

  // Update cart with delivery charge
  await updateCartDeliveryCharge(cart.id, deliveryResult.delivery_charge);

  successResponse(res, deliveryResult, 'Delivery charge calculated successfully');
});

/**
 * Apply a coupon code to the cart (preview / validation).
 * POST /api/cart/apply-coupon  Body: { code }
 *
 * This is ADVISORY: it validates against the current cart and stores the code
 * on the cart so the customer sees the offer. The authoritative discount and
 * the usage-limit enforcement happen at order placement (order.controller),
 * inside the order transaction with a FOR UPDATE lock on the coupon — so two
 * customers racing for a limited coupon can both "apply" it, but only the
 * winners actually redeem it at checkout.
 */
export const applyCoupon = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);

  // Cap length defensively (codes are <= 50 chars). Parameterised either way,
  // but this avoids pointless work on an oversized lookup value.
  const code = String(req.body?.code ?? '').trim().toUpperCase().slice(0, 64);
  if (!code) return errorResponse(res, 'Enter a coupon code', 400);

  if (!(await hasCouponsTable())) {
    return errorResponse(res, 'Coupons are not available yet. Please try again shortly.', 503);
  }

  const cart = await getOrCreateCart(req.user.id);

  // Server-authoritative subtotal (live product prices, never the client's).
  const subtotalRes = await query(FRESH_CART_SUBTOTAL_SQL, [cart.id]);
  const subtotal = roundMoney(parseFloat(subtotalRes.rows[0]?.fresh_subtotal || '0'));
  if (subtotal <= 0) return errorResponse(res, 'Your cart is empty', 400);

  // Resolve the cart's city from its products (global coupons ignore city).
  const cityRes = await query(
    `SELECT p.city_id FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = $1 AND p.city_id IS NOT NULL
      LIMIT 1`,
    [cart.id]
  );
  const cartCityId = cityRes.rows[0]?.city_id ?? null;

  // City-specific coupon wins over a same-code global coupon.
  const couponRes = await query(
    `SELECT * FROM coupons
      WHERE UPPER(code) = $1 AND (city_id IS NULL OR city_id = $2)
      ORDER BY (city_id IS NOT NULL) DESC
      LIMIT 1`,
    [code, cartCityId]
  );
  if (couponRes.rows.length === 0) {
    return errorResponse(res, 'Invalid coupon code', 404);
  }
  const coupon = couponRes.rows[0];

  // Auto coupons (welcome-back / milestone) can only be applied by a customer
  // who actually holds an available grant for them.
  if (isAutoCoupon(coupon)) {
    if (!(await hasUserCouponsTable())) {
      return errorResponse(res, 'This coupon is not available', 400);
    }
    const grant = await query(
      `SELECT 1 FROM user_coupons
        WHERE user_id = $1 AND coupon_id = $2 AND status = 'available' LIMIT 1`,
      [req.user.id, coupon.id]
    );
    if (grant.rows.length === 0) {
      return errorResponse(res, "This coupon isn't available for your account.", 400);
    }
  }

  const userUsedRes = await query(
    'SELECT COUNT(*)::int AS n FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2',
    [coupon.id, req.user.id]
  );
  const userUsed = userUsedRes.rows[0]?.n ?? 0;

  const priorOrderRes = await query(
    `SELECT 1 FROM orders
      WHERE user_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL
      LIMIT 1`,
    [req.user.id]
  );
  const isFirstOrder = priorOrderRes.rows.length === 0;

  const reason = couponValidationError(coupon, {
    subtotal,
    totalUsed: coupon.used_count,
    userUsed,
    isFirstOrder,
  });
  if (reason) return errorResponse(res, reason, 400);

  await query(
    'UPDATE carts SET coupon_code = $1, updated_at = NOW() WHERE id = $2',
    [coupon.code, cart.id]
  );

  const { productDiscount, freeDelivery } = computeCouponDiscount(coupon, subtotal);

  return successResponse(
    res,
    {
      code: coupon.code,
      description: coupon.description,
      discount_type: coupon.discount_type,
      discount_amount: productDiscount,
      free_delivery: freeDelivery,
      summary: buildCouponSummary(coupon),
    },
    'Coupon applied'
  );
});

/**
 * Remove the applied coupon from the cart.
 * DELETE /api/cart/remove-coupon
 */
export const removeCoupon = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);

  const cart = await getOrCreateCart(req.user.id);
  await query(
    'UPDATE carts SET coupon_code = NULL, coupon_discount = 0, updated_at = NOW() WHERE id = $1',
    [cart.id]
  );
  return successResponse(res, null, 'Coupon removed');
});
