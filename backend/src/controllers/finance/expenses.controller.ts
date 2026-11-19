// ============================================================================
// FINANCE — EXPENSES (admin). One `expenses` ledger for all money-out:
//   • stock_purchase — with grading that adds to system stock A/B/C
//   • rider_payment   — salary/commission/other to a rider
//   • worker_payment  — created by the workers module
//   • other           — any other expense (rent, utilities, …)
// City-scoped; super-admin may target/scan any city. All writes transactional.
// ============================================================================

import { asCaughtError, caughtMessage } from '../../utils/caughtError';
import { Request, Response } from 'express';
import { query, withTransaction, type DbRow } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse, notFoundResponse } from '../../utils/response';
import { resolveCityScope } from '../../utils/cityScope';
import { qualityStockColumn } from '../../utils/unitPricing';
import { recordStockMovement } from '../../utils/systemStock';
import { ensureFinanceTables } from '../../config/financeSchema';
import logger from '../../utils/logger';
import { isThisMonthSql, isTodaySql, localDate, localTs } from '../../utils/businessTime';
import { approvalForValue } from '../../utils/adminApproval';

/**
 * Money leaving through the expense ledger (other expenses, rider and worker
 * payments) follows the same second-admin rule as waste and refunds. Before
 * this a single admin could book any amount with no proof and no co-signer —
 * the simplest way to explain away missing cash. The owner (super admin) is
 * not asked for a co-signer; stock purchases are not covered here because the
 * goods they bring in are checked by the grading mass balance + shelf counts.
 */
export async function approvalForExpense(
  client: Parameters<typeof approvalForValue>[0],
  req: Request,
  amount: number,
  label: string
): Promise<string | null> {
  if (req.user?.role === 'super_admin') return null;
  const a = await approvalForValue(client, req, amount, { label, kind: 'expense' });
  return a.approvedBy;
}


const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Ledger dates come from admin-typed inputs. Accept only a parseable date in
 * [2020-01-01, now + 1 day] — anything else falls back to NOW so a typo can't
 * backdate/postdate the money ledger into another fiscal period.
 */
