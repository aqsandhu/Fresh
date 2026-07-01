// ============================================================================
// SYSTEM (CITY) STOCK — reservation model + append-only movement ledger.
//
// The product's per-quality `stock_quantity{,_b,_c}` is the city's total on-hand
// (master sellable inventory). `reserved_quantity{,_b,_c}` is the soft hold for
// open orders. Available to sell = on_hand − reserved.
//
//   place    → reserve  : reserved += need   (atomic guard available >= need)
//   deliver  → commit    : reserved -= need, on_hand -= need (permanent sale)
//   cancel   → release   : reserved -= need   (only while still reserved)
//
// Every change is written to `stock_movements` so balance == Σ delta. Reserve /
// release / shift are audit-only (delta 0 — they don't change on_hand). Central
// (admin-held) stock is derived elsewhere as on_hand − Σ(ocp_stock).
// ============================================================================

import { PoolClient } from 'pg';
import { qualityStockColumn, stockUnitsNeeded, normalizeQuality } from './unitPricing';

type ReservedCol = 'reserved_quantity' | 'reserved_quantity_b' | 'reserved_quantity_c';

/** Whitelisted reserved-quantity column for a quality (safe to interpolate). */
export function reservedColumn(quality: unknown): ReservedCol {
  const col = qualityStockColumn(quality);
  if (col === 'stock_quantity_b') return 'reserved_quantity_b';
  if (col === 'stock_quantity_c') return 'reserved_quantity_c';
  return 'reserved_quantity';
}

export interface StockMovement {
  productId: string;
  quality: unknown;
  cityId?: string | null;
  delta: number;
  reason: 'purchase' | 'reserve' | 'release' | 'sale' | 'waste' | 'convert_out' | 'convert_in' | 'shift' | 'adjust';
  refOrderId?: string | null;
  refOcpId?: string | null;
  note?: string | null;
  proofUrl?: string | null;
  evidenceQuantity?: number | null;
  approvedBy?: string | null;
  approvedAt?: Date | string | null;
  createdBy?: string | null;
}

/** Append one row to the system stock ledger. */
export async function recordStockMovement(client: PoolClient, m: StockMovement): Promise<void> {
  await client.query(
    `INSERT INTO stock_movements (
       product_id, quality, city_id, delta, reason, ref_order_id, ref_ocp_id,
       note, proof_url, evidence_quantity, approved_by, approved_at, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      m.productId, normalizeQuality(m.quality), m.cityId ?? null, m.delta, m.reason,
      m.refOrderId ?? null, m.refOcpId ?? null, m.note ?? null, m.proofUrl ?? null,
      m.evidenceQuantity ?? null, m.approvedBy ?? null, m.approvedAt ?? null,
      m.createdBy ?? null,
    ]
  );
}

/**
 * Soft-reserve `need` units of (product, quality). Atomic: the guard
 * `(on_hand − reserved) >= need` is evaluated in the UPDATE, so concurrent
 * placements can't oversell. Returns false when there isn't enough available.
 */
export async function reserveProductStock(
  client: PoolClient,
  opts: { productId: string; quality: unknown; need: number; orderId?: string | null; cityId?: string | null; createdBy?: string | null }
): Promise<boolean> {
  const { productId, quality, need } = opts;
  if (need <= 0) return true;
  const stockCol = qualityStockColumn(quality);
  const resCol = reservedColumn(quality);
  const r = await client.query(
    `UPDATE products SET ${resCol} = ${resCol} + $1, updated_at = NOW()
      WHERE id = $2 AND (${stockCol} - ${resCol}) >= $1
      RETURNING id`,
    [need, productId]
  );
  if (r.rowCount === 0) return false;
  await recordStockMovement(client, {
    productId, quality, cityId: opts.cityId, delta: 0, reason: 'reserve',
    refOrderId: opts.orderId, createdBy: opts.createdBy, note: `reserve ${need}`,
  });
  return true;
}

/** Release a previously-held reservation (cancel before delivery). Floors at 0. */
export async function releaseProductReservation(
  client: PoolClient,
  opts: { productId: string; quality: unknown; need: number; orderId?: string | null; cityId?: string | null }
): Promise<void> {
  const { productId, quality, need } = opts;
  if (need <= 0) return;
  const resCol = reservedColumn(quality);
  await client.query(
    `UPDATE products SET ${resCol} = GREATEST(0, ${resCol} - $1), updated_at = NOW() WHERE id = $2`,
    [need, productId]
  );
  await recordStockMovement(client, {
    productId, quality, cityId: opts.cityId, delta: 0, reason: 'release',
    refOrderId: opts.orderId, note: `release ${need}`,
  });
}

/**
 * Commit a sale on delivery: convert the soft reserve to a permanent decrement
 * (reserved -= need, on_hand -= need). Floors at 0 (never negative). For Quality
 * A also recomputes the legacy stock_status flag.
 */
export async function commitProductSale(
  client: PoolClient,
  opts: { productId: string; quality: unknown; need: number; orderId?: string | null; cityId?: string | null }
): Promise<void> {
  const { productId, quality, need } = opts;
  if (need <= 0) return;
  const stockCol = qualityStockColumn(quality);
  const resCol = reservedColumn(quality);
  const statusSet =
    stockCol === 'stock_quantity'
      ? `, stock_status = CASE WHEN GREATEST(0, stock_quantity - $1) <= 0 THEN 'out_of_stock'::product_status ELSE 'active'::product_status END`
      : '';
  await client.query(
    `UPDATE products
        SET ${resCol} = GREATEST(0, ${resCol} - $1),
            ${stockCol} = GREATEST(0, ${stockCol} - $1)${statusSet},
            updated_at = NOW()
      WHERE id = $2`,
    [need, productId]
  );
  await recordStockMovement(client, {
    productId, quality, cityId: opts.cityId, delta: -need, reason: 'sale',
    refOrderId: opts.orderId, note: `sale ${need}`,
  });
}

/**
 * Commit the sale for EVERY line of a delivered order that went through the
 * reservation model. Idempotent + legacy-safe: it first atomically flips
 * orders.stock_reserved TRUE→FALSE and only proceeds if it won the flip, so a
 * second delivery event (or a legacy hard-deduct order) is a no-op.
 */
export async function commitOrderSaleOnDelivery(client: PoolClient, orderId: string): Promise<void> {
  const flip = await client.query(
    `UPDATE orders SET stock_reserved = FALSE WHERE id = $1 AND stock_reserved = TRUE RETURNING id`,
    [orderId]
  );
  if (flip.rowCount === 0) return; // legacy order or already committed
  const items = await client.query(
    `SELECT product_id, quantity, unit, quality FROM order_items WHERE order_id = $1`,
    [orderId]
  );
  for (const it of items.rows) {
    if (!it.product_id) continue;
    const need = stockUnitsNeeded(it.quantity, it.unit);
    await commitProductSale(client, { productId: it.product_id, quality: it.quality, need, orderId });
  }
}
