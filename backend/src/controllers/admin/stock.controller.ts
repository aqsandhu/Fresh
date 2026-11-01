// ============================================================================
// ADMIN STOCK MANAGEMENT — city system stock + OCP location ledger.
//
// Model (see utils/systemStock.ts): products.stock_quantity{,_b,_c} is the city
// total on-hand; reserved_quantity{,_b,_c} are soft holds; ocp_stock holds the
// per-OCP physical breakdown. Central (admin-held) = on_hand − Σ ocp. The
// "movable" pool an admin can shift/waste/convert = on_hand − reserved − Σ ocp.
//
// Every mutation runs in withTransaction with FOR UPDATE locks, writes an
// append-only ledger row, and is guarded so nothing can go negative or leak.
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse } from '../../utils/response';
import { resolveCityScope } from '../../utils/cityScope';
import { normalizeQuality, qualityStockColumn } from '../../utils/unitPricing';
import { reservedColumn, recordStockMovement } from '../../utils/systemStock';
import { moveCentralToOcp, assertOcpServesCity } from '../../utils/ocpStock';
import { approvalForValue } from '../../utils/adminApproval';
import { hasCatalogV2Columns } from '../../config/catalogV2Schema';
import { hasOcpTables } from '../../config/ocpSchema';
import logger from '../../utils/logger';
import { isTodaySql, localDate } from '../../utils/businessTime';
import { hasStockCounts } from '../../config/controlsSchema';

const QUALITIES = ['A', 'B', 'C'] as const;
const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Lock a product row in scope, returning its city_id (or throws http error). */
async function lockProductInScope(client: any, id: string, scope: { cityId: string | null; unrestricted: boolean }) {
  const r = await client.query(
    `SELECT id, city_id, name_en,
            price, price_b, price_c,
            stock_quantity, stock_quantity_b, stock_quantity_c,
            reserved_quantity, reserved_quantity_b, reserved_quantity_c
       FROM products WHERE id = $1 FOR UPDATE`,
    [id]
  );
  if (r.rows.length === 0) throw Object.assign(new Error('Product not found'), { http: 404 });
  const row = r.rows[0];
  if (!scope.unrestricted && scope.cityId && row.city_id !== scope.cityId) {
    throw Object.assign(new Error('Product not found'), { http: 404 });
  }
  return row;
}

function priceForQuality(product: any, quality: string): number {
  const col = quality === 'B' ? 'price_b' : quality === 'C' ? 'price_c' : 'price';
  const preferred = parseFloat(String(product[col] ?? ''));
  if (Number.isFinite(preferred) && preferred >= 0) return preferred;
  const fallback = parseFloat(String(product.price ?? ''));
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
}

/** High-value stock changes (waste/convert) require a second admin (shared util). */
const approvalForStock = (client: any, req: Request, value: number, kind: string) =>
  approvalForValue(client, req, value, { label: 'a stock change', kind });

/** Σ of a product+quality across all OCPs (physical breakdown). */
async function sumOcpStock(client: any, productId: string, quality: string): Promise<number> {
  const r = await client.query(
    `SELECT COALESCE(SUM(quantity), 0) AS total FROM ocp_stock WHERE product_id = $1 AND quality = $2`,
    [productId, quality]
  );
  return parseFloat(r.rows[0].total) || 0;
}

async function recordOcpMovement(client: any, ocpId: string, productId: string, quality: string, delta: number, createdBy?: string | null) {
  await client.query(
    `INSERT INTO ocp_stock_movements (ocp_id, product_id, quality, delta, reason, created_by)
     VALUES ($1, $2, $3, $4, 'adjust', $5)`,
    [ocpId, productId, quality, delta, createdBy ?? null]
  );
}