export function sanitizeLedgerDate(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    const now = Date.now();
    if (
      !Number.isNaN(d.getTime()) &&
      d.getTime() >= new Date('2020-01-01T00:00:00Z').getTime() &&
      d.getTime() <= now + 24 * 60 * 60 * 1000
    ) {
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}

/**
 * Ledger date for this request. A non-super admin may back-date at most
 * LEDGER_BACKDATE_DAYS (default 7): older entries would silently change a
 * period whose profit may already have been paid out to shareholders.
 */
export const LEDGER_BACKDATE_DAYS = Math.max(0, Number(process.env.LEDGER_BACKDATE_DAYS || 7));
export function ledgerDateFor(req: Request, value: unknown): { iso: string; error?: undefined } | { iso?: undefined; error: string } {
  const iso = sanitizeLedgerDate(value);
  if (req.user?.role === 'super_admin') return { iso };
  const oldest = Date.now() - LEDGER_BACKDATE_DAYS * 24 * 60 * 60 * 1000;
  if (new Date(iso).getTime() < oldest) {
    return { error: `Entries dated more than ${LEDGER_BACKDATE_DAYS} days back change a closed period — ask the super admin.` };
  }
  return { iso };
}

/** The city an expense belongs to: a scoped admin's city, else the body's city. */
function effectiveCityId(scope: { cityId: string | null; unrestricted: boolean }, bodyCityId?: unknown): string | null {
  if (!scope.unrestricted && scope.cityId) return scope.cityId;
  return typeof bodyCityId === 'string' && bodyCityId ? bodyCityId : scope.cityId;
}

// ── GET /api/finance/expenses — filtered list + totals ───────────────────────
// Filters: type, period(today|month|day), month+year, date(YYYY-MM-DD), city_id(super).
export const listExpenses = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return successResponse(res, { expenses: [], total: 0, byType: {} }, 'Expenses');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, { expenses: [], total: 0, byType: {} }, 'Expenses');

  const params: unknown[] = [];
  const where: string[] = ['1=1'];

  if (!scope.unrestricted && scope.cityId) { params.push(scope.cityId); where.push(`e.city_id = $${params.length}`); }
  else if (typeof req.query.city_id === 'string' && req.query.city_id) { params.push(req.query.city_id); where.push(`e.city_id = $${params.length}`); }

  const type = typeof req.query.type === 'string' ? req.query.type : '';
  if (['stock_purchase', 'rider_payment', 'worker_payment', 'other'].includes(type)) {
    params.push(type); where.push(`e.type = $${params.length}`);
  }

  // Date filters (most specific wins).
  const period = typeof req.query.period === 'string' ? req.query.period : '';
  const month = parseInt(String(req.query.month || ''), 10);
  const year = parseInt(String(req.query.year || ''), 10);
  const day = typeof req.query.date === 'string' ? req.query.date : '';
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    params.push(day); where.push(`${localDate('e.incurred_at')} = $${params.length}::date`);
  } else if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year)) {
    params.push(year); const y = params.length;
    params.push(month); const mo = params.length;
    where.push(`EXTRACT(YEAR FROM ${localTs('e.incurred_at')}) = $${y} AND EXTRACT(MONTH FROM ${localTs('e.incurred_at')}) = $${mo}`);
  } else if (period === 'today') {
    where.push(isTodaySql('e.incurred_at'));
  } else if (period === 'month') {
    where.push(isThisMonthSql('e.incurred_at'));
  }

  const rows = await query<DbRow<{ amount: string; type: string }>>(
    `SELECT e.id, e.type, e.category, e.amount, e.comment, e.ref_type, e.ref_id,
            e.for_month, e.incurred_at, e.city_id,
            COALESCE(pr.name_en, w.name, ru.full_name) AS ref_label,
            sp.supplier_name, sp.bill_number, sp.bill_photo_url,
            sc.name AS city_name
       FROM expenses e
       LEFT JOIN stock_purchases sp ON e.ref_type = 'stock_purchase' AND sp.id = e.ref_id
       LEFT JOIN products pr ON pr.id = sp.product_id
       LEFT JOIN workers w ON e.ref_type = 'worker_payment' AND w.id = e.ref_id
       LEFT JOIN riders rd ON e.ref_type = 'rider_payment' AND rd.id = e.ref_id
       LEFT JOIN users ru ON ru.id = rd.user_id
       LEFT JOIN service_cities sc ON sc.id = e.city_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.incurred_at DESC
      LIMIT 500`,
    params
  );

  let total = 0;
  const byType: Record<string, number> = {};
  for (const r of rows.rows) {
    const a = parseFloat(r.amount) || 0;
    total += a;
    byType[r.type] = (byType[r.type] || 0) + a;
  }
  return successResponse(
    res,
    { expenses: rows.rows.map((r) => ({ ...r, amount: parseFloat(r.amount) })), total: Math.round(total * 100) / 100, byType },
    'Expenses'
  );
});

