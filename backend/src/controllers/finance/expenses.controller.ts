// ============================================================================
// FINANCE — EXPENSES (admin). One `expenses` ledger for all money-out:
//   • stock_purchase — with grading that adds to system stock A/B/C
//   • rider_payment   — salary/commission/other to a rider
//   • worker_payment  — created by the workers module
//   • other           — any other expense (rent, utilities, …)
// City-scoped; super-admin may target/scan any city. All writes transactional.
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse, notFoundResponse } from '../../utils/response';
import { resolveCityScope } from '../../utils/cityScope';
import { qualityStockColumn } from '../../utils/unitPricing';
import { recordStockMovement } from '../../utils/systemStock';
import { ensureFinanceTables } from '../../config/financeSchema';
import logger from '../../utils/logger';

const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
};

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

  const params: any[] = [];
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
    params.push(day); where.push(`e.incurred_at::date = $${params.length}::date`);
  } else if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year)) {
    params.push(year); const y = params.length;
    params.push(month); const mo = params.length;
    where.push(`EXTRACT(YEAR FROM e.incurred_at) = $${y} AND EXTRACT(MONTH FROM e.incurred_at) = $${mo}`);
  } else if (period === 'today') {
    where.push(`e.incurred_at::date = CURRENT_DATE`);
  } else if (period === 'month') {
    where.push(`date_trunc('month', e.incurred_at) = date_trunc('month', CURRENT_DATE)`);
  }

  const rows = await query(
    `SELECT e.id, e.type, e.category, e.amount, e.comment, e.ref_type, e.ref_id,
            e.for_month, e.incurred_at, e.city_id,
            COALESCE(pr.name_en, w.name, ru.full_name) AS ref_label,
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
    { expenses: rows.rows.map((r: any) => ({ ...r, amount: parseFloat(r.amount) })), total: Math.round(total * 100) / 100, byType },
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
  if (!Number.isFinite(amount) || amount < 0) return errorResponse(res, 'Enter a valid amount.', 400);
  const cityId = effectiveCityId(scope, req.body?.city_id);
  const incurredAt = typeof req.body?.incurred_at === 'string' && req.body.incurred_at ? req.body.incurred_at : new Date().toISOString();

  const r = await query(
    `INSERT INTO expenses (city_id, type, category, amount, comment, incurred_at, created_by)
     VALUES ($1, 'other', $2, $3, $4, $5, $6) RETURNING id`,
    [cityId, category, amount, req.body?.comment || null, incurredAt, req.user?.id ?? null]
  );
  logger.info('Expense added', { id: r.rows[0].id, category, amount, by: req.user?.id });
  return successResponse(res, { id: r.rows[0].id }, 'Expense added');
});

// ── POST /api/finance/stock-purchase — buy stock with grading (adds to stock) ─
export const createStockPurchase = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance is being set up. Try again shortly.', 503);
  const scope = await resolveCityScope(req);
  const { product_id } = req.body;
  if (!product_id) return errorResponse(res, 'Select a product.', 400);
  const rawWeight = num(req.body?.raw_weight);
  const price = num(req.body?.purchase_price);
  const gA = num(req.body?.grade_a) || 0;
  const gB = num(req.body?.grade_b) || 0;
  const gC = num(req.body?.grade_c) || 0;
  const waste = num(req.body?.waste) || 0;
  if (!Number.isFinite(price) || price < 0) return errorResponse(res, 'Enter a valid purchase price.', 400);
  if ([gA, gB, gC, waste].some((x) => x < 0)) return errorResponse(res, 'Weights cannot be negative.', 400);
  if (gA + gB + gC + waste <= 0) return errorResponse(res, 'Enter at least one graded weight.', 400);
  const purchasedAt = typeof req.body?.purchased_at === 'string' && req.body.purchased_at ? req.body.purchased_at : new Date().toISOString();

  let out: any;
  try {
    out = await withTransaction(async (client) => {
      // Product must exist + (for scoped admins) be in their city.
      const prod = await client.query('SELECT id, city_id FROM products WHERE id = $1 FOR UPDATE', [product_id]);
      if (prod.rows.length === 0) throw Object.assign(new Error('Product not found'), { http: 404 });
      const productCity = prod.rows[0].city_id;
      if (!scope.unrestricted && scope.cityId && productCity !== scope.cityId) {
        throw Object.assign(new Error('Product not found'), { http: 404 });
      }
      const cityId = productCity || effectiveCityId(scope, req.body?.city_id);

      const sp = await client.query(
        `INSERT INTO stock_purchases (city_id, product_id, purchased_at, raw_weight, purchase_price, grade_a, grade_b, grade_c, waste, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [cityId, product_id, purchasedAt, Number.isFinite(rawWeight) ? rawWeight : 0, price, gA, gB, gC, waste, req.user?.id ?? null]
      );
      const purchaseId = sp.rows[0].id;

      // Grading adds to the SAME system stock buckets the storefront sells from.
      const grades: [string, number][] = [['A', gA], ['B', gB], ['C', gC]];
      for (const [q, amt] of grades) {
        if (amt <= 0) continue;
        const col = qualityStockColumn(q);
        await client.query(`UPDATE products SET ${col} = ${col} + $1, updated_at = NOW() WHERE id = $2`, [amt, product_id]);
        await recordStockMovement(client, {
          productId: product_id, quality: q, cityId, delta: amt, reason: 'purchase',
          createdBy: req.user?.id ?? null, note: `purchased (grade ${q})`,
        });
      }

      // The purchase price is the expense (one row, linked to the detail).
      await client.query(
        `INSERT INTO expenses (city_id, type, category, amount, comment, ref_type, ref_id, incurred_at, created_by)
         VALUES ($1, 'stock_purchase', 'stock', $2, $3, 'stock_purchase', $4, $5, $6)`,
        [cityId, price, req.body?.comment || null, purchaseId, purchasedAt, req.user?.id ?? null]
      );
      return { id: purchaseId };
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Stock purchased', { id: out.id, product_id, price, by: req.user?.id });
  return successResponse(res, out, 'Stock purchased & added');
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
  const incurredAt = typeof req.body?.paid_at === 'string' && req.body.paid_at ? req.body.paid_at : new Date().toISOString();

  const r = await query(
    `INSERT INTO expenses (city_id, type, category, amount, comment, ref_type, ref_id, for_month, incurred_at, created_by)
     VALUES ($1, 'rider_payment', $2, $3, $4, 'rider_payment', $5, $6, $7, $8) RETURNING id`,
    [riderCity || effectiveCityId(scope), kind, amount, req.body?.comment || null, rider_id, req.body?.for_month || null, incurredAt, req.user?.id ?? null]
  );
  logger.info('Rider payment recorded', { id: r.rows[0].id, rider_id, amount, kind, by: req.user?.id });
  return successResponse(res, { id: r.rows[0].id }, 'Rider payment recorded');
});

// ── GET /api/finance/products — product picker for stock purchasing ──────────
export const listFinanceProducts = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Products');
  const params: any[] = [];
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
  const params: any[] = [];
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