// ── GET /api/admin/stock — per product+quality overview (city-scoped) ────────
export const getStockOverview = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasCatalogV2Columns())) return successResponse(res, { products: [], ocps: [] }, 'Stock');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, { products: [], ocps: [] }, 'Stock');

  const params: any[] = [];
  let where = 'p.is_active = TRUE';
  if (!scope.unrestricted && scope.cityId) { params.push(scope.cityId); where += ` AND p.city_id = $${params.length}`; }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    params.push(`%${req.query.search.trim().toLowerCase()}%`);
    where += ` AND LOWER(p.name_en) LIKE $${params.length}`;
  }

  const prod = await query(
    `SELECT p.id, p.name_en, p.unit_type, p.category_id, c.name_en AS category_name,
            p.price, p.price_b, p.price_c,
            p.stock_quantity, p.stock_quantity_b, p.stock_quantity_c,
            p.reserved_quantity, p.reserved_quantity_b, p.reserved_quantity_c
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE ${where}
      ORDER BY p.name_en ASC LIMIT 500`,
    params
  );

  // Per-OCP holdings for the listed products (one round-trip).
  const ocpReady = await hasOcpTables();
  const holdings: Record<string, Record<string, { ocpId: string; name: string; qty: number }[]>> = {};
  let ocps: { id: string; name: string }[] = [];
  if (ocpReady && prod.rows.length > 0) {
    const ids = prod.rows.map((r: any) => r.id);
    const h = await query(
      `SELECT s.product_id, s.quality, s.ocp_id, o.name, s.quantity
         FROM ocp_stock s JOIN order_collection_points o ON o.id = s.ocp_id
        WHERE s.product_id = ANY($1::uuid[]) AND s.quantity > 0`,
      [ids]
    );
    for (const row of h.rows) {
      const q = String(row.quality);
      holdings[row.product_id] ??= {};
      holdings[row.product_id][q] ??= [];
      holdings[row.product_id][q].push({ ocpId: row.ocp_id, name: row.name, qty: parseFloat(row.quantity) });
    }
    const oc = await query(
      `SELECT id, name FROM order_collection_points
        WHERE deleted_at IS NULL ${!scope.unrestricted && scope.cityId ? 'AND city_id = $1' : ''}
        ORDER BY name ASC`,
      !scope.unrestricted && scope.cityId ? [scope.cityId] : []
    );
    ocps = oc.rows;
  }

  const offered = (p: any, q: string): boolean => q === 'A' || (q === 'B' ? p.price_b != null : p.price_c != null);
  const colFor = (q: string, base: string) => (q === 'A' ? base : `${base}_${q.toLowerCase()}`);

  const products = prod.rows.map((p: any) => {
    const qualities = QUALITIES.filter((q) => offered(p, q)).map((q) => {
      const onHand = parseFloat(p[colFor(q, 'stock_quantity')]) || 0;
      const reserved = parseFloat(p[colFor(q, 'reserved_quantity')]) || 0;
      const ocpList = holdings[p.id]?.[q] || [];
      const atOcps = ocpList.reduce((s, x) => s + x.qty, 0);
      return {
        quality: q,
        onHand,
        reserved,
        available: Math.max(0, onHand - reserved),
        central: Math.max(0, onHand - atOcps),
        movable: Math.max(0, onHand - reserved - atOcps),
        ocps: ocpList,
      };
    });
    return { id: p.id, name: p.name_en, unitType: p.unit_type, categoryName: p.category_name, qualities };
  });

  return successResponse(res, { products, ocps }, 'Stock overview');
});

// ── GET /api/admin/stock/:productId/movements — recent ledger ────────────────
export const getStockMovements = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasCatalogV2Columns())) return successResponse(res, [], 'Movements');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Movements');
  const params: any[] = [req.params.productId];
  let cityWhere = '';
  if (!scope.unrestricted && scope.cityId) {
    params.push(scope.cityId);
    cityWhere = ` AND p.city_id = $${params.length}`;
  }
  const r = await query(
    `SELECT m.id, m.quality, m.delta, m.reason, m.note, m.ref_order_id, m.ref_ocp_id, m.created_at,
            m.proof_url, m.evidence_quantity, m.approved_at,
            o.name AS ocp_name, au.full_name AS approved_by_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN order_collection_points o ON o.id = m.ref_ocp_id
       LEFT JOIN users au ON au.id = m.approved_by
      WHERE m.product_id = $1${cityWhere}
      ORDER BY m.created_at DESC LIMIT 100`,
    params
  );
  return successResponse(res, r.rows, 'Movements');
});

