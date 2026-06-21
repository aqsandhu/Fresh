// ============================================================================
// FINANCE — PROFIT + PROFIT SHARING + SHAREHOLDERS (admin).
//
//   profit (period, city) = Σ delivered-order sales − Σ expenses
//   FreshBazar share (if enabled) = per-order fixed | per-category % of sale |
//                                   % of profit margin   (super-admin edits only)
//   distributable = profit − FreshBazar share
//   each shareholder's share = distributable × share%   (city franchise holders)
//   balance owed = share − received payouts (negative => over-paid)
//
// Payouts are NOT expenses (they distribute profit, they don't reduce it).
// City-scoped; the profit-sharing FORMULA and shareholder creation are
// super-admin only (enforced inline). City admins view + pay + (de)activate.
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse, notFoundResponse, forbiddenResponse } from '../../utils/response';
import { resolveCityScope } from '../../utils/cityScope';
import { ensureFinanceTables } from '../../config/financeSchema';
import { computeCityProfit, periodFromQuery } from '../../utils/profitCalc';
import logger from '../../utils/logger';

const num = (v: unknown): number => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : NaN; };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isSuper = (req: Request) => req.user?.role === 'super_admin';

/** Build a period SQL fragment + params for a timestamp column. */
function periodFilter(req: Request, col: string, startIndex: number): { sql: string; params: any[] } {
  const period = typeof req.query.period === 'string' ? req.query.period : '';
  const month = parseInt(String(req.query.month || ''), 10);
  const year = parseInt(String(req.query.year || ''), 10);
  const day = typeof req.query.date === 'string' ? req.query.date : '';
  const params: any[] = [];
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    params.push(day);
    return { sql: ` AND ${col}::date = $${startIndex}::date`, params };
  }
  if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year)) {
    params.push(year, month);
    return { sql: ` AND EXTRACT(YEAR FROM ${col}) = $${startIndex} AND EXTRACT(MONTH FROM ${col}) = $${startIndex + 1}`, params };
  }
  if (period === 'today') return { sql: ` AND ${col}::date = CURRENT_DATE`, params };
  if (period === 'month') return { sql: ` AND date_trunc('month', ${col}) = date_trunc('month', CURRENT_DATE)`, params };
  return { sql: '', params };
}

// ── GET /api/finance/profit ──────────────────────────────────────────────────
export const getProfit = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return successResponse(res, { needsCity: false, ready: false }, 'Profit');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, { needsCity: true }, 'Profit');
  const cityId = scope.cityId;
  if (!cityId) return successResponse(res, { needsCity: true }, 'Profit'); // super-admin must pick a city

  // Shared calc — same numbers the shareholder portal shows.
  const cp = await computeCityProfit(cityId, periodFromQuery(req.query));
  const { totalSale, orderCount, totalExpenses, inventoryCost, operatingExpenses, profit, freshbazarShare, distributable } = cp;

  // Per-shareholder share + received (period) + pending (period) + balance.
  const sh = await query(
    `SELECT id, name, email, share_percent, status FROM shareholders WHERE city_id = $1 ORDER BY name ASC`,
    [cityId]
  );
  const payP = periodFilter(req, 'created_at', 2);
  const paid = await query(
    `SELECT shareholder_id, status, COALESCE(SUM(amount),0) AS total
       FROM shareholder_payouts WHERE city_id = $1${payP.sql}
      GROUP BY shareholder_id, status`,
    [cityId, ...payP.params]
  );
  const recv: Record<string, number> = {};
  const pend: Record<string, number> = {};
  for (const r of paid.rows) {
    if (r.status === 'received') recv[r.shareholder_id] = parseFloat(r.total) || 0;
    else if (r.status === 'pending') pend[r.shareholder_id] = parseFloat(r.total) || 0;
  }
  const shareholders = sh.rows.map((s: any) => {
    const pct = parseFloat(s.share_percent) || 0;
    const share = round2(distributable * (pct / 100));
    const received = round2(recv[s.id] || 0);
    const pending = round2(pend[s.id] || 0);
    return {
      id: s.id, name: s.name, email: s.email, status: s.status, sharePercent: pct,
      share, received, pending, balance: round2(share - received), // +owed / -overpaid
    };
  });

  return successResponse(res, {
    needsCity: false, ready: true,
    totalSale, orderCount, totalExpenses, inventoryCost, operatingExpenses, profit, freshbazarShare, distributable,
    settings: cp.settings,
    shareholders,
  }, 'Profit');
});

