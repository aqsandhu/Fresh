// ============================================================================
// ADMIN CONTROLLER — Order Collection Points (CRUD).
// OCP management is a cross-city capability (requirement: any city admin or
// super-admin can create an OCP in any city), gated by the `ocp.manage`
// permission. Order assignment + operations remain city-scoped elsewhere.
// ============================================================================

import { asCaughtError } from '../../utils/caughtError';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction, type DbRow } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, createdResponse, errorResponse, notFoundResponse } from '../../utils/response';
import { normalizePhoneNumber } from '../../utils/validators';
import { ensureOcpTables } from '../../config/ocpSchema';
import { cityRowInScope, resolveCityScope } from '../../utils/cityScope';
import logger from '../../utils/logger';
import { markCredentialsChanged } from '../../utils/portalCredentials';
import { isWeakPin, WEAK_PIN_MESSAGE } from '../../utils/pinStrength';

const PIN_ROUNDS = 10;

function rowToOcp(o: DbRow) {
  return {
    id: o.id,
    name: o.name,
    owner_name: o.owner_name,
    phone: o.phone,
    city_id: o.city_id,
    city: o.city_name ?? null,
    address: o.address,
    status: o.status,
    created_at: o.created_at,
    order_count: o.order_count != null ? Number(o.order_count) : undefined,
    open_shortage_count: o.open_shortage_count != null ? Number(o.open_shortage_count) : undefined,
  };
}

/** GET /api/admin/ocp — list collection points (optional ?city_id=). */
export const listOcps = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureOcpTables())) return successResponse(res, [], 'OCPs');
  // A city admin sees only their own city's OCPs (B27: every city's names,
  // phones and addresses used to be listed); the super admin sees all.
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'OCPs');
  const params: unknown[] = [];
  let where = 'WHERE o.deleted_at IS NULL';
  if (req.user?.role !== 'super_admin') {
    if (!scope.cityId) return successResponse(res, [], 'OCPs');
    params.push(scope.cityId);
    where += ` AND o.city_id = $${params.length}`;
  } else if (typeof req.query.city_id === 'string' && req.query.city_id) {
    params.push(req.query.city_id);
    where += ` AND o.city_id = $${params.length}`;
  }
  const result = await query(
    `SELECT o.*, sc.name AS city_name,
            (SELECT COUNT(*) FROM orders od WHERE od.ocp_id = o.id) AS order_count,
            (SELECT COUNT(*) FROM ocp_stock_shortages sh WHERE sh.ocp_id = o.id AND sh.status = 'open') AS open_shortage_count
       FROM order_collection_points o
       LEFT JOIN service_cities sc ON sc.id = o.city_id
       ${where}
      ORDER BY o.created_at DESC`,
    params
  );
  return successResponse(res, result.rows.map(rowToOcp), 'OCPs');
});

