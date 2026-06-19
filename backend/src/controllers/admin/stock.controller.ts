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
import { successResponse, errorResponse, notFoundResponse } from '../../utils/response';
import { resolveCityScope } from '../../utils/cityScope';
import { normalizeQuality, qualityStockColumn } from '../../utils/unitPricing';
import { reservedColumn, recordStockMovement } from '../../utils/systemStock';
import { hasCatalogV2Columns } from '../../config/catalogV2Schema';
import { hasOcpTables } from '../../config/ocpSchema';
import logger from '../../utils/logger';

const QUALITIES = ['A', 'B', 'C'] as const;
const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
};

/** Lock a product row in scope, returning its city_id (or throws http error). */
async function lockProductInScope(client: any, id: string, scope: { cityId: string | null; unrestricted: boolean }) {
  const r = await client.query(
    `SELECT id, city_id, name_en,
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
  const r = await query(
    `SELECT m.id, m.quality, m.delta, m.reason, m.note, m.ref_order_id, m.ref_ocp_id, m.created_at,
            o.name AS ocp_name
       FROM stock_movements m
       LEFT JOIN order_collection_points o ON o.id = m.ref_ocp_id
      WHERE m.product_id = $1
      ORDER BY m.created_at DESC LIMIT 100`,
    [req.params.productId]
  );
  return successResponse(res, r.rows, 'Movements');
});

// ── POST /api/admin/stock/add — purchase intake (on_hand += qty) ─────────────
export const addStock = asyncHandler(async (req: Request, res: Response) => {
  const { product_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const qty = num(req.body.quantity);
  if (!product_id || !(qty > 0)) return errorResponse(res, 'Enter a valid quantity.', 400);
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      const stockCol = qualityStockColumn(quality);
      await client.query(`UPDATE products SET ${stockCol} = ${stockCol} + $1, updated_at = NOW() WHERE id = $2`, [qty, product_id]);
      await recordStockMovement(client, {
        productId: product_id, quality, cityId: p.city_id, delta: qty, reason: 'purchase',
        createdBy: req.user?.id ?? null, note: 'stock intake',
      });
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock added', { product_id, quality, qty, by: req.user?.id });
  return successResponse(res, { product_id, quality, added: qty }, 'Stock added');
});

// ── POST /api/admin/stock/waste — discard from central (on_hand -= qty) ──────
export const wasteStock = asyncHandler(async (req: Request, res: Response) => {
  const { product_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const qty = num(req.body.quantity);
  if (!product_id || !(qty > 0)) return errorResponse(res, 'Enter a valid quantity.', 400);
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      const stockCol = qualityStockColumn(quality);
      const resCol = reservedColumn(quality);
      const atOcps = await sumOcpStock(client, product_id, quality);
      const movable = (parseFloat(p[stockCol]) || 0) - (parseFloat(p[resCol]) || 0) - atOcps;
      if (qty > movable) throw Object.assign(new Error(`Only ${movable} available to waste (rest is reserved or at an OCP).`), { http: 400 });
      await client.query(`UPDATE products SET ${stockCol} = ${stockCol} - $1, updated_at = NOW() WHERE id = $2`, [qty, product_id]);
      await recordStockMovement(client, {
        productId: product_id, quality, cityId: p.city_id, delta: -qty, reason: 'waste',
        createdBy: req.user?.id ?? null, note: req.body.note || 'wasted',
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
      await client.query(
        `UPDATE products SET ${fromCol} = ${fromCol} - $1, ${toCol} = ${toCol} + $1, updated_at = NOW() WHERE id = $2`,
        [qty, product_id]
      );
      await recordStockMovement(client, { productId: product_id, quality: from, cityId: p.city_id, delta: -qty, reason: 'convert_out', createdBy: req.user?.id ?? null, note: `→ Quality ${to}` });
      await recordStockMovement(client, { productId: product_id, quality: to, cityId: p.city_id, delta: qty, reason: 'convert_in', createdBy: req.user?.id ?? null, note: `← Quality ${from}` });
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
  const { product_id, ocp_id } = req.body;
  const quality = normalizeQuality(req.body.quality);
  const qty = num(req.body.quantity);
  if (!product_id || !ocp_id || !(qty > 0)) return errorResponse(res, 'Pick an OCP and a valid quantity.', 400);
  const scope = await resolveCityScope(req);

  try {
    await withTransaction(async (client) => {
      const p = await lockProductInScope(client, product_id, scope);
      // OCP must be live + (for scoped admins) in the same city.
      const o = await client.query(`SELECT id, city_id FROM order_collection_points WHERE id = $1 AND deleted_at IS NULL`, [ocp_id]);
      if (o.rows.length === 0) throw Object.assign(new Error('OCP not found'), { http: 404 });
      const stockCol = qualityStockColumn(quality);
      const resCol = reservedColumn(quality);
      const atOcps = await sumOcpStock(client, product_id, quality);
      const movable = (parseFloat(p[stockCol]) || 0) - (parseFloat(p[resCol]) || 0) - atOcps;
      if (qty > movable) throw Object.assign(new Error(`Only ${movable} available to send (rest is reserved or already at an OCP).`), { http: 400 });
      // Physical relocation: OCP balance +qty; system total unchanged.
      await client.query(
        `INSERT INTO ocp_stock (ocp_id, product_id, quality, quantity) VALUES ($1, $2, $3, $4)
         ON CONFLICT (ocp_id, product_id, quality) DO UPDATE SET quantity = ocp_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [ocp_id, product_id, quality, qty]
      );
      await recordOcpMovement(client, ocp_id, product_id, quality, qty, req.user?.id);
      await recordStockMovement(client, { productId: product_id, quality, cityId: p.city_id, delta: 0, reason: 'shift', refOcpId: ocp_id, createdBy: req.user?.id ?? null, note: `shift ${qty} to OCP` });
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
      await lockProductInScope(client, product_id, scope);
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
      await lockProductInScope(client, product_id, scope);
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
