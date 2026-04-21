// ============================================================================
// CART CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../utils/response';
import { calculateDeliveryCharge, updateCartDeliveryCharge } from '../utils/deliveryCalculator';
import logger from '../utils/logger';

/**
 * Get or create cart for user
 */
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

  // Get cart items with product details
  const itemsResult = await query(
    `SELECT 
      ci.id, ci.product_id, ci.quantity, ci.unit_price, ci.total_price,
      ci.special_instructions,
      p.name_en, p.name_ur, p.slug, p.primary_image, p.stock_quantity,
      p.unit_type, p.unit_value, p.stock_status
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = $1
    ORDER BY ci.created_at DESC`,
    [cart.id]
  );

  const response = {
    cart: {
      id: cart.id,
      subtotal: parseFloat(cart.subtotal),
      discount_amount: parseFloat(cart.discount_amount),
      delivery_charge: parseFloat(cart.delivery_charge),
      total_amount: parseFloat(cart.total_amount),
      coupon_code: cart.coupon_code,
      coupon_discount: parseFloat(cart.coupon_discount),
      item_count: cart.item_count,
      total_weight_kg: parseFloat(cart.total_weight_kg),
      expires_at: cart.expires_at,
    },
    items: itemsResult.rows.map(item => ({
      ...item,
      unit_price: parseFloat(item.unit_price),
      total_price: parseFloat(item.total_price),
    })),
  };

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

  await withTransaction(async (client) => {
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

    // Get product details
    const productResult = await client.query(
      `SELECT id, price, stock_quantity, stock_status, unit_value
       FROM products 
       WHERE id = $1 AND is_active = TRUE`,
      [product_id]
    );

    if (productResult.rows.length === 0) {
      throw new Error('Product not found or inactive');
    }

    const product = productResult.rows[0];

    // Check stock
    if (product.stock_status === 'out_of_stock' || product.stock_quantity < quantity) {
      throw new Error('Insufficient stock');
    }

    // Check if item already exists in cart
    const existingItemResult = await client.query(
      `SELECT id, quantity FROM cart_items 
       WHERE cart_id = $1 AND product_id = $2`,
      [cart.id, product_id]
    );

    if (existingItemResult.rows.length > 0) {
      // Update existing item
      const existingItem = existingItemResult.rows[0];
      const newQuantity = existingItem.quantity + quantity;

      // Check stock for new quantity
      if (product.stock_quantity < newQuantity) {
        throw new Error('Insufficient stock for requested quantity');
      }

      await client.query(
        `UPDATE cart_items 
         SET quantity = $1, unit_price = $2, updated_at = NOW()
         WHERE id = $3`,
        [newQuantity, product.price, existingItem.id]
      );
    } else {
      // Add new item
      await client.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, total_price, special_instructions)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cart.id, product_id, quantity, product.price, product.price * quantity, special_instructions]
      );
    }

    // Get updated cart
    const updatedCartResult = await client.query(
      'SELECT * FROM carts WHERE id = $1',
      [cart.id]
    );

    // Get cart items
    const itemsResult = await client.query(
      `SELECT 
        ci.id, ci.product_id, ci.quantity, ci.unit_price, ci.total_price,
        p.name_en, p.name_ur, p.primary_image
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = $1`,
      [cart.id]
    );

    return {
      cart: updatedCartResult.rows[0],
      items: itemsResult.rows,
    };
  });

  // Get fresh cart data
  const cart = await getOrCreateCart(req.user.id);
  const itemsResult = await query(
    `SELECT 
      ci.id, ci.product_id, ci.quantity, ci.unit_price, ci.total_price,
      p.name_en, p.name_ur, p.primary_image
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = $1`,
    [cart.id]
  );

  successResponse(res, {
    cart: {
      id: cart.id,
      subtotal: parseFloat(cart.subtotal),
      delivery_charge: parseFloat(cart.delivery_charge),
      total_amount: parseFloat(cart.total_amount),
      item_count: cart.item_count,
    },
    items: itemsResult.rows,
  }, 'Item added to cart successfully');
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

  await withTransaction(async (client) => {
    // Get cart item
    const itemResult = await client.query(
      `SELECT ci.*, c.user_id 
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       WHERE ci.id = $1`,
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      throw new Error('Cart item not found');
    }

    const item = itemResult.rows[0];

    // Verify ownership
    if (item.user_id !== req.user!.id) {
      throw new Error('Unauthorized');
    }

    // Check product stock
    const productResult = await client.query(
      'SELECT stock_quantity, stock_status FROM products WHERE id = $1',
      [item.product_id]
    );

    if (productResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    const product = productResult.rows[0];

    if (product.stock_status === 'out_of_stock' || product.stock_quantity < quantity) {
      throw new Error('Insufficient stock');
    }

    // Update quantity
    await client.query(
      `UPDATE cart_items 
       SET quantity = $1, updated_at = NOW()
       WHERE id = $2`,
      [quantity, itemId]
    );
  });

  // Return updated cart
  const cart = await getOrCreateCart(req.user.id);
  const itemsResult = await query(
    `SELECT 
      ci.id, ci.product_id, ci.quantity, ci.unit_price, ci.total_price,
      p.name_en, p.name_ur, p.primary_image
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = $1`,
    [cart.id]
  );

  successResponse(res, {
    cart: {
      id: cart.id,
      subtotal: parseFloat(cart.subtotal),
      delivery_charge: parseFloat(cart.delivery_charge),
      total_amount: parseFloat(cart.total_amount),
      item_count: cart.item_count,
    },
    items: itemsResult.rows,
  }, 'Cart item updated successfully');
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

  await withTransaction(async (client) => {
    // Get cart item
    const itemResult = await client.query(
      `SELECT ci.*, c.user_id 
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       WHERE ci.id = $1`,
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      throw new Error('Cart item not found');
    }

    const item = itemResult.rows[0];

    // Verify ownership
    if (item.user_id !== req.user!.id) {
      throw new Error('Unauthorized');
    }

    // Delete item
    await client.query('DELETE FROM cart_items WHERE id = $1', [itemId]);
  });

  // Return updated cart
  const cart = await getOrCreateCart(req.user.id);
  const itemsResult = await query(
    `SELECT 
      ci.id, ci.product_id, ci.quantity, ci.unit_price, ci.total_price,
      p.name_en, p.name_ur, p.primary_image
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = $1`,
    [cart.id]
  );

  successResponse(res, {
    cart: {
      id: cart.id,
      subtotal: parseFloat(cart.subtotal),
      delivery_charge: parseFloat(cart.delivery_charge),
      total_amount: parseFloat(cart.total_amount),
      item_count: cart.item_count,
    },
    items: itemsResult.rows,
  }, 'Item removed from cart successfully');
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
 * Apply coupon code
 * POST /api/cart/apply-coupon
 */
export const applyCoupon = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { coupon_code } = req.body;

  // TODO: Implement coupon validation logic
  // For now, return error
  return errorResponse(res, 'Invalid or expired coupon code', 400);
});

/**
 * Remove coupon code
 * DELETE /api/cart/remove-coupon
 */
export const removeCoupon = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const cart = await getOrCreateCart(req.user.id);

  await query(
    `UPDATE carts 
     SET coupon_code = NULL, coupon_discount = 0, 
         total_amount = subtotal + delivery_charge - discount_amount,
         updated_at = NOW()
     WHERE id = $1`,
    [cart.id]
  );

  successResponse(res, null, 'Coupon removed successfully');
});
