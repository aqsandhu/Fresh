// ============================================================================
// SMART DELIVERY CHARGE CALCULATOR
// ============================================================================

import { query } from '../config/database';
import { DeliveryChargeResult } from '../types';
import logger from './logger';

// Default delivery charge (fallback if site_settings not found)
const ENV_DEFAULT_DELIVERY_CHARGE = parseFloat(process.env.DEFAULT_DELIVERY_CHARGE || '100');
const ENV_FREE_DELIVERY_MIN_AMOUNT = parseFloat(process.env.FREE_DELIVERY_MIN_AMOUNT || '500');



/**
 * Load delivery settings from site_settings table (admin-configured)
 */
const getDeliverySettings = async (): Promise<{ baseCharge: number; freeThreshold: number }> => {
  try {
    const result = await query(
      `SELECT key, value FROM site_settings WHERE key IN ('delivery_base_charge', 'delivery_free_delivery_threshold')`
    );
    let baseCharge = ENV_DEFAULT_DELIVERY_CHARGE;
    let freeThreshold = ENV_FREE_DELIVERY_MIN_AMOUNT;
    for (const row of result.rows) {
      if (row.key === 'delivery_base_charge') baseCharge = parseFloat(row.value) || baseCharge;
      if (row.key === 'delivery_free_delivery_threshold') freeThreshold = parseFloat(row.value) || freeThreshold;
    }
    return { baseCharge, freeThreshold };
  } catch {
    return { baseCharge: ENV_DEFAULT_DELIVERY_CHARGE, freeThreshold: ENV_FREE_DELIVERY_MIN_AMOUNT };
  }
};

/**
 * Calculate delivery charge based on cart contents and time slot
 */