/** POST /api/admin/ocp — create a collection point. */
export const createOcp = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureOcpTables())) {
    return errorResponse(res, 'OCP module is being set up. Please try again shortly.', 503);
  }
  const { name, owner_name, address, pin } = req.body;
  if (!name || !String(name).trim()) return errorResponse(res, 'Name is required.', 400);
  // A city admin creates OCPs only in their own city (B27: another city's
  // admin could plant an OCP here with a PIN they chose). The super admin
  // picks the city (body, or the city chosen in the header).
  const scope = await resolveCityScope(req);
  let city_id: string | null = typeof req.body.city_id === 'string' && req.body.city_id ? req.body.city_id : null;
  if (req.user?.role !== 'super_admin') {
    if (!scope.cityId) return errorResponse(res, 'Your admin account is not assigned to a city.', 403);
    if (city_id && city_id !== scope.cityId) return errorResponse(res, 'You can only create an OCP in your own city.', 403);
    city_id = scope.cityId;
  } else if (!city_id) {
    city_id = scope.cityId;
  }
  if (!city_id) return errorResponse(res, 'City is required.', 400);
  if (!/^\d{4}$/.test(String(pin || ''))) return errorResponse(res, 'PIN must be exactly 4 digits.', 400);

  let normPhone: string;
  try {
    normPhone = normalizePhoneNumber(String(req.body.phone || ''));
  } catch {
    return errorResponse(res, 'Enter a valid phone number.', 400);
  }

  const city = await query('SELECT id, name FROM service_cities WHERE id = $1 AND is_active = TRUE', [city_id]);
  if (city.rows.length === 0) return errorResponse(res, 'Invalid city.', 400);

  if (isWeakPin(pin)) return errorResponse(res, WEAK_PIN_MESSAGE, 400); // B33
  const pinHash = await bcrypt.hash(String(pin), PIN_ROUNDS);

  let result;
  try {
    result = await query(
      `INSERT INTO order_collection_points (name, owner_name, phone, pin_hash, city_id, address, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(name).trim(),
        owner_name ? String(owner_name).trim() : null,
        normPhone,
        pinHash,
        city_id,
        address ? String(address).trim() : null,
        req.user?.id ?? null,
      ]
    );
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.code === '23505') {
      return errorResponse(res, 'An OCP with this phone already exists.', 409);
    }
    throw err;
  }

  logger.info('OCP created', { ocpId: result.rows[0].id, by: req.user?.id });
  const out = rowToOcp({ ...result.rows[0], city_name: city.rows[0].name });
  return createdResponse(res, out, 'OCP created');
});

/** PUT /api/admin/ocp/:id — update name/address/status/city; optional new PIN. */
export const updateOcp = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  // City isolation: a city-scoped admin can only manage OCPs in their own city
  // (this endpoint resets the OCP portal PIN, so it is a credential primitive).
  const scope = await resolveCityScope(req);
  const existing = await query('SELECT id, city_id FROM order_collection_points WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (existing.rows.length === 0 || !cityRowInScope(scope, existing.rows[0].city_id)) {
    return notFoundResponse(res, 'OCP not found');
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const { name, owner_name, address, status, city_id, pin } = req.body;
  if (city_id !== undefined && city_id && !cityRowInScope(scope, city_id)) {
    return errorResponse(res, 'You can only move an OCP within your own city.', 403);
  }

  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(String(name).trim()); }
  if (owner_name !== undefined) { sets.push(`owner_name = $${i++}`); vals.push(owner_name ? String(owner_name).trim() : null); }
  if (address !== undefined) { sets.push(`address = $${i++}`); vals.push(address ? String(address).trim() : null); }
  if (status !== undefined) {
    if (!['active', 'disabled'].includes(String(status))) return errorResponse(res, 'Invalid status.', 400);
    sets.push(`status = $${i++}`); vals.push(String(status));
  }
  if (city_id !== undefined && city_id) {
    const city = await query('SELECT id FROM service_cities WHERE id = $1 AND is_active = TRUE', [city_id]);
    if (city.rows.length === 0) return errorResponse(res, 'Invalid city.', 400);
    sets.push(`city_id = $${i++}`); vals.push(city_id);
  }
  if (pin !== undefined && pin !== '') {
    if (!/^\d{4}$/.test(String(pin))) return errorResponse(res, 'PIN must be exactly 4 digits.', 400);
    if (isWeakPin(pin)) return errorResponse(res, WEAK_PIN_MESSAGE, 400); // B33
    sets.push(`pin_hash = $${i++}`); vals.push(await bcrypt.hash(String(pin), PIN_ROUNDS));
  }

  if (sets.length === 0) return errorResponse(res, 'Nothing to update.', 400);
  vals.push(id);
  const result = await query(
    `UPDATE order_collection_points SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
    vals
  );
  // A new PIN ends every session signed in with the old one (B38).
  if (pin !== undefined && pin !== '' && result.rows[0]) await markCredentialsChanged('order_collection_points', id);
  logger.info('OCP updated', { ocpId: id, by: req.user?.id });
  return successResponse(res, rowToOcp(result.rows[0]), 'OCP updated');
});

// ── Stock send (city admin → OCP) ───────────────────────────────────────────
const QUALITIES = ['A', 'B', 'C'];

