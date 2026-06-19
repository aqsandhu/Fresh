// ============================================================================
// ORDER STATUS STATE MACHINE + CANCELLATION SIDE-EFFECTS
// ----------------------------------------------------------------------------
// Single source of truth for which order-status transitions are legal and for
// the inventory/time-slot restore that must accompany every cancellation.
//
// Three paths can change an order's status — customer cancel, admin panel,
// and external webhooks. They previously each carried their own copy of this
// logic (or none at all: admin cancels never restored stock, silently
// shrinking inventory). Keep ALL of it here so the paths can't drift again.
// ============================================================================

import { PoolClient } from 'pg';
import { stockUnitsNeeded, qualityStockColumn } from './unitPricing';
import { hasQualityCatalogColumns } from '../config/productSchema';
import { hasCatalogV2Columns } from '../config/catalogV2Schema';
import { releaseProductReservation } from './systemStock';

/**
 * Allowed forward transitions. Anything not in this map is rejected so no
 * caller (webhook OR admin) can jump an order from `pending` to `delivered`
 * or revive a cancelled/refunded one.
 */
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['out_for_delivery', 'cancelled'],
  // Cancellation is no longer allowed once an order is out for delivery — at
  // that point the OCP/rider is en route and stock is about to be consumed.
  out_for_delivery: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function isValidOrderTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Column stamped alongside each status change (null = no timestamp column). */
export const ORDER_STATUS_TIMESTAMPS: Record<string, string> = {
  confirmed: 'confirmed_at',
  preparing: 'preparing_at',
  ready_for_pickup: 'ready_at',
  out_for_delivery: 'out_for_delivery_at',
  delivered: 'delivered_at',
  cancelled: 'cancelled_at',
};

/**
 * Put back what an order consumed when it was created: product stock
 * (fraction-aware — half_kg restores 0.5 units) and its time-slot seat.
 *
 * MUST run inside the same transaction as the status flip to `cancelled`,
 * and only when the previous status was not already `cancelled` (the caller
 * holds the row lock that guarantees that check is race-free).
 */
export async function restoreOrderInventory(
  client: PoolClient,
  order: { id: string; time_slot_id?: string | null; stock_reserved?: boolean }
): Promise<void> {
  if (order.time_slot_id) {
    await client.query(
      'UPDATE time_slots SET booked_orders = GREATEST(0, booked_orders - 1) WHERE id = $1',
      [order.time_slot_id]
    );
  }

  const qualityReady = await hasQualityCatalogColumns();
  const catalogV2Ready = await hasCatalogV2Columns();

  // Catalog v2: a cancel before delivery only RELEASES the soft reservation
  // (on-hand was never decremented at placement). Whether this order is reserved
  // is read freshly + flipped off atomically so a double-cancel can't
  // double-release. Legacy (hard-deduct) orders fall back to the old restore.
  let reserved = false;
  if (catalogV2Ready) {
    const flip = await client.query(
      `UPDATE orders SET stock_reserved = FALSE WHERE id = $1 AND stock_reserved = TRUE RETURNING id`,
      [order.id]
    );
    reserved = (flip.rowCount ?? 0) > 0;
  }

  const items = await client.query(
    `SELECT product_id, quantity, unit${qualityReady ? ', quality' : ''} FROM order_items WHERE order_id = $1`,
    [order.id]
  );

  for (const item of items.rows) {
    // product_id is NULL when the product was permanently deleted — nothing to do.
    if (!item.product_id) continue;
    const amount = stockUnitsNeeded(item.quantity, item.unit);

    if (reserved) {
      await releaseProductReservation(client, {
        productId: item.product_id, quality: item.quality, need: amount, orderId: order.id,
      });
      continue;
    }

    // Legacy restore: add the hard-deducted stock back into the same per-quality
    // bucket the order drew from. stock_status is a Quality-A flag only.
    const stockCol = qualityReady ? qualityStockColumn(item.quality) : 'stock_quantity';
    const statusSet =
      stockCol === 'stock_quantity'
        ? `, stock_status = CASE WHEN stock_quantity + $1 > 0 THEN 'active'::product_status ELSE 'out_of_stock'::product_status END`
        : '';
    await client.query(
      `UPDATE products
          SET ${stockCol} = ${stockCol} + $1${statusSet},
              updated_at = NOW()
        WHERE id = $2`,
      [amount, item.product_id]
    );
  }
}