export const calculateDeliveryCharge = async (
  cartId: string,
  timeSlotId?: string,
  orderTime: Date = new Date()
): Promise<DeliveryChargeResult> => {
  try {
    // Get cart information with categories
    const cartQuery = `
      SELECT 
        c.subtotal,
        ARRAY_AGG(DISTINCT p.category_id) as category_ids,
        ARRAY_AGG(DISTINCT cat.slug) as category_slugs,
        ARRAY_AGG(DISTINCT cat.qualifies_for_free_delivery) as free_delivery_flags,
        ARRAY_AGG(DISTINCT cat.minimum_order_for_free_delivery) as min_order_amounts
      FROM carts c
      JOIN cart_items ci ON c.id = ci.cart_id
      JOIN products p ON ci.product_id = p.id
      JOIN categories cat ON p.category_id = cat.id
      WHERE c.id = $1
      GROUP BY c.id, c.subtotal
    `;
    
    const cartResult = await query(cartQuery, [cartId]);
    
    if (cartResult.rows.length === 0) {
      return {
        delivery_charge: 0,
        rule_applied: 'EMPTY_CART',
        rule_name: 'Empty Cart',
        explanation: 'Cart is empty, no delivery charge applicable',
      };
    }
    
    const cart = cartResult.rows[0];
    const subtotal = parseFloat(cart.subtotal);
    const categorySlugs: string[] = cart.category_slugs || [];
    
    // Load admin-configured delivery settings
    const { baseCharge, freeThreshold } = await getDeliverySettings();
    
    // Get time slot information if provided
    let timeSlot = null;
    if (timeSlotId) {
      const slotResult = await query(
        'SELECT * FROM time_slots WHERE id = $1',
        [timeSlotId]
      );
      timeSlot = slotResult.rows[0];
    }
    
    // Check if time slot has free delivery enabled (overrides ALL other rules)
    if (timeSlot && timeSlot.is_free_delivery_slot === true) {
      return {
        delivery_charge: 0,
        rule_applied: 'FREE_DELIVERY_SLOT',
        rule_name: 'Free Delivery - Time Slot',
        explanation: `Free delivery for selected time slot: ${timeSlot.slot_name}`,
      };
    }
    
    // Check for category-based free delivery (vegetables, fruits, dry fruits)
    const hasOnlyQualifyingCategories = categorySlugs.every(slug => 
      ['vegetables', 'fruits', 'dry-fruits'].includes(slug)
    );
    
    if (hasOnlyQualifyingCategories && categorySlugs.length > 0) {
      // Check minimum order amounts for each category
      const categoryResult = await query(
        `SELECT 
          cat.slug,
          cat.minimum_order_for_free_delivery,
          SUM(ci.total_price) as category_total
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        JOIN categories cat ON p.category_id = cat.id
        WHERE ci.cart_id = $1 AND cat.slug IN ('vegetables', 'fruits', 'dry-fruits')
        GROUP BY cat.slug, cat.minimum_order_for_free_delivery`,
        [cartId]
      );
      
      let allCategoriesQualify = true;
      for (const cat of categoryResult.rows) {
        const minAmount = parseFloat(cat.minimum_order_for_free_delivery || '500');
        const catTotal = parseFloat(cat.category_total);
        if (catTotal < minAmount) {
          allCategoriesQualify = false;
          break;
        }
      }
      
      if (allCategoriesQualify) {
        return {
          delivery_charge: 0,
          rule_applied: 'FREE_VEG_FRUIT_MIN',
          rule_name: 'Free Delivery - Vegetables/Fruits/Dry Fruits (Above Minimum)',
          explanation: `Free delivery for vegetable/fruit/dry fruit orders above minimum value`,
        };
      }
    }
    
    // Check for chicken-only orders (always paid delivery)
    const hasOnlyChicken = categorySlugs.length > 0 && categorySlugs.every(slug => slug === 'chicken');
    if (hasOnlyChicken) {
      return {
        delivery_charge: baseCharge,
        rule_applied: 'PAID_CHICKEN_ONLY',
        rule_name: 'Paid Delivery - Chicken Only Orders',
        explanation: `Chicken-only orders always have a delivery charge of Rs. ${baseCharge}`,
      };
    }
    
    // Check for meat-only orders (always paid delivery)
    const hasOnlyMeat = categorySlugs.length > 0 && categorySlugs.every(slug => slug === 'meat');
    if (hasOnlyMeat) {
      return {
        delivery_charge: baseCharge,
        rule_applied: 'PAID_MEAT_ONLY',
        rule_name: 'Paid Delivery - Meat Only Orders',
        explanation: `Meat-only orders always have a delivery charge of Rs. ${baseCharge}`,
      };
    }
    
    // Check for mixed orders with qualifying categories above minimum
    // If cart has vegetables/fruits/dry-fruits (even mixed with chicken/meat),
    // and subtotal meets the threshold, delivery is free
    const hasQualifyingCategories = categorySlugs.some(slug => 
      ['vegetables', 'fruits', 'dry-fruits', 'dairy', 'grocery'].includes(slug)
    );
    
    if (hasQualifyingCategories && subtotal >= freeThreshold) {
      return {
        delivery_charge: 0,
        rule_applied: 'FREE_MIXED_MIN',
        rule_name: 'Free Delivery - Mixed Order Above Minimum',
        explanation: `Free delivery for orders above Rs. ${freeThreshold} containing vegetables/fruits`,
      };
    }
    
    // Default delivery charge
    return {
      delivery_charge: baseCharge,
      rule_applied: 'STANDARD_DELIVERY',
      rule_name: 'Standard Delivery Charge',
      explanation: `Standard delivery charge of Rs. ${baseCharge} applies`,
    };
    
  } catch (error) {
    logger.error('Error calculating delivery charge:', error);
    // Return default charge on error
    return {
      delivery_charge: ENV_DEFAULT_DELIVERY_CHARGE,
      rule_applied: 'STANDARD_DELIVERY',
      rule_name: 'Standard Delivery Charge',
      explanation: `Standard delivery charge of Rs. ${ENV_DEFAULT_DELIVERY_CHARGE} applies`,
    };
  }
};

/**
 * Get delivery charge explanation
 */
export const getDeliveryChargeExplanation = (
  charge: number,
  ruleCode: string
): string => {
  const explanations: Record<string, string> = {
    'FREE_DELIVERY_SLOT': 'Free delivery for selected time slot',
    'FREE_VEG_FRUIT_MIN': 'Free delivery for vegetable/fruit orders above minimum value',
    'FREE_MIXED_MIN': 'Free delivery for orders above minimum value',
    'PAID_CHICKEN_ONLY': 'Chicken-only orders have a fixed delivery charge',
    'PAID_MEAT_ONLY': 'Meat-only orders have a fixed delivery charge',
    'STANDARD_DELIVERY': 'Standard delivery charge applies',
    'EMPTY_CART': 'No items in cart',
  };
  
  return explanations[ruleCode] || 'Standard delivery charge applies';
};

/**
 * Update cart with calculated delivery charge
 */
export const updateCartDeliveryCharge = async (
  cartId: string,
  deliveryCharge: number
): Promise<void> => {
  await query(
    `UPDATE carts 
     SET delivery_charge = $1, 
         total_amount = subtotal + $1 - discount_amount - coupon_discount,
         updated_at = NOW()
     WHERE id = $2`,
    [deliveryCharge, cartId]
  );
};

/**
 * Get all active delivery charge rules
 */
export const getDeliveryChargeRules = async () => {
  const result = await query(
    `SELECT * FROM delivery_charges_config 
     WHERE is_active = TRUE 
     AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
     AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
     ORDER BY priority DESC`
  );
  return result.rows;
};