function publicSettings(s: any) {
  return {
    enabled: s.freshbazar_enabled === true,
    mode: s.freshbazar_mode,
    perOrder: parseFloat(s.freshbazar_per_order) || 0,
    marginPercent: parseFloat(s.freshbazar_margin_percent) || 0,
  };
}
const defaultSettings = () => ({ enabled: false, mode: 'per_order_fixed', perOrder: 0, marginPercent: 0 });

// ── GET /api/finance/profit-settings — formula + category shares ─────────────
export const getProfitSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return successResponse(res, { needsCity: false, settings: defaultSettings(), categoryShares: [] }, 'Settings');
  const scope = await resolveCityScope(req);
  const cityId = scope.cityId;
  if (!cityId) return successResponse(res, { needsCity: true }, 'Settings');
  const setRow = await query(`SELECT * FROM profit_settings WHERE city_id = $1`, [cityId]);
  // Categories are PER-CITY — scope to this city's categories only, else every
  // city's same-named categories show up as duplicates.
  const cats = await query(
    `SELECT c.id AS category_id, c.name_en AS category_name, COALESCE(pcs.percent, 0) AS percent
       FROM categories c
       LEFT JOIN profit_category_shares pcs ON pcs.category_id = c.id AND pcs.city_id = $1
      WHERE c.is_active = TRUE AND c.city_id = $1 ORDER BY c.name_en ASC`,
    [cityId]
  );
  return successResponse(res, {
    needsCity: false, canEdit: isSuper(req),
    settings: setRow.rows[0] ? publicSettings(setRow.rows[0]) : defaultSettings(),
    categoryShares: cats.rows.map((c: any) => ({ categoryId: c.category_id, categoryName: c.category_name, percent: parseFloat(c.percent) || 0 })),
  }, 'Settings');
});

// ── PUT /api/finance/profit-settings — SUPER ADMIN ONLY ──────────────────────
export const updateProfitSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!isSuper(req)) return forbiddenResponse(res, 'Only the super admin can edit the profit-sharing formula.');
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance not ready.', 503);
  const scope = await resolveCityScope(req);
  const cityId = scope.cityId;
  if (!cityId) return errorResponse(res, 'Select a city first.', 400);

  // Bodies arrive snake_case (the admin client converts camel→snake on the wire).
  const enabled = req.body?.enabled === true;
  const mode = ['per_order_fixed', 'category_percent', 'profit_margin_percent'].includes(req.body?.mode) ? req.body.mode : 'per_order_fixed';
  const perOrder = Math.max(0, num(req.body?.per_order) || 0);
  const marginPercent = Math.min(100, Math.max(0, num(req.body?.margin_percent) || 0));

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO profit_settings (city_id, freshbazar_enabled, freshbazar_mode, freshbazar_per_order, freshbazar_margin_percent, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (city_id) DO UPDATE SET
         freshbazar_enabled = EXCLUDED.freshbazar_enabled, freshbazar_mode = EXCLUDED.freshbazar_mode,
         freshbazar_per_order = EXCLUDED.freshbazar_per_order, freshbazar_margin_percent = EXCLUDED.freshbazar_margin_percent,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [cityId, enabled, mode, perOrder, marginPercent, req.user?.id ?? null]
    );
    if (Array.isArray(req.body?.category_shares)) {
      for (const cs of req.body.category_shares) {
        if (!cs?.category_id) continue;
        const pct = Math.min(100, Math.max(0, num(cs.percent) || 0));
        await client.query(
          `INSERT INTO profit_category_shares (city_id, category_id, percent) VALUES ($1,$2,$3)
           ON CONFLICT (city_id, category_id) DO UPDATE SET percent = EXCLUDED.percent`,
          [cityId, cs.category_id, pct]
        );
      }
    }
  });
  logger.info('Profit settings updated', { cityId, by: req.user?.id });
  return successResponse(res, { ok: true }, 'Profit-sharing formula saved');
});