/** POST /api/admin/ocp/:id/stock-requests — send a stock batch to an OCP (pending). */
export const createStockRequest = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureOcpTables())) return errorResponse(res, 'OCP module is being set up. Please try again shortly.', 503);
  const { id } = req.params;
  const { items, note } = req.body as { items?: any[]; note?: string };
  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse(res, 'Add at least one stock line.', 400);
  }
  const ocp = await query(
    `SELECT id, city_id, status FROM order_collection_points WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  // Another city's OCP is "not found" (B27).
  if (ocp.rows.length === 0 || !cityRowInScope(await resolveCityScope(req), ocp.rows[0].city_id)) {
    return notFoundResponse(res, 'OCP not found');
  }
  if (ocp.rows[0].status !== 'active') return errorResponse(res, 'OCP is disabled.', 400);
  // Normalise + validate lines.
  const clean: { product_id: string; quality: string; quantity: number }[] = [];
  for (const it of items) {
    const q = String(it.quality || 'A').toUpperCase();
    const qty = parseFloat(String(it.quantity));
    if (!it.product_id) return errorResponse(res, 'Each line needs a product.', 400);
    if (!QUALITIES.includes(q)) return errorResponse(res, 'Invalid quality.', 400);
    if (!Number.isFinite(qty) || qty <= 0) return errorResponse(res, 'Quantity must be greater than 0.', 400);
    clean.push({ product_id: it.product_id, quality: q, quantity: qty });
  }

  // Products are per-city: every requested line must exist and belong to the
  // OCP's own city. Stock can't be sent to an OCP for a foreign-city product.
  // (Central availability is enforced atomically when the OCP receives.)
  const ocpCityId = ocp.rows[0].city_id;
  const productIds = [...new Set(clean.map((l) => l.product_id))];
  const prods = await query<DbRow<{ id: string; city_id: string | null }>>(`SELECT id, city_id FROM products WHERE id = ANY($1::uuid[])`, [productIds]);
  const cityById = new Map<string, string | null>(prods.rows.map((r) => [r.id, r.city_id]));
  for (const l of clean) {
    if (!cityById.has(l.product_id)) return errorResponse(res, 'One or more products were not found.', 400);
    const pCity = cityById.get(l.product_id);
    if (ocpCityId && pCity && pCity !== ocpCityId) {
      return errorResponse(res, "All products must belong to the OCP's city.", 400);
    }
  }

  const created = await withTransaction(async (client) => {
    const reqRow = await client.query(
      `INSERT INTO ocp_stock_requests (ocp_id, city_id, note, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, ocp.rows[0].city_id, note ? String(note).slice(0, 500) : null, req.user?.id ?? null]
    );
    const request = reqRow.rows[0];
    for (const l of clean) {
      await client.query(
        `INSERT INTO ocp_stock_request_items (request_id, product_id, quality, quantity)
         VALUES ($1, $2, $3, $4)`,
        [request.id, l.product_id, l.quality, l.quantity]
      );
    }
    return request;
  });

  logger.info('OCP stock request created', { requestId: created.id, ocpId: id, by: req.user?.id });
  return createdResponse(res, { id: created.id, status: created.status }, 'Stock sent to OCP (awaiting receipt)');
});

/** GET /api/admin/ocp/:id/stock-requests — requests for an OCP (admin view). */
export const listStockRequests = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const owner = await query(`SELECT city_id FROM order_collection_points WHERE id = $1`, [id]);
  if (owner.rows.length === 0 || !cityRowInScope(await resolveCityScope(req), owner.rows[0].city_id)) {
    return notFoundResponse(res, 'OCP not found');
  }
  const result = await query(
    `SELECT r.id, r.status, r.note, r.created_at, r.received_at,
            COALESCE(json_agg(json_build_object(
              'product_id', i.product_id, 'product_name', p.name_en,
              'quality', i.quality, 'quantity', i.quantity
            ) ORDER BY p.name_en) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM ocp_stock_requests r
       LEFT JOIN ocp_stock_request_items i ON i.request_id = r.id
       LEFT JOIN products p ON p.id = i.product_id
      WHERE r.ocp_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 100`,
    [id]
  );
  return successResponse(res, result.rows, 'Stock requests');
});

/** GET /api/admin/ocp/shortages?status=open - OCP stock shortage report. */
export const listShortages = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureOcpTables())) return successResponse(res, [], 'Shortages');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Shortages');

  const params: unknown[] = [];
  let where = '1=1';
  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  if (['open', 'resolved'].includes(status)) {
    params.push(status);
    where += ` AND sh.status = $${params.length}`;
  }
  if (typeof req.query.ocp_id === 'string' && req.query.ocp_id) {
    params.push(req.query.ocp_id);
    where += ` AND sh.ocp_id = $${params.length}`;
  }
  if (!scope.unrestricted && scope.cityId && scope.dbReady) {
    params.push(scope.cityId);
    where += ` AND o.city_id = $${params.length}`;
  }

  const result = await query<DbRow<{ shortage_qty: string }>>(
    `SELECT sh.id, sh.ocp_id, sh.product_id, sh.order_id, sh.quality,
            sh.shortage_qty, sh.status, sh.note, sh.created_at,
            sh.resolved_at, sh.resolution_note,
            o.name AS ocp_name, o.city_id,
            p.name_en AS product_name,
            od.order_number,
            u.full_name AS resolved_by_name
       FROM ocp_stock_shortages sh
       JOIN order_collection_points o ON o.id = sh.ocp_id
       LEFT JOIN products p ON p.id = sh.product_id
       LEFT JOIN orders od ON od.id = sh.order_id
       LEFT JOIN users u ON u.id = sh.resolved_by
      WHERE ${where}
      ORDER BY (sh.status = 'open') DESC, sh.created_at DESC
      LIMIT 200`,
    params
  );

  return successResponse(
    res,
    result.rows.map((row) => ({ ...row, shortage_qty: parseFloat(row.shortage_qty) || 0 })),
    'Shortages'
  );
});