// Daily waste report with proof + approval metadata.
export const getWasteReport = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasCatalogV2Columns())) return successResponse(res, [], 'Waste report');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Waste report');

  const params: any[] = [];
  const where: string[] = [`m.reason = 'waste'`];
  if (!scope.unrestricted && scope.cityId) {
    params.push(scope.cityId);
    where.push(`p.city_id = $${params.length}`);
  } else if (typeof req.query.city_id === 'string' && req.query.city_id) {
    params.push(req.query.city_id);
    where.push(`p.city_id = $${params.length}`);
  }
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : null;
  if (date) {
    params.push(date);
    where.push(`${localDate('m.created_at')} = $${params.length}::date`);
  } else {
    where.push(isTodaySql('m.created_at'));
  }

  const r = await query(
    `SELECT m.id, m.product_id, p.name_en AS product_name, m.quality, m.delta, m.note,
            m.proof_url, m.evidence_quantity, m.approved_at, m.created_at,
            cu.full_name AS created_by_name, au.full_name AS approved_by_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users cu ON cu.id = m.created_by
       LEFT JOIN users au ON au.id = m.approved_by
      WHERE ${where.join(' AND ')}
      ORDER BY m.created_at DESC
      LIMIT 500`,
    params
  );
  return successResponse(
    res,
    r.rows.map((row: any) => ({
      ...row,
      delta: parseFloat(row.delta) || 0,
      evidence_quantity: row.evidence_quantity != null ? parseFloat(row.evidence_quantity) : null,
    })),
    'Waste report'
  );
});

// ── POST /api/admin/stock/add — emergency correction (on_hand += qty) ─────────
export const addStock = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Use Finance -> Stock Purchase for normal stock intake.', 403);
  }
  const { product_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const qty = num(req.body.quantity);
  if (!product_id || !(qty > 0)) return errorResponse(res, 'Enter a valid quantity.', 400);
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!note) return errorResponse(res, 'A correction reason is required.', 400);
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      const stockCol = qualityStockColumn(quality);
      await client.query(`UPDATE products SET ${stockCol} = ${stockCol} + $1, updated_at = NOW() WHERE id = $2`, [qty, product_id]);
      await recordStockMovement(client, {
        productId: product_id, quality, cityId: p.city_id, delta: qty, reason: 'adjust',
        createdBy: req.user?.id ?? null, note,
      });
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock correction added', { product_id, quality, qty, by: req.user?.id });
  return successResponse(res, { product_id, quality, added: qty }, 'Stock corrected');
});

// ── POST /api/admin/stock/waste — discard from central (on_hand -= qty) ──────
export const wasteStock = asyncHandler(async (req: Request, res: Response) => {
  const { product_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const qty = num(req.body.quantity);
  if (!product_id || !(qty > 0)) return errorResponse(res, 'Enter a valid quantity.', 400);
  // A reason is mandatory for an audit-clean waste trail.
  const reason = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!reason) return errorResponse(res, 'A reason is required to waste stock.', 400);
  const proofUrl = req.file?.url || '';
  if (!proofUrl) return errorResponse(res, 'Upload a proof image for wasted stock.', 400);
  const evidenceQty = num(req.body.evidence_quantity ?? req.body.evidenceQuantity);
  if (!(evidenceQty > 0)) return errorResponse(res, 'Enter the evidence quantity shown in the proof.', 400);
  if (Math.abs(evidenceQty - qty) > 0.001) {
    return errorResponse(res, 'Evidence quantity must match the wasted quantity.', 400);
  }
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      const stockCol = qualityStockColumn(quality);
      const resCol = reservedColumn(quality);
      const atOcps = await sumOcpStock(client, product_id, quality);
      const movable = (parseFloat(p[stockCol]) || 0) - (parseFloat(p[resCol]) || 0) - atOcps;
      if (qty > movable) throw Object.assign(new Error(`Only ${movable} available to waste (rest is reserved or at an OCP).`), { http: 400 });
      const value = qty * priceForQuality(p, quality);
      const approval = await approvalForStock(client, req, value, 'waste');
      await client.query(`UPDATE products SET ${stockCol} = ${stockCol} - $1, updated_at = NOW() WHERE id = $2`, [qty, product_id]);
      await recordStockMovement(client, {
        productId: product_id, quality, cityId: p.city_id, delta: -qty, reason: 'waste',
        createdBy: req.user?.id ?? null,
        note: `${reason} | evidence ${evidenceQty} | value Rs. ${round2(value)}`,
        proofUrl,
        evidenceQuantity: evidenceQty,
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
      });
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock wasted', { product_id, quality, qty, by: req.user?.id });
  return successResponse(res, { product_id, quality, wasted: qty }, 'Stock wasted');
});

