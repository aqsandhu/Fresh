// ============================================================================
// OCP stock helpers — receive (admin → OCP) and deduct-on-delivery.
// Balance (ocp_stock) is kept in lock-step with an append-only audit ledger
// (ocp_stock_movements): balance == Σ movements. quantity has a DB CHECK (>= 0).
// ============================================================================

import { PoolClient } from 'pg';
import { stockUnitsNeeded, qualityStockColumn } from './unitPricing';
import { reservedColumn, recordStockMovement } from './systemStock';
import { ensureOcpTables } from '../config/ocpSchema';
import { emitToAdmins } from '../config/socket';
import logger from './logger';

type HttpError = Error & { http: number };
function httpError(http: number, message: string): HttpError {
  return Object.assign(new Error(message), { http });
}

/**
 * Validate (and lock) an OCP for a movement involving a given product. Enforces:
 * the OCP exists + is not deleted, is active (unless allowDisabled), and serves
 * the SAME city as the product. Returns the OCP row. Throws { http } on failure.
 *
 * id alone is never the integrity boundary — without the same-city check a
 * product from one city could be pushed into another city's OCP.
 */
export async function assertOcpServesCity(
  client: PoolClient,
  ocpId: string,
  productCityId: string | null,
  opts: { allowDisabled?: boolean } = {}
): Promise<{ id: string; city_id: string | null; status: string }> {
  const o = await client.query(
    `SELECT id, city_id, status FROM order_collection_points WHERE id = $1 AND deleted_at IS NULL`,
    [ocpId]
  );
  if (o.rows.length === 0) throw httpError(404, 'OCP not found');
  const row = o.rows[0];
  if (!opts.allowDisabled && row.status !== 'active') throw httpError(400, 'OCP is disabled.');
  if (productCityId && row.city_id && productCityId !== row.city_id) {
    throw httpError(400, 'That OCP is in a different city than the product.');
  }
  return row;
}

export interface CentralToOcpOpts {
  productId: string;
  ocpId: string;
  quality: string;
  qty: number;
  /** When set, a scoped admin may only move stock within their own city. */
  scope?: { cityId: string | null; unrestricted: boolean } | null;
  /** OCP-ledger reason (must satisfy the ocp_stock_movements CHECK). */
  reason?: 'receive' | 'adjust';
  refRequestId?: string | null;
  createdBy?: string | null;
  note?: string | null;
}

/**
 * Atomically move `qty` of product+quality from a city's CENTRAL pool into an
 * OCP. Validates, under a row lock, that: the product exists (+ admin scope),
 * the OCP exists + is active + serves the product's city, and the city has
 * enough central stock (on_hand − reserved − Σ ocp ≥ qty) — so an OCP can never
 * hold more than the city physically has. Increments ocp_stock and writes both
 * the OCP and system ledgers. on_hand is unchanged (the stock is still in the
 * city, just on the OCP's shelf). MUST run inside a transaction.
 */