/** POST /api/admin/ocp/shortages/:id/resolve - close after reconciliation. */
export const resolveShortage = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureOcpTables())) return errorResponse(res, 'OCP module is being set up. Please try again shortly.', 503);
  const { id } = req.params;
  const password = String(req.body?.password || '');
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!password) return errorResponse(res, 'Enter your password to resolve this shortage.', 400);
  if (!note) return errorResponse(res, 'Resolution note is required.', 400);

  const u = await query('SELECT password_hash FROM users WHERE id = $1', [req.user?.id]);
  const hash = u.rows[0]?.password_hash;
  if (!hash || !(await bcrypt.compare(password, hash))) {
    return errorResponse(res, 'Incorrect password.', 400);
  }

  const scope = await resolveCityScope(req);
  let out;
  try {
    out = await withTransaction(async (client) => {
      const row = await client.query(
        `SELECT sh.id, sh.status, o.city_id
           FROM ocp_stock_shortages sh
           JOIN order_collection_points o ON o.id = sh.ocp_id
          WHERE sh.id = $1
          FOR UPDATE OF sh`,
        [id]
      );
      if (row.rows.length === 0) throw Object.assign(new Error('Shortage not found'), { http: 404 });
      if (!cityRowInScope(scope, row.rows[0].city_id)) throw Object.assign(new Error('Shortage not found'), { http: 404 });
      if (row.rows[0].status !== 'open') throw Object.assign(new Error('Shortage is already resolved.'), { http: 409 });
      const updated = await client.query(
        `UPDATE ocp_stock_shortages
            SET status = 'resolved',
                resolved_by = $1,
                resolved_at = NOW(),
                resolution_note = $2
          WHERE id = $3
          RETURNING id, status, resolved_at`,
        [req.user?.id ?? null, note, id]
      );
      return updated.rows[0];
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 409) return errorResponse(res, err.message, 409);
    throw err;
  }

  logger.info('OCP stock shortage resolved', { shortageId: id, by: req.user?.id });
  return successResponse(res, out, 'Shortage resolved');
});

// ── Settlements inbox (OCP → city admin) ────────────────────────────────────

/** GET /api/admin/ocp/settlements?status=pending — OCP cash settlements. */
export const listSettlements = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureOcpTables())) return successResponse(res, [], 'Settlements');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Settlements');
  const params: unknown[] = [];
  let where = '1=1';
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
  if (['pending', 'received', 'rejected'].includes(status)) {
    params.push(status);
    where += ` AND s.status = $${params.length}`;
  }
  if (typeof req.query.ocp_id === 'string' && req.query.ocp_id) {
    params.push(req.query.ocp_id);
    where += ` AND s.ocp_id = $${params.length}`;
  }
  if (!scope.unrestricted && scope.cityId && scope.dbReady) {
    params.push(scope.cityId);
    where += ` AND o.city_id = $${params.length}`;
  }
  const result = await query<DbRow<{ amount: string }>>(
    `SELECT s.id, s.amount, s.status, s.requested_at, s.received_at,
            o.name AS ocp_name, o.id AS ocp_id,
            (SELECT COUNT(*) FROM ocp_stock_shortages sh WHERE sh.ocp_id = o.id AND sh.status = 'open') AS open_shortage_count,
            (SELECT COUNT(*) FROM ocp_settlement_orders so WHERE so.settlement_id = s.id) AS order_count
       FROM ocp_settlements s
       JOIN order_collection_points o ON o.id = s.ocp_id
      WHERE ${where}
      ORDER BY s.requested_at DESC
      LIMIT 100`,
    params
  );
  return successResponse(res, result.rows.map((r) => ({
    ...r,
    amount: parseFloat(r.amount),
    order_count: Number(r.order_count),
    open_shortage_count: Number(r.open_shortage_count || 0),
  })), 'Settlements');
});

/**
 * POST /api/admin/ocp/settlements/:id/receive — confirm receipt of OCP cash.
 * Requires the admin's PASSWORD (re-auth) in the body. Atomically marks the
 * settlement received and flags its orders settled. Idempotent (double-receive
 * is a clean 409).
 */