// ── GET /api/finance/shareholders ────────────────────────────────────────────
export const listShareholders = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return successResponse(res, { needsCity: false, shareholders: [] }, 'Shareholders');
  const scope = await resolveCityScope(req);
  const cityId = scope.cityId;
  if (!cityId) return successResponse(res, { needsCity: true, shareholders: [] }, 'Shareholders');
  const r = await query(
    `SELECT s.id, s.name, s.email, s.share_percent, s.status, s.last_login_at,
            COALESCE((SELECT SUM(amount) FROM shareholder_payouts p WHERE p.shareholder_id = s.id AND p.status='received'),0) AS received_total,
            COALESCE((SELECT SUM(amount) FROM shareholder_payouts p WHERE p.shareholder_id = s.id AND p.status='pending'),0) AS pending_total
       FROM shareholders s WHERE s.city_id = $1 ORDER BY s.name ASC`,
    [cityId]
  );
  return successResponse(res, {
    needsCity: false, canManage: isSuper(req),
    shareholders: r.rows.map((s: any) => ({
      id: s.id, name: s.name, email: s.email, sharePercent: parseFloat(s.share_percent) || 0, status: s.status,
      lastLoginAt: s.last_login_at, receivedTotal: parseFloat(s.received_total) || 0, pendingTotal: parseFloat(s.pending_total) || 0,
    })),
  }, 'Shareholders');
});

