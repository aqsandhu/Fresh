import { PoolClient } from 'pg';
import { query } from '../config/database';

export const CART_ITEMS_SQL = `
  SELECT 
    ci.id, ci.product_id, ci.quantity, ci.unit_price, ci.total_price,
    ci.special_instructions, ci.unit,
    p.name_en, p.name_ur, p.slug, p.primary_image, p.stock_quantity,
    p.unit_type, p.unit_value, p.stock_status
  FROM cart_items ci
  JOIN products p ON ci.product_id = p.id
  WHERE ci.cart_id = $1
  ORDER BY ci.created_at DESC
`;

export function formatCartResponse(
  cart: Record<string, unknown>,
  items: Record<string, unknown>[]
) {
  return {
    cart: {
      id: cart.id,
      subtotal: parseFloat(String(cart.subtotal)),
      discount_amount: parseFloat(String(cart.discount_amount)),
      delivery_charge: parseFloat(String(cart.delivery_charge)),
      total_amount: parseFloat(String(cart.total_amount)),
      coupon_code: cart.coupon_code,
      coupon_discount: parseFloat(String(cart.coupon_discount)),
      item_count: cart.item_count,
      total_weight_kg: parseFloat(String(cart.total_weight_kg)),
      expires_at: cart.expires_at,
    },
    items: items.map((item) => ({
      ...item,
      unit_price: parseFloat(String(item.unit_price)),
      total_price: parseFloat(String(item.total_price)),
    })),
  };
}

export async function loadCartSnapshotFromClient(client: PoolClient, cartId: string) {
  const cartResult = await client.query('SELECT * FROM carts WHERE id = $1', [cartId]);
  const itemsResult = await client.query(CART_ITEMS_SQL, [cartId]);
  return formatCartResponse(cartResult.rows[0], itemsResult.rows);
}

export async function buildCartResponse(cartId: string, cartRow?: Record<string, unknown>) {
  const cart =
    cartRow ||
    (await query('SELECT * FROM carts WHERE id = $1', [cartId])).rows[0];

  const itemsResult = await query(CART_ITEMS_SQL, [cartId]);
  return formatCartResponse(cart, itemsResult.rows);
}