// ── POST /api/admin/stock/convert — move quantity between quality tiers ───────
export const convertQuality = asyncHandler(async (req: Request, res: Response) => {
  const { product_id } = req.body;
  const from = normalizeQuality(req.body.from_quality);
  const to = normalizeQuality(req.body.to_quality);
  const qty = num(req.body.quantity);
  if (!product_id || !(qty > 0)) return errorResponse(res, 'Enter a valid quantity.', 400);
  if (from === to) return errorResponse(res, 'Choose two different qualities.', 400);
  const reason = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!reason) return errorResponse(res, 'A reason is required to convert stock quality.', 400);
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      const fromCol = qualityStockColumn(from);
      const toCol = qualityStockColumn(to);
      const fromRes = reservedColumn(from);
      const atOcps = await sumOcpStock(client, product_id, from);
      const movable = (parseFloat(p[fromCol]) || 0) - (parseFloat(p[fromRes]) || 0) - atOcps;
      if (qty > movable) throw Object.assign(new Error(`Only ${movable} of Quality ${from} can be converted (rest is reserved or at an OCP).`), { http: 400 });
      const value = qty * priceForQuality(p, from);
      const approval = await approvalForStock(client, req, value, 'convert');
      await client.query(
        `UPDATE products SET ${fromCol} = ${fromCol} - $1, ${toCol} = ${toCol} + $1, updated_at = NOW() WHERE id = $2`,
        [qty, product_id]
      );
      await recordStockMovement(client, {
        productId: product_id, quality: from, cityId: p.city_id, delta: -qty, reason: 'convert_out',
        createdBy: req.user?.id ?? null,
        note: `to Quality ${to} | ${reason} | value Rs. ${round2(value)}`,
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
      });
      await recordStockMovement(client, {
        productId: product_id, quality: to, cityId: p.city_id, delta: qty, reason: 'convert_in',
        createdBy: req.user?.id ?? null,
        note: `from Quality ${from} | ${reason} | value Rs. ${round2(value)}`,
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
      });
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock converted', { product_id, from, to, qty, by: req.user?.id });
  return successResponse(res, { product_id, from, to, qty }, 'Stock converted');
});

// ── POST /api/admin/stock/shift — central → OCP (on_hand unchanged) ──────────
export const shiftToOcp = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasOcpTables())) return errorResponse(res, 'OCP system not ready.', 503);
  // Normal sends go through a stock request the OCP must receive (it confirms
  // what arrived). A direct shift skips that, so it is a super-admin correction.
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Send stock to an OCP as a stock request — the OCP confirms receipt.', 400);
  }
  const { product_id, ocp_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const qty = num(req.body.quantity);
  if (!product_id || !ocp_id || !(qty > 0)) return errorResponse(res, 'Pick an OCP and a valid quantity.', 400);
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      // Shared atomic guard: product + admin scope, OCP active + same city, and
      // central availability (on_hand − reserved − Σocp ≥ qty).
      await moveCentralToOcp(client, {
        productId: product_id, ocpId: ocp_id, quality, qty,
        scope, reason: 'adjust', createdBy: req.user?.id ?? null,
        note: `shift ${qty} to OCP`,
      });
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock shifted to OCP', { product_id, ocp_id, quality, qty, by: req.user?.id });
  return successResponse(res, { product_id, ocp_id, quality, qty }, 'Stock sent to OCP');
});