// ── POST /api/finance/expenses — create an "other" expense ───────────────────
export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance is being set up. Try again shortly.', 503);
  const scope = await resolveCityScope(req);
  const amount = num(req.body?.amount);
  const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
  if (!category) return errorResponse(res, 'Choose an expense type.', 400);
  // An expense of Rs 0 is not an expense (G36) — it only cluttered the books.
  if (!Number.isFinite(amount) || amount <= 0) return errorResponse(res, 'Enter an amount above 0.', 400);
  const cityId = effectiveCityId(scope, req.body?.city_id);
  const ledger = ledgerDateFor(req, req.body?.incurred_at);
  if (ledger.error) return errorResponse(res, ledger.error, 400);
  const incurredAt = ledger.iso;

  let r;
  try {
    r = await withTransaction(async (client) => {
      await approvalForExpense(client, req, amount, 'an expense');
      return client.query(
        `INSERT INTO expenses (city_id, type, category, amount, comment, incurred_at, created_by)
         VALUES ($1, 'other', $2, $3, $4, $5, $6) RETURNING id`,
        [cityId, category, amount, req.body?.comment || null, incurredAt, req.user?.id ?? null]
      );
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Expense added', { id: r.rows[0].id, category, amount, by: req.user?.id });
  return successResponse(res, { id: r.rows[0].id }, 'Expense added');
});

// A stock purchase as entered: everything validated, nothing applied yet.
interface PurchaseDraft {
  product_id: string; raw_weight: number; purchase_price: number;
  grade_a: number; grade_b: number; grade_c: number; waste: number;
  supplier_name: string; supplier_phone: string | null; bill_number: string | null;
  comment: string | null; purchased_at: string; city_id_hint: string | null;
}

/** Validate what was typed. A string = the problem to show. */
function readPurchaseDraft(req: Request): PurchaseDraft | string {
  const product_id = req.body?.product_id;
  if (!product_id) return 'Select a product.';
  const rawWeight = num(req.body?.raw_weight);
  const price = num(req.body?.purchase_price);
  const gA = num(req.body?.grade_a) || 0;
  const gB = num(req.body?.grade_b) || 0;
  const gC = num(req.body?.grade_c) || 0;
  const waste = num(req.body?.waste) || 0;
  if (!Number.isFinite(price) || price < 0) return 'Enter a valid purchase price.';
  if (!Number.isFinite(rawWeight) || rawWeight <= 0) return 'Enter the raw weight.';
  if ([gA, gB, gC, waste].some((x) => x < 0)) return 'Weights cannot be negative.';
  // Mass conservation: everything bought must be accounted for. The graded
  // weights (A+B+C) plus waste MUST equal the raw weight (3-decimal tolerance).
  const gradedTotal = Math.round((gA + gB + gC + waste) * 1000) / 1000;
  const rawRounded = Math.round(rawWeight * 1000) / 1000;
  if (Math.abs(gradedTotal - rawRounded) > 0.001) {
    return `Quality A + B + C + waste (${gradedTotal}) must equal the raw weight (${rawRounded}).`;
  }
  // Who the stock was bought from (required) and the bill (optional): without
  // them a purchase price can never be checked with the seller.
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const supplierName = text(req.body?.supplier_name, 120);
  if (supplierName.length < 2) return 'Enter who the stock was bought from (supplier / mandi seller).';
  const ledger = ledgerDateFor(req, req.body?.purchased_at);
  if (ledger.error) return ledger.error;
  return {
    product_id, raw_weight: rawWeight, purchase_price: price, grade_a: gA, grade_b: gB, grade_c: gC, waste,
    supplier_name: supplierName, supplier_phone: text(req.body?.supplier_phone, 20) || null,
    bill_number: text(req.body?.bill_number, 60) || null, comment: req.body?.comment || null,
    purchased_at: ledger.iso ?? new Date().toISOString(), city_id_hint: req.body?.city_id ?? null,
  };
}

/** Put a validated purchase into stock and the ledger. Throws { http } when it cannot be applied. */
async function applyStockPurchase(
  client: Parameters<typeof recordStockMovement>[0],
  d: PurchaseDraft,
  billPhotoUrl: string | null,
  scope: Awaited<ReturnType<typeof resolveCityScope>>,
  createdBy: string | null
): Promise<{ id: string }> {
  // Product must exist + (for scoped admins) be in their city.
  const prod = await client.query('SELECT id, city_id FROM products WHERE id = $1 FOR UPDATE', [d.product_id]);
  if (prod.rows.length === 0) throw Object.assign(new Error('Product not found'), { http: 404 });
  const productCity = prod.rows[0].city_id;
  if (!scope.unrestricted && scope.cityId && productCity !== scope.cityId) {
    throw Object.assign(new Error('Product not found'), { http: 404 });
  }
  const cityId = productCity || effectiveCityId(scope, d.city_id_hint);

  const sp = await client.query(
    `INSERT INTO stock_purchases (city_id, product_id, purchased_at, raw_weight, purchase_price, grade_a, grade_b, grade_c, waste, created_by,
                                  supplier_name, supplier_phone, bill_number, bill_photo_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [cityId, d.product_id, d.purchased_at, d.raw_weight, d.purchase_price, d.grade_a, d.grade_b, d.grade_c, d.waste, createdBy,
      d.supplier_name, d.supplier_phone, d.bill_number, billPhotoUrl]
  );
  const purchaseId = sp.rows[0].id;

  // Grading adds to the SAME system stock buckets the storefront sells from.
  const grades: [string, number][] = [['A', d.grade_a], ['B', d.grade_b], ['C', d.grade_c]];
  for (const [q, amt] of grades) {
    if (amt <= 0) continue;
    const col = qualityStockColumn(q);
    await client.query(`UPDATE products SET ${col} = ${col} + $1, updated_at = NOW() WHERE id = $2`, [amt, d.product_id]);
    await recordStockMovement(client, {
      productId: d.product_id, quality: q, cityId, delta: amt, reason: 'purchase',
      createdBy, note: `purchased (grade ${q})`,
    });
  }

  // The purchase price is the expense (one row, linked to the detail).
  await client.query(
    `INSERT INTO expenses (city_id, type, category, amount, comment, ref_type, ref_id, incurred_at, created_by)
     VALUES ($1, 'stock_purchase', 'stock', $2, $3, 'stock_purchase', $4, $5, $6)`,
    [cityId, d.purchase_price, d.comment, purchaseId, d.purchased_at, createdBy]
  );
  return { id: purchaseId };
}

const canApprovePurchases = (req: Request): boolean => {
  const perms = req.adminPermissions ?? [];
  return perms.includes('*') || perms.includes('finance.stock_purchase.approve');
};

// ── POST /api/finance/stock-purchase — buy stock with grading (adds to stock) ─
// Staff entries wait for the city admin (owner decision J1); an approver's own
// entry applies at once.
export const createStockPurchase = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance is being set up. Try again shortly.', 503);
  const scope = await resolveCityScope(req);
  const draft = readPurchaseDraft(req);
  if (typeof draft === 'string') return errorResponse(res, draft, 400);
  const billPhotoUrl = (req.file as Express.Multer.File | undefined)?.url || null;

  if (!canApprovePurchases(req)) {
    // Same checks as a direct purchase (product exists, in this admin's city) before it is queued.
    const prod = await query('SELECT id, city_id FROM products WHERE id = $1', [draft.product_id]);
    const row = prod.rows[0];
    if (!row || (!scope.unrestricted && scope.cityId && row.city_id !== scope.cityId)) return notFoundResponse(res, 'Product not found');
    try {
      const q = await query(
        `INSERT INTO purchase_requests (city_id, product_id, payload, bill_photo_url, requested_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [row.city_id ?? effectiveCityId(scope, draft.city_id_hint), draft.product_id, JSON.stringify(draft), billPhotoUrl, req.user?.id ?? null]
      );
      logger.info('Stock purchase waiting for approval', { id: q.rows[0].id, by: req.user?.id });
      return successResponse(res, { id: q.rows[0].id, status: 'pending' }, 'Entered — it will be added to stock once the city admin approves it.');
    } catch (errCaught: unknown) {
      const err = asCaughtError(errCaught);
      if (err?.code === '42P01') return errorResponse(res, 'Purchase approvals are being set up. Try again shortly.', 503);
      throw err;
    }
  }

  let out: { id: string };
  try {
    out = await withTransaction((client) => applyStockPurchase(client, draft, billPhotoUrl, scope, req.user?.id ?? null));
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock purchased', { id: out.id, product_id: draft.product_id, price: draft.purchase_price, by: req.user?.id });
  return successResponse(res, out, 'Stock purchased & added');
});

