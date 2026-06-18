// ============================================================================
// OCP stock helpers — receive (admin → OCP) and deduct-on-delivery.
// Balance (ocp_stock) is kept in lock-step with an append-only audit ledger
// (ocp_stock_movements): balance == Σ movements. quantity has a DB CHECK (>= 0).
// ============================================================================

import { PoolClient } from 'pg';
import { stockUnitsNeeded } from './unitPricing';
import { hasOcpTables } from '../config/ocpSchema';

/**
 * Deduct an OCP-fulfilled order's items from the OCP's stock when it is
 * delivered. Idempotent (skips if already deducted for this order). Floors the
 * balance at 0 — physical delivery already happened, so a stock mismatch never
 * blocks it; the ledger records exactly what was deducted. MUST run inside the
 * delivery transaction (the order row is already locked by the caller).
 */
export async function deductOcpStockOnDelivery(client: PoolClient, orderId: string): Promise<void> {
  if (!(await hasOcpTables())) return;

  const ord = await client.query(`SELECT ocp_id FROM orders WHERE id = $1`, [orderId]);
  const ocpId = ord.rows[0]?.ocp_id;
  if (!ocpId) return; // not an OCP order

  // Idempotency: deduct at most once per order.
  const already = await client.query(
    `SELECT 1 FROM ocp_stock_movements WHERE ref_order_id = $1 AND reason = 'order_deduct' LIMIT 1`,
    [orderId]
  );
  if (already.rows.length > 0) return;

  const items = await client.query(
    `SELECT product_id, quantity, unit, COALESCE(quality, 'A') AS quality, final_weight_kg
       FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL`,
    [orderId]
  );

  for (const it of items.rows) {
    // Variable-weight items deduct their ACTUAL packed weight; others use the
    // unit-fraction math (half_kg = 0.5, etc).
    const need =
      it.final_weight_kg != null
        ? Math.max(0, parseFloat(String(it.final_weight_kg)) || 0)
        : stockUnitsNeeded(it.quantity, it.unit);
    if (need <= 0) continue;

    const bal = await client.query(
      `SELECT quantity FROM ocp_stock WHERE ocp_id = $1 AND product_id = $2 AND quality = $3 FOR UPDATE`,
      [ocpId, it.product_id, it.quality]
    );
    const current = bal.rows[0] ? parseFloat(String(bal.rows[0].quantity)) || 0 : 0;
    const delta = Math.min(need, current); // never below 0
    if (delta > 0) {
      await client.query(
        `UPDATE ocp_stock SET quantity = quantity - $1, updated_at = NOW()
          WHERE ocp_id = $2 AND product_id = $3 AND quality = $4`,
        [delta, ocpId, it.product_id, it.quality]
      );
    }
    await client.query(
      `INSERT INTO ocp_stock_movements (ocp_id, product_id, quality, delta, reason, ref_order_id, note)
       VALUES ($1, $2, $3, $4, 'order_deduct', $5, $6)`,
      [
        ocpId,
        it.product_id,
        it.quality,
        -delta,
        orderId,
        need > current ? `short by ${(need - current).toFixed(3)}` : null,
      ]
    );
  }
}