// ── POST /api/admin/stock/return — OCP → central (on_hand unchanged) ─────────
export const returnFromOcp = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasOcpTables())) return errorResponse(res, 'OCP system not ready.', 503);
  const { product_id, ocp_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const qty = num(req.body.quantity);
  if (!product_id || !ocp_id || !(qty > 0)) return errorResponse(res, 'Pick an OCP and a valid quantity.', 400);
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      // Same-city OCP (disabled OCPs may still be drained back to central).
      await assertOcpServesCity(client, ocp_id, p.city_id, { allowDisabled: true });
      const dec = await client.query(
        `UPDATE ocp_stock SET quantity = quantity - $1, updated_at = NOW()
          WHERE ocp_id = $2 AND product_id = $3 AND quality = $4 AND quantity >= $1
          RETURNING quantity`,
        [qty, ocp_id, product_id, quality]
      );
      if (dec.rowCount === 0) throw Object.assign(new Error('OCP does not have that much stock to return.'), { http: 400 });
      await recordOcpMovement(client, ocp_id, product_id, quality, -qty, req.user?.id);
      await recordStockMovement(client, { productId: product_id, quality, delta: 0, reason: 'shift', refOcpId: ocp_id, createdBy: req.user?.id ?? null, note: `return ${qty} from OCP` });
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock returned from OCP', { product_id, ocp_id, quality, qty, by: req.user?.id });
  return successResponse(res, { product_id, ocp_id, quality, qty }, 'Stock returned');
});