// ── Purchase approvals (owner decision J1) ───────────────────────────────────
// GET  /finance/purchase-requests             — the queue (an approver: pending of their city; staff: their own)
// POST /finance/purchase-requests/:id/approve — apply one
// POST /finance/purchase-requests/:id/reject  — refuse one (reason optional)
// POST /finance/purchase-requests/approve-all — apply every pending one in scope, each on its own
export const listPurchaseRequests = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const params: unknown[] = [];
  let where = "WHERE r.status = 'pending'";
  if (!scope.unrestricted && scope.cityId) { params.push(scope.cityId); where += ` AND r.city_id = $${params.length}`; }
  if (!canApprovePurchases(req)) { params.push(req.user?.id ?? null); where += ` AND r.requested_by = $${params.length}`; }
  try {
    const rows = await query(
      `SELECT r.id, r.city_id, r.product_id, p.name_en AS product_name, r.payload, r.bill_photo_url, r.requested_at,
              r.requested_by, u.full_name AS requested_by_name
         FROM purchase_requests r
         LEFT JOIN products p ON p.id = r.product_id
         LEFT JOIN users u ON u.id = r.requested_by
         ${where} ORDER BY r.requested_at ASC LIMIT 200`,
      params
    );
    return successResponse(res, { requests: rows.rows, can_approve: canApprovePurchases(req) }, 'Purchase requests');
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.code === '42P01') return successResponse(res, { requests: [], can_approve: canApprovePurchases(req) }, 'Purchase requests');
    throw err;
  }
});

