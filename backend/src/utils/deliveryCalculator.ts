// ============================================================================
// DELIVERY CHARGE CALCULATOR (Backend — single source of truth)
// ============================================================================
//
// Rule (kept deliberately simple so every surface can mirror it):
//   1. If a free-delivery time slot is selected → FREE (regardless of amount)
//   2. Otherwise — if (vegetables + fruits subtotal) >= free-delivery threshold
//      → FREE
//   3. Otherwise → standard delivery charge
//
// `free-delivery threshold` is configured by admin via site_settings
// (`delivery_free_delivery_threshold`).
//
// NOTE: Categories that count toward free delivery are controlled by admin via
// `categories.qualifies_for_free_delivery` (not hardcoded slugs).

import { PoolClient } from 'pg';
import { query } from '../config/database';
import { DeliveryChargeResult } from '../types';
import logger from './logger';

const ENV_DEFAULT_DELIVERY_CHARGE = parseFloat(process.env.DEFAULT_DELIVERY_CHARGE || '100');
const ENV_FREE_DELIVERY_MIN_AMOUNT = parseFloat(process.env.FREE_DELIVERY_MIN_AMOUNT || '500');

const VEG_FRUIT_SLUGS = [
  'vegetables',
  'fruits',
  'sabzi',
  'fruit',
  'vegetable',
  'fresh-vegetables',
  'fresh-fruits',
];

type DbClient = Pick<PoolClient, 'query'>;

const runQuery = (client: DbClient | undefined, text: string, params?: unknown[]) =>
  client ? client.query(text, params) : query(text, params);

async function getFreshCartSubtotal(cartId: string, client?: DbClient): Promise<number> {
  const result = await runQuery(
    client,
    `SELECT COALESCE(SUM(ci.quantity * p.price), 0) AS fresh_subtotal
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = $1`,
    [cartId]
  );
  return parseFloat(result.rows[0]?.fresh_subtotal || '0');
}

const getDeliverySettings = async (
  client?: DbClient
): Promise<{ baseCharge: number; freeThreshold: number }> => {
  try {
    const result = await runQuery(
      client,
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

/** Sum of cart items in categories that count toward free-delivery threshold. */
async function getVegFruitSubtotal(cartId: string, client?: DbClient): Promise<number> {
  const result = await runQuery(
    client,
    `SELECT COALESCE(SUM(ci.total_price), 0) AS veg_fruit_total
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN categories cat ON p.category_id = cat.id
      WHERE ci.cart_id = $1
        AND (
          cat.qualifies_for_free_delivery = TRUE
          OR LOWER(cat.slug) = ANY($2::text[])
          OR LOWER(cat.name_en) LIKE 'vegetable%'
          OR LOWER(cat.name_en) LIKE 'fruit%'
          OR LOWER(cat.name_en) = 'sabzi'
          OR LOWER(cat.name_en) = 'phal'
        )`,
    [cartId, VEG_FRUIT_SLUGS]
  );
  return parseFloat(result.rows[0]?.veg_fruit_total || '0');
}

export const calculateDeliveryCharge = async (
  cartId: string,
  timeSlotId?: string,
  _orderTime: Date = new Date(),
  client?: PoolClient
): Promise<DeliveryChargeResult> => {
  try {
    const cartExists = await runQuery(
      client,
      `SELECT id FROM carts WHERE id = $1`,
      [cartId]
    );

    if (cartExists.rows.length === 0) {
      return {
        delivery_charge: 0,
        rule_applied: 'EMPTY_CART',
        rule_name: 'Empty Cart',
        explanation: 'Cart is empty, no delivery charge applicable',
      };
    }

    const subtotal = await getFreshCartSubtotal(cartId, client);
    if (subtotal <= 0) {
      return {
        delivery_charge: 0,
        rule_applied: 'EMPTY_CART',
        rule_name: 'Empty Cart',
        explanation: 'Cart is empty, no delivery charge applicable',
      };
    }

    const { baseCharge, freeThreshold } = await getDeliverySettings(client);

    // Rule 1: Free-delivery time slot wins regardless of cart amount.
    if (timeSlotId) {
      const slotResult = await runQuery(
        client,
        'SELECT is_free_delivery_slot, slot_name FROM time_slots WHERE id = $1',
        [timeSlotId]
      );
      const slot = slotResult.rows[0];
      if (slot && slot.is_free_delivery_slot === true) {
        return {
          delivery_charge: 0,
          rule_applied: 'FREE_DELIVERY_SLOT',
          rule_name: 'Free Delivery - Time Slot',
          explanation: `Free delivery for selected time slot: ${slot.slot_name}`,
        };
      }
    }

    // Rule 2: Vegetables + fruits subtotal meets the threshold.
    const vegFruitSubtotal = await getVegFruitSubtotal(cartId, client);
    if (vegFruitSubtotal >= freeThreshold) {
      return {
        delivery_charge: 0,
        rule_applied: 'FREE_VEG_FRUIT_MIN',
        rule_name: 'Free Delivery - Vegetables & Fruits Above Minimum',
        explanation: `Free delivery: Rs. ${vegFruitSubtotal.toFixed(0)} of vegetables/fruits meets the Rs. ${freeThreshold} threshold`,
      };
    }

    // Rule 3: Standard delivery charge.
    const remaining = Math.max(0, freeThreshold - vegFruitSubtotal);
    return {
      delivery_charge: baseCharge,
      rule_applied: 'STANDARD_DELIVERY',
      rule_name: 'Standard Delivery Charge',
      explanation: `Add Rs. ${remaining.toFixed(0)} more in vegetables/fruits for free delivery (or choose a free-delivery time slot).`,
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
  _charge: number,
  ruleCode: string
): string => {
  const explanations: Record<string, string> = {
    FREE_DELIVERY_SLOT: 'Free delivery for selected time slot',
    FREE_VEG_FRUIT_MIN: 'Free delivery — vegetables/fruits subtotal meets the minimum',
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