// ── POST /api/admin/stock/transfer — OCP → OCP ───────────────────────────────
export const transferOcpToOcp = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasOcpTables())) return errorResponse(res, 'OCP system not ready.', 503);
  const { product_id, from_ocp_id, to_ocp_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const qty = num(req.body.quantity);
  if (!product_id || !from_ocp_id || !to_ocp_id || !(qty > 0)) return errorResponse(res, 'Pick both OCPs and a valid quantity.', 400);
  if (from_ocp_id === to_ocp_id) return errorResponse(res, 'Choose two different OCPs.', 400);
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      // Both OCPs must serve the product's city; the destination must be active,
      // the source may be disabled (so a disabled OCP can be drained).
      await assertOcpServesCity(client, from_ocp_id, p.city_id, { allowDisabled: true });
      await assertOcpServesCity(client, to_ocp_id, p.city_id);
      const dec = await client.query(
        `UPDATE ocp_stock SET quantity = quantity - $1, updated_at = NOW()
          WHERE ocp_id = $2 AND product_id = $3 AND quality = $4 AND quantity >= $1 RETURNING quantity`,
        [qty, from_ocp_id, product_id, quality]
      );
      if (dec.rowCount === 0) throw Object.assign(new Error('Source OCP does not have that much stock.'), { http: 400 });
      await client.query(
        `INSERT INTO ocp_stock (ocp_id, product_id, quality, quantity) VALUES ($1, $2, $3, $4)
         ON CONFLICT (ocp_id, product_id, quality) DO UPDATE SET quantity = ocp_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [to_ocp_id, product_id, quality, qty]
      );
      await recordOcpMovement(client, from_ocp_id, product_id, quality, -qty, req.user?.id);
      await recordOcpMovement(client, to_ocp_id, product_id, quality, qty, req.user?.id);
      await recordStockMovement(client, { productId: product_id, quality, delta: 0, reason: 'shift', refOcpId: to_ocp_id, createdBy: req.user?.id ?? null, note: `transfer ${qty} between OCPs` });
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock transferred OCP→OCP', { product_id, from_ocp_id, to_ocp_id, quality, qty, by: req.user?.id });
  return successResponse(res, { product_id, from_ocp_id, to_ocp_id, quality, qty }, 'Stock transferred');
});

// ── POST /api/admin/stock/count — physical shelf count (blind) ───────────────
// The only control that catches goods walking out of the store: the system
// can only compare itself with itself. Someone counts what is physically in
// the store (shelf + packed bags waiting); the system compares it with what
// should be there (on hand − at OCPs − out with riders), posts the
// difference to the ledger so the books match the shelf, and keeps who
// counted and — for a shortage — who co-approved (daily second-admin rule).
// The expected number is NOT shown before counting (the counter would copy it).
export const countStock = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasStockCounts())) return errorResponse(res, 'Stock counting needs migration 60 — run the database migrations.', 503);
  const { product_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const counted = num(req.body.counted_quantity ?? req.body.countedQuantity);
  if (!product_id || !Number.isFinite(counted) || counted < 0) return errorResponse(res, 'Enter the quantity you counted.', 400);
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  const scope = await resolveCityScope(req);

  let out: any;
  try {
    out = await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      const stockCol = qualityStockColumn(quality);
      const onHand = parseFloat(p[stockCol]) || 0;
      const atOcps = await sumOcpStock(client, product_id, quality);
      // Packed goods already out with riders (still on hand until delivered).
      const withRiders = await client.query(
        `SELECT COALESCE(SUM(oi.quantity * CASE COALESCE(oi.unit, 'full')
                  WHEN 'half_kg' THEN 0.5 WHEN 'quarter_kg' THEN 0.25 WHEN 'half_dozen' THEN 0.5 ELSE 1 END), 0) AS units
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = $1 AND COALESCE(oi.quality, 'A') = $2
            AND o.status = 'out_for_delivery' AND o.stock_reserved = TRUE
            AND o.ocp_id IS NULL AND o.deleted_at IS NULL`,
        [product_id, quality]
      );
      const outWithRiders = parseFloat(withRiders.rows[0].units) || 0;
      const expected = Math.round((onHand - atOcps - outWithRiders) * 1000) / 1000;
      const variance = Math.round((counted - expected) * 1000) / 1000;
      const value = round2(variance * priceForQuality(p, quality));

      // A shortage is value leaving the business → daily second-admin rule.
      const approval = variance < 0
        ? await approvalForStock(client, req, -value, 'stock_count')
        : { approvedBy: null, approvedAt: null };

      if (Math.abs(variance) > 0.0005) {
        const statusSet = stockCol === 'stock_quantity'
          ? `, stock_status = CASE WHEN stock_quantity + $1 > 0 THEN 'active'::product_status ELSE 'out_of_stock'::product_status END`
          : '';
        await client.query(`UPDATE products SET ${stockCol} = ${stockCol} + $1${statusSet}, updated_at = NOW() WHERE id = $2`, [variance, product_id]);
        await recordStockMovement(client, {
          productId: product_id, quality, cityId: p.city_id, delta: variance, reason: 'adjust',
          createdBy: req.user?.id ?? null,
          note: `stock count: counted ${counted}, expected ${expected} | value Rs. ${value}${note ? ` | ${note}` : ''}`,
          approvedBy: approval.approvedBy, approvedAt: approval.approvedAt,
        });
      }
      const ins = await client.query(
        `INSERT INTO stock_counts (city_id, product_id, quality, expected_qty, counted_qty, variance, variance_value, note, counted_by, approved_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, created_at`,
        [p.city_id, product_id, quality, expected, counted, variance, value, note || null, req.user?.id ?? null, approval.approvedBy]
      );
      return { id: ins.rows[0].id, product: p.name_en, quality, expected, counted, variance, value, outWithRiders, atOcps };
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock counted', { ...out, by: req.user?.id });
  const msg = Math.abs(out.variance) < 0.0005
    ? 'Count matches the system'
    : out.variance < 0
      ? `Shortage of ${Math.abs(out.variance)} (Rs. ${Math.abs(out.value)}) recorded`
      : `Surplus of ${out.variance} recorded`;
  return successResponse(res, out, msg);
});

// ── GET /api/admin/stock/counts?date=YYYY-MM-DD — counts for a Pakistan day ──
export const listStockCounts = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasStockCounts())) return successResponse(res, [], 'Stock counts');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Stock counts');
  const params: any[] = [];
  const where: string[] = [];
  if (!scope.unrestricted && scope.cityId) { params.push(scope.cityId); where.push(`sc.city_id = $${params.length}`); }
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  if (date) { params.push(date); where.push(`${localDate('sc.created_at')} = $${params.length}::date`); }
  else where.push(isTodaySql('sc.created_at'));
  const r = await query(
    `SELECT sc.id, sc.product_id, p.name_en AS product_name, sc.quality, sc.expected_qty, sc.counted_qty,
            sc.variance, sc.variance_value, sc.note, sc.created_at,
            cu.full_name AS counted_by_name, au.full_name AS approved_by_name
       FROM stock_counts sc
       LEFT JOIN products p ON p.id = sc.product_id
       LEFT JOIN users cu ON cu.id = sc.counted_by
       LEFT JOIN users au ON au.id = sc.approved_by
      WHERE ${where.join(' AND ')}
      ORDER BY sc.created_at DESC LIMIT 500`,
    params
  );
  return successResponse(res, r.rows.map((x: any) => ({
    ...x,
    expected_qty: parseFloat(x.expected_qty), counted_qty: parseFloat(x.counted_qty),
    variance: parseFloat(x.variance), variance_value: parseFloat(x.variance_value),
  })), 'Stock counts');
});
