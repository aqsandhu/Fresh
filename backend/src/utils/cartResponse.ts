import { PoolClient } from 'pg';
import { query } from '../config/database';
import { hasQualityCatalogColumns } from '../config/productSchema';

/**
 * Cart-item SELECT, with quality tiers gated until migration 34 lands. When the
 * columns exist it surfaces the chosen `quality` and the matching per-quality
 * `available_stock` (so the UI can show "Quality B" + its own stock); otherwise
 * it falls back to quality 'A' and the single `stock_quantity`.
 */
async function cartItemsSql(): Promise<string> {
  const qualityReady = await hasQualityCatalogColumns();
  const qualityCol = qualityReady ? 'ci.quality,' : `'A' AS quality,`;
  const availStock = qualityReady
    ? `CASE COALESCE(ci.quality, 'A')
         WHEN 'B' THEN p.stock_quantity_b
         WHEN 'C' THEN p.stock_quantity_c
         ELSE p.stock_quantity
       END AS available_stock`
    : `p.stock_quantity AS available_stock`;
  return `
    SELECT
      ci.id, ci.product_id, ci.quantity, ci.unit_price, ci.total_price,
      ci.special_instructions, ci.unit, ${qualityCol}
      p.name_en, p.name_ur, p.slug, p.primary_image, p.stock_quantity,
      p.unit_type, p.unit_value, p.stock_status, ${availStock}
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = $1
    ORDER BY ci.created_at DESC
  `;
}

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
  const itemsResult = await client.query(await cartItemsSql(), [cartId]);
  return formatCartResponse(cartResult.rows[0], itemsResult.rows);
}

export async function buildCartResponse(cartId: string, cartRow?: Record<string, unknown>) {
  const cart =
    cartRow ||
    (await query('SELECT * FROM carts WHERE id = $1', [cartId])).rows[0];

  const itemsResult = await query(await cartItemsSql(), [cartId]);
  return formatCartResponse(cart, itemsResult.rows);
}