export const receiveSettlement = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureOcpTables())) return errorResponse(res, 'OCP module is being set up. Please try again shortly.', 503);
  const { id } = req.params;
  const password = String(req.body?.password || '');
  if (!password) return errorResponse(res, 'Enter your password to confirm receipt.', 400);
  const scope = await resolveCityScope(req);

  // Re-verify the admin's own password.
  const u = await query('SELECT password_hash FROM users WHERE id = $1', [req.user?.id]);
  const hash = u.rows[0]?.password_hash;
  if (!hash || !(await bcrypt.compare(password, hash))) {
    return errorResponse(res, 'Incorrect password.', 400);
  }

  let out;
  try {
    out = await withTransaction(async (client) => {
      const s = await client.query(
        `SELECT s.id, s.status, s.amount, s.ocp_id, o.city_id
           FROM ocp_settlements s
           JOIN order_collection_points o ON o.id = s.ocp_id
          WHERE s.id = $1
          FOR UPDATE OF s`,
        [id]
      );
      if (s.rows.length === 0) throw Object.assign(new Error('Settlement not found'), { http: 404 });
      if (!cityRowInScope(scope, s.rows[0].city_id)) throw Object.assign(new Error('Settlement not found'), { http: 404 });
      const shortages = await client.query(
        `SELECT COUNT(*)::int AS count FROM ocp_stock_shortages WHERE ocp_id = $1 AND status = 'open'`,
        [s.rows[0].ocp_id]
      );
      if (Number(shortages.rows[0]?.count || 0) > 0) {
        throw Object.assign(new Error('Resolve this OCP stock shortage before receiving settlement cash.'), { http: 409 });
      }
      if (s.rows[0].status !== 'pending') throw Object.assign(new Error('This settlement was already processed.'), { http: 409 });
      await client.query(
        `UPDATE ocp_settlements SET status = 'received', received_at = NOW(), received_by = $1 WHERE id = $2`,
        [req.user?.id ?? null, id]
      );
      await client.query(
        `UPDATE orders SET ocp_payment_settled = TRUE, updated_at = NOW()
          WHERE id IN (SELECT order_id FROM ocp_settlement_orders WHERE settlement_id = $1)`,
        [id]
      );
      return { id, status: 'received', amount: parseFloat(s.rows[0].amount) };
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 409) return errorResponse(res, err.message, 409);
    throw err;
  }
  logger.info('OCP settlement received', { settlementId: id, by: req.user?.id });
  return successResponse(res, out, 'Settlement received');
});

/** POST /api/admin/ocp/settlements/:id/reject — reject; frees its orders to re-settle. */
export const rejectSettlement = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);
  let out;
  try {
    out = await withTransaction(async (client) => {
      const s = await client.query(
        `SELECT s.id, s.status, o.city_id
           FROM ocp_settlements s
           JOIN order_collection_points o ON o.id = s.ocp_id
          WHERE s.id = $1
          FOR UPDATE OF s`,
        [id]
      );
      if (s.rows.length === 0) throw Object.assign(new Error('Settlement not found'), { http: 404 });
      if (!cityRowInScope(scope, s.rows[0].city_id)) throw Object.assign(new Error('Settlement not found'), { http: 404 });
      if (s.rows[0].status !== 'pending') throw Object.assign(new Error('This settlement was already processed.'), { http: 409 });
      // Free the orders (delete membership) so they re-enter the OCP's due.
      await client.query('DELETE FROM ocp_settlement_orders WHERE settlement_id = $1', [id]);
      await client.query(`UPDATE ocp_settlements SET status = 'rejected', received_by = $1 WHERE id = $2`, [req.user?.id ?? null, id]);
      return { id, status: 'rejected' };
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 409) return errorResponse(res, err.message, 409);
    throw err;
  }
  logger.info('OCP settlement rejected', { settlementId: id, by: req.user?.id });
  return successResponse(res, out, 'Settlement rejected');
});

/** DELETE /api/admin/ocp/:id — soft delete. */
export const deleteOcp = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const owner = await query(`SELECT city_id FROM order_collection_points WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (owner.rows.length === 0 || !cityRowInScope(await resolveCityScope(req), owner.rows[0].city_id)) {
    return notFoundResponse(res, 'OCP not found');
  }
  const result = await query(
    `UPDATE order_collection_points SET deleted_at = NOW(), status = 'disabled', updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'OCP not found');
  logger.info('OCP deleted', { ocpId: id, by: req.user?.id });
  return successResponse(res, { id }, 'OCP removed');
});