type Decision = { ok: true; id: string } | { ok: false; status: number; message: string };

async function decidePurchaseRequest(req: Request, id: string, approve: boolean, note: string | null): Promise<Decision> {
  const scope = await resolveCityScope(req);
  const userId = req.user?.id ?? null;
  try {
    return await withTransaction(async (client): Promise<Decision> => {
      const found = await client.query(`SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE`, [id]);
      const r = found.rows[0];
      if (!r || (!scope.unrestricted && scope.cityId && r.city_id !== scope.cityId)) return { ok: false, status: 404, message: 'Request not found' };
      if (r.status !== 'pending') return { ok: false, status: 409, message: `This purchase was already ${r.status}.` };
      // Whoever entered a purchase cannot be the one who accepts it.
      if (approve && r.requested_by && r.requested_by === userId) return { ok: false, status: 403, message: 'You cannot approve a purchase you entered yourself.' };
      let purchaseId: string | null = null;
      if (approve) {
        const done = await applyStockPurchase(client, r.payload as PurchaseDraft, r.bill_photo_url, scope, r.requested_by);
        purchaseId = done.id;
      }
      await client.query(
        `UPDATE purchase_requests SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = $4, purchase_id = $5 WHERE id = $1`,
        [id, approve ? 'approved' : 'rejected', userId, note, purchaseId]
      );
      return { ok: true, id };
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http) return { ok: false, status: err.http, message: caughtMessage(errCaught, 'Could not complete this request.') };
    throw err;
  }
}

export const approvePurchaseRequest = asyncHandler(async (req: Request, res: Response) => {
  const d = await decidePurchaseRequest(req, req.params.id, true, null);
  if (!d.ok) return errorResponse(res, d.message, d.status);
  logger.info('Stock purchase approved', { id: d.id, by: req.user?.id });
  return successResponse(res, { id: d.id, status: 'approved' }, 'Approved — stock added.');
});

export const rejectPurchaseRequest = asyncHandler(async (req: Request, res: Response) => {
  const note = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) || null : null;
  const d = await decidePurchaseRequest(req, req.params.id, false, note);
  if (!d.ok) return errorResponse(res, d.message, d.status);
  logger.info('Stock purchase rejected', { id: d.id, by: req.user?.id });
  return successResponse(res, { id: d.id, status: 'rejected' }, 'Rejected.');
});

