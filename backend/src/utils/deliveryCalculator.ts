// ============================================================================
// SMART DELIVERY CHARGE CALCULATOR
// ============================================================================
//
// Rules:
// 1. Free-delivery time slot → always free
// 2. Chicken-only or meat-only → always paid
// 3. All other orders (including mixed) → free ONLY when BOTH:
//    - vegetables + fruits subtotal ≥ free-delivery threshold
//    - total cart subtotal ≥ free-delivery threshold
// 4. Otherwise → standard delivery charge

import { query } from '../config/database';
import { DeliveryChargeResult } from '../types';
import logger from './logger';

const ENV_DEFAULT_DELIVERY_CHARGE = parseFloat(process.env.DEFAULT_DELIVERY_CHARGE || '100');
const ENV_FREE_DELIVERY_MIN_AMOUNT = parseFloat(process.env.FREE_DELIVERY_MIN_AMOUNT || '500');

const VEG_FRUIT_SLUGS = ['vegetables', 'fruits'];

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

async function getVegFruitSubtotal(cartId: string): Promise<number> {
  const result = await query(
    `SELECT COALESCE(SUM(ci.total_price), 0) AS veg_fruit_total
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN categories cat ON p.category_id = cat.id
      WHERE ci.cart_id = $1
        AND cat.slug = ANY($2::text[])`,
    [cartId, VEG_FRUIT_SLUGS]
  );
  return parseFloat(result.rows[0]?.veg_fruit_total || '0');
}

export const calculateDeliveryCharge = async (
  cartId: string,
  timeSlotId?: string,
  orderTime: Date = new Date()
): Promise<DeliveryChargeResult> => {
  try {
    const cartQuery = `
      SELECT 
        c.subtotal,
        ARRAY_AGG(DISTINCT cat.slug) as category_slugs
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
    const { baseCharge, freeThreshold } = await getDeliverySettings();

    let timeSlot = null;
    if (timeSlotId) {
      const slotResult = await query('SELECT * FROM time_slots WHERE id = $1', [timeSlotId]);
      timeSlot = slotResult.rows[0];
    }

    if (timeSlot && timeSlot.is_free_delivery_slot === true) {
      return {
        delivery_charge: 0,
        rule_applied: 'FREE_DELIVERY_SLOT',
        rule_name: 'Free Delivery - Time Slot',
        explanation: `Free delivery for selected time slot: ${timeSlot.slot_name}`,
      };
    }

    const hasOnlyChicken =
      categorySlugs.length > 0 && categorySlugs.every((slug) => slug === 'chicken');
    if (hasOnlyChicken) {
      return {
        delivery_charge: baseCharge,
        rule_applied: 'PAID_CHICKEN_ONLY',
        rule_name: 'Paid Delivery - Chicken Only Orders',
        explanation: `Chicken-only orders always have a delivery charge of Rs. ${baseCharge}`,
      };
    }

    const hasOnlyMeat =
      categorySlugs.length > 0 && categorySlugs.every((slug) => slug === 'meat');
    if (hasOnlyMeat) {
      return {
        delivery_charge: baseCharge,
        rule_applied: 'PAID_MEAT_ONLY',
        rule_name: 'Paid Delivery - Meat Only Orders',
        explanation: `Meat-only orders always have a delivery charge of Rs. ${baseCharge}`,
      };
    }

    const vegFruitSubtotal = await getVegFruitSubtotal(cartId);
    if (vegFruitSubtotal >= freeThreshold && subtotal >= freeThreshold) {
      return {
        delivery_charge: 0,
        rule_applied: 'FREE_MIXED_VEG_FRUIT',
        rule_name: 'Free Delivery - Mixed Order Qualifies',
        explanation: `Free delivery when vegetables/fruits are at least Rs. ${freeThreshold} and order total is at least Rs. ${freeThreshold}`,
      };
    }

    return {
      delivery_charge: baseCharge,
      rule_applied: 'STANDARD_DELIVERY',
      rule_name: 'Standard Delivery Charge',
      explanation: `Delivery charge of Rs. ${baseCharge} applies — need Rs. ${freeThreshold}+ in vegetables/fruits AND Rs. ${freeThreshold}+ order total for free delivery`,
    };
  } catch (error) {
    logger.error('Error calculating delivery charge:', error);
    return {
      delivery_charge: ENV_DEFAULT_DELIVERY_CHARGE,
      rule_applied: 'STANDARD_DELIVERY',
      rule_name: 'Standard Delivery Charge',
      explanation: `Standard delivery charge of Rs. ${ENV_DEFAULT_DELIVERY_CHARGE} applies`,
    };
  }
};

export const getDeliveryChargeExplanation = (
  charge: number,
  ruleCode: string
): string => {
  const explanations: Record<string, string> = {
    FREE_DELIVERY_SLOT: 'Free delivery for selected time slot',
    FREE_MIXED_VEG_FRUIT: 'Free delivery — vegetables/fruits and order total both qualify',
    PAID_CHICKEN_ONLY: 'Chicken-only orders have a fixed delivery charge',
    PAID_MEAT_ONLY: 'Meat-only orders have a fixed delivery charge',
    STANDARD_DELIVERY: 'Standard delivery charge applies',
    EMPTY_CART: 'No items in cart',
  };

  return explanations[ruleCode] || 'Standard delivery charge applies';
};

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