export async function moveCentralToOcp(client: PoolClient, opts: CentralToOcpOpts): Promise<void> {
  const { productId, ocpId, quality, qty } = opts;
  if (!(qty > 0)) throw httpError(400, 'Quantity must be greater than 0.');

  const stockCol = qualityStockColumn(quality);
  const resCol = reservedColumn(quality);

  const pr = await client.query(
    `SELECT id, city_id, ${stockCol} AS on_hand, ${resCol} AS reserved
       FROM products WHERE id = $1 FOR UPDATE`,
    [productId]
  );
  if (pr.rows.length === 0) throw httpError(404, 'Product not found');
  const p = pr.rows[0];
  if (opts.scope && !opts.scope.unrestricted && opts.scope.cityId && p.city_id !== opts.scope.cityId) {
    throw httpError(404, 'Product not found');
  }

  await assertOcpServesCity(client, ocpId, p.city_id);

  const sum = await client.query(
    `SELECT COALESCE(SUM(quantity), 0) AS total FROM ocp_stock WHERE product_id = $1 AND quality = $2`,
    [productId, quality]
  );
  const onHand = parseFloat(String(p.on_hand)) || 0;
  const reserved = parseFloat(String(p.reserved)) || 0;
  const atOcps = parseFloat(String(sum.rows[0].total)) || 0;
  const central = onHand - reserved - atOcps;
  if (qty > central) {
    throw httpError(400, `Only ${central} available to send (rest is reserved or already at an OCP).`);
  }

  await client.query(
    `INSERT INTO ocp_stock (ocp_id, product_id, quality, quantity) VALUES ($1, $2, $3, $4)
     ON CONFLICT (ocp_id, product_id, quality)
     DO UPDATE SET quantity = ocp_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
    [ocpId, productId, quality, qty]
  );
  await client.query(
    `INSERT INTO ocp_stock_movements (ocp_id, product_id, quality, delta, reason, ref_request_id, created_by, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ocpId, productId, quality, qty, opts.reason ?? 'adjust', opts.refRequestId ?? null, opts.createdBy ?? null, opts.note ?? null]
  );
  // System ledger: physical relocation only (on_hand unchanged).
  await recordStockMovement(client, {
    productId, quality, cityId: p.city_id, delta: 0, reason: 'shift', refOcpId: ocpId,
    createdBy: opts.createdBy ?? null, note: opts.note ?? `shift ${qty} to OCP`,
  });
}

export async function openOcpShortageCount(client: PoolClient, ocpId: string): Promise<number> {
  const r = await client.query(
    `SELECT COUNT(*)::int AS count FROM ocp_stock_shortages WHERE ocp_id = $1 AND status = 'open'`,
    [ocpId]
  );
  return Number(r.rows[0]?.count || 0);
}

export async function assertNoOpenOcpShortages(client: PoolClient, ocpId: string): Promise<void> {
  const count = await openOcpShortageCount(client, ocpId);
  if (count > 0) {
    throw httpError(409, 'This OCP has unresolved stock shortages. Resolve them before settling cash.');
  }
}

/**
 * Deduct an OCP-fulfilled order's items from the OCP's stock when it is
 * delivered. Idempotent (skips if already deducted for this order). Floors the
 * balance at 0 — physical delivery already happened, so a stock mismatch never
 * blocks it; the ledger records exactly what was deducted. MUST run inside the
 * delivery transaction (the order row is already locked by the caller).
 */
export async function deductOcpStockOnDelivery(client: PoolClient, orderId: string): Promise<void> {
  if (!(await ensureOcpTables())) return;

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
    const shortage = Math.max(0, need - current);
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
    if (shortage > 0) {
      const p = await client.query('SELECT name_en FROM products WHERE id = $1', [it.product_id]);
      const o = await client.query('SELECT order_number FROM orders WHERE id = $1', [orderId]);
      const inserted = await client.query(
        `INSERT INTO ocp_stock_shortages (ocp_id, product_id, order_id, quality, shortage_qty, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (ocp_id, product_id, order_id, quality) WHERE status = 'open'
         DO UPDATE SET shortage_qty = EXCLUDED.shortage_qty, note = EXCLUDED.note
         RETURNING id, shortage_qty`,
        [
          ocpId,
          it.product_id,
          orderId,
          it.quality,
          shortage,
          `Needed ${need.toFixed(3)}, available ${current.toFixed(3)} at delivery`,
        ]
      );
      const shortageId = inserted.rows[0]?.id;
      logger.warn('OCP stock shortage recorded', {
        shortageId,
        ocpId,
        productId: it.product_id,
        orderId,
        shortage,
      });
      emitToAdmins('ocp:shortage', {
        shortageId,
        ocpId,
        productId: it.product_id,
        productName: p.rows[0]?.name_en || 'Product',
        orderId,
        orderNumber: o.rows[0]?.order_number || null,
        quality: it.quality,
        shortageQty: shortage,
        title: 'OCP stock shortage',
        message: `${p.rows[0]?.name_en || 'Product'} short by ${shortage.toFixed(3)} at delivery`,
        link: '/admin/ocp',
      });
    }
  }
}