// ── POST /api/finance/shareholders — SUPER ADMIN ONLY (generates login) ──────
export const createShareholder = asyncHandler(async (req: Request, res: Response) => {
  if (!isSuper(req)) return forbiddenResponse(res, 'Only the super admin can add shareholders.');
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance not ready.', 503);
  const scope = await resolveCityScope(req);
  const cityId = scope.cityId;
  if (!cityId) return errorResponse(res, 'Select a city first.', 400);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = String(req.body?.password || '');
  const sharePercent = Math.min(100, Math.max(0, num(req.body?.share_percent) || 0));
  if (!name) return errorResponse(res, 'Name is required.', 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errorResponse(res, 'Enter a valid email.', 400);
  if (password.length < 6) return errorResponse(res, 'Password must be at least 6 characters.', 400);

  const hash = await bcrypt.hash(password, 10);
  let out: any;
  try {
    out = await withTransaction(async (client) => {
      // Lock the city's shareholders so concurrent adds can't both slip past the
      // 100% cap. Sum is over ALL shareholders (active + inactive) — reactivating
      // one must never push the city total over 100%.
      const sumRow = await client.query(
        `SELECT COALESCE(SUM(share_percent),0) AS total FROM shareholders WHERE city_id = $1 FOR UPDATE`,
        [cityId]
      );
      const currentTotal = parseFloat(sumRow.rows[0].total) || 0;
      if (currentTotal + sharePercent > 100 + 1e-6) {
        throw Object.assign(
          new Error(`Total shareholder share can't exceed 100%. Currently ${currentTotal}% allocated, only ${Math.max(0, 100 - currentTotal)}% left.`),
          { http: 400 }
        );
      }
      const dupe = await client.query(`SELECT 1 FROM shareholders WHERE LOWER(email) = $1`, [email]);
      if (dupe.rows.length > 0) throw Object.assign(new Error('A shareholder with this email already exists.'), { http: 409 });

      const ins = await client.query(
        `INSERT INTO shareholders (city_id, name, email, password_hash, share_percent, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [cityId, name, email, hash, sharePercent, req.user?.id ?? null]
      );
      return ins.rows[0];
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Shareholder created', { id: out.id, by: req.user?.id });
  return successResponse(res, { id: out.id }, 'Shareholder added');
});

// ── PUT /api/finance/shareholders/:id ────────────────────────────────────────
// Super admin: name/share%/password. City admin + super: status (active/inactive).
export const updateShareholder = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance not ready.', 503);
  const scope = await resolveCityScope(req);
  const r = await query(`SELECT * FROM shareholders WHERE id = $1`, [req.params.id]);
  const s = r.rows[0];
  if (!s) return notFoundResponse(res, 'Shareholder not found');
  if (!scope.unrestricted && scope.cityId && s.city_id !== scope.cityId) return notFoundResponse(res, 'Shareholder not found');

  const sets: string[] = [];
  const vals: any[] = [];
  const add = (col: string, v: any) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };

  // Status toggle — allowed for city admin + super.
  if (req.body?.status === 'active' || req.body?.status === 'inactive') add('status', req.body.status);

  // Profile + share% + password — super admin only.
  if (isSuper(req)) {
    if (typeof req.body?.name === 'string' && req.body.name.trim()) add('name', req.body.name.trim());
    if (req.body?.share_percent !== undefined) {
      const newShare = Math.min(100, Math.max(0, num(req.body.share_percent) || 0));
      // Enforce the city-wide 100% cap against the OTHER shareholders.
      const sumRow = await query(
        `SELECT COALESCE(SUM(share_percent),0) AS total FROM shareholders WHERE city_id = $1 AND id <> $2`,
        [s.city_id, req.params.id]
      );
      const othersTotal = parseFloat(sumRow.rows[0].total) || 0;
      if (othersTotal + newShare > 100 + 1e-6) {
        return errorResponse(res, `Total shareholder share can't exceed 100%. Other shareholders already hold ${othersTotal}%, so this one can be at most ${Math.max(0, 100 - othersTotal)}%.`, 400);
      }
      add('share_percent', newShare);
    }
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (req.body.password.length < 6) return errorResponse(res, 'Password must be at least 6 characters.', 400);
      add('password_hash', await bcrypt.hash(req.body.password, 10));
    }
  } else if (req.body?.name !== undefined || req.body?.share_percent !== undefined || req.body?.password !== undefined) {
    return forbiddenResponse(res, 'Only the super admin can edit shareholder profile, share or password.');
  }

  if (sets.length === 0) return errorResponse(res, 'Nothing to update.', 400);
  vals.push(req.params.id);
  await query(`UPDATE shareholders SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  return successResponse(res, { id: req.params.id }, 'Shareholder updated');
});

// ── GET /api/finance/shareholders/:id — payout history ───────────────────────
export const getShareholderPayouts = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return successResponse(res, [], 'Payouts');
  const scope = await resolveCityScope(req);
  const r = await query(`SELECT city_id FROM shareholders WHERE id = $1`, [req.params.id]);
  if (r.rows.length === 0) return notFoundResponse(res, 'Shareholder not found');
  if (!scope.unrestricted && scope.cityId && r.rows[0].city_id !== scope.cityId) return notFoundResponse(res, 'Shareholder not found');
  const p = await query(
    `SELECT id, amount, status, note, created_at, received_at FROM shareholder_payouts
      WHERE shareholder_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.id]
  );
  return successResponse(res, p.rows.map((x: any) => ({ ...x, amount: parseFloat(x.amount) })), 'Payouts');
});

// ── POST /api/finance/shareholders/:id/pay — city admin records a payout ─────
// Stays 'pending' until the shareholder RECEIVES it via their own login.
export const payShareholder = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance not ready.', 503);
  const scope = await resolveCityScope(req);
  const amount = num(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return errorResponse(res, 'Enter a valid amount.', 400);
  const r = await query(`SELECT id, city_id, status FROM shareholders WHERE id = $1`, [req.params.id]);
  const s = r.rows[0];
  if (!s) return notFoundResponse(res, 'Shareholder not found');
  if (!scope.unrestricted && scope.cityId && s.city_id !== scope.cityId) return notFoundResponse(res, 'Shareholder not found');

  const ins = await query(
    `INSERT INTO shareholder_payouts (shareholder_id, city_id, amount, note, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [req.params.id, s.city_id, amount, req.body?.note || null, req.user?.id ?? null]
  );
  logger.info('Shareholder payout sent (pending)', { id: ins.rows[0].id, shareholder: req.params.id, amount, by: req.user?.id });
  return successResponse(res, { id: ins.rows[0].id }, 'Payment sent — pending until the shareholder receives it');
});