export const approveAllPurchaseRequests = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const params: unknown[] = [];
  let where = "WHERE status = 'pending'";
  if (!scope.unrestricted && scope.cityId) { params.push(scope.cityId); where += ` AND city_id = $${params.length}`; }
  const pending = await query(`SELECT id FROM purchase_requests ${where} ORDER BY requested_at ASC LIMIT 200`, params);
  let approved = 0;
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const row of pending.rows) {
    const d = await decidePurchaseRequest(req, row.id, true, null);
    if (d.ok) approved++; else skipped.push({ id: row.id, reason: d.message });
  }
  logger.info('Stock purchases approved in bulk', { approved, skipped: skipped.length, by: req.user?.id });
  return successResponse(res, { approved, skipped }, skipped.length ? `Approved ${approved}; ${skipped.length} could not be approved.` : `Approved ${approved}.`);
});

// ── POST /api/finance/rider-payment — pay a rider (logged as an expense) ─────
export const createRiderPayment = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance is being set up. Try again shortly.', 503);
  const scope = await resolveCityScope(req);
  const { rider_id } = req.body;
  const amount = num(req.body?.amount);
  const kind = ['salary', 'commission', 'other'].includes(req.body?.category) ? req.body.category : 'other';
  if (!rider_id) return errorResponse(res, 'Select a rider.', 400);
  if (!Number.isFinite(amount) || amount <= 0) return errorResponse(res, 'Enter a valid amount.', 400);

  const rider = await query(`SELECT id, city_id FROM riders WHERE id = $1 AND deleted_at IS NULL`, [rider_id]);
  if (rider.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  const riderCity = rider.rows[0].city_id;
  if (!scope.unrestricted && scope.cityId && riderCity && riderCity !== scope.cityId) {
    return notFoundResponse(res, 'Rider not found');
  }
  const ledger = ledgerDateFor(req, req.body?.paid_at);
  if (ledger.error) return errorResponse(res, ledger.error, 400);
  const incurredAt = ledger.iso;

  let r;
  try {
    r = await withTransaction(async (client) => {
      await approvalForExpense(client, req, amount, 'a rider payment');
      return client.query(
        `INSERT INTO expenses (city_id, type, category, amount, comment, ref_type, ref_id, for_month, incurred_at, created_by)
         VALUES ($1, 'rider_payment', $2, $3, $4, 'rider_payment', $5, $6, $7, $8) RETURNING id`,
        [riderCity || effectiveCityId(scope), kind, amount, req.body?.comment || null, rider_id, req.body?.for_month || null, incurredAt, req.user?.id ?? null]
      );
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Rider payment recorded', { id: r.rows[0].id, rider_id, amount, kind, by: req.user?.id });
  return successResponse(res, { id: r.rows[0].id }, 'Rider payment recorded');
});

// ── GET /api/finance/products — product picker for stock purchasing ──────────
export const listFinanceProducts = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Products');
  const params: unknown[] = [];
  let where = 'p.is_active = TRUE';
  if (!scope.unrestricted && scope.cityId) { params.push(scope.cityId); where += ` AND p.city_id = $${params.length}`; }
  else if (typeof req.query.city_id === 'string' && req.query.city_id) { params.push(req.query.city_id); where += ` AND p.city_id = $${params.length}`; }
  const r = await query(
    `SELECT p.id, p.name_en AS name, p.unit_type, c.name_en AS category_name
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE ${where} ORDER BY p.name_en ASC LIMIT 1000`,
    params
  );
  return successResponse(res, r.rows, 'Products');
});

// ── GET /api/finance/riders — rider picker for rider payments ────────────────
export const listFinanceRiders = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Riders');
  const params: unknown[] = [];
  let where = 'r.deleted_at IS NULL';
  if (!scope.unrestricted && scope.cityId) { params.push(scope.cityId); where += ` AND r.city_id = $${params.length}`; }
  const r = await query(
    `SELECT r.id, u.full_name AS name, r.status
       FROM riders r JOIN users u ON u.id = r.user_id
      WHERE ${where} ORDER BY u.full_name ASC LIMIT 500`,
    params
  );
  return successResponse(res, r.rows, 'Riders');
});
