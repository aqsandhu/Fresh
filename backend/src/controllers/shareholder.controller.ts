// ============================================================================
// SHAREHOLDER PORTAL CONTROLLER — isolated auth (email + password). A shareholder
// sees their city's total profit, their own share, and their payout record
// (received vs pending), with date/month filters. They confirm receipt of a
// payout (pending → received) and can change their password. Fully isolated from
// user/admin auth via the shareholder token (see middleware/shareholderAuth.ts).
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, type DbRow } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse, notFoundResponse } from '../utils/response';
import { generateShareholderToken } from '../config/jwt';
import { ensureFinanceTables } from '../config/financeSchema';
import {
  pinAttemptFailed,
  clearPinFailures,
  passwordLockKey,
  reservePinAttempt,
} from '../config/pinLockout';
import { computeCityProfit, periodFromQuery, payoutPeriodClause } from '../utils/profitCalc';
import logger from '../utils/logger';
import { markCredentialsChanged } from '../utils/portalCredentials';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function publicShareholder(s: DbRow<{ share_percent: string }>) {
  return { id: s.id, name: s.name, email: s.email, city: s.city_name ?? null, sharePercent: parseFloat(s.share_percent) || 0, status: s.status };
}

/** POST /api/shareholder/login — email + password. Only active accounts. */
export const loginShareholder = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Login is being set up. Please try again shortly.', 503);
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = String(req.body?.password || '');
  if (!email || !password) return errorResponse(res, 'Enter your email and password.', 400);

  // Per-account brute-force lockout (same store + escalation as the other
  // password logins) — a per-IP limit alone is trivially rotated by a botnet.
  const lockKey = passwordLockKey('shareholder', email);
  // B39: the attempt is reserved (counted) before the check — guesses sent
  // at the same moment cannot get past the lock.
  const lockState = await reservePinAttempt(lockKey);
  if (!lockState.allowed) {
    const retryAfter = Math.ceil((lockState.lockedUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return errorResponse(res, 'Too many failed login attempts. Please try again later.', 429);
  }

  const r = await query(
    `SELECT s.*, sc.name AS city_name FROM shareholders s
       LEFT JOIN service_cities sc ON sc.id = s.city_id
      WHERE LOWER(s.email) = $1 LIMIT 1`,
    [email]
  );
  const s = r.rows[0];
  if (!s || !s.password_hash) {
    await pinAttemptFailed(lockKey);
    return unauthorizedResponse(res, 'Invalid email or password');
  }
  const ok = await bcrypt.compare(password, s.password_hash);
  if (!ok) {
    const { lockedUntil } = await pinAttemptFailed(lockKey);
    if (lockedUntil) {
      const retryAfter = Math.ceil((lockedUntil - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return errorResponse(res, 'Too many failed login attempts. Please try again later.', 429);
    }
    return unauthorizedResponse(res, 'Invalid email or password');
  }
  // Status only after the password: it used to answer any email without one,
  // telling anyone which emails are shareholders.
  if (s.status !== 'active') return forbiddenResponse(res, 'This account is inactive. Please contact the admin.');

  await clearPinFailures(lockKey);
  await query(`UPDATE shareholders SET last_login_at = NOW() WHERE id = $1`, [s.id]);
  const token = generateShareholderToken(s.id, s.email);
  logger.info('Shareholder login', { id: s.id });
  return successResponse(res, { token, shareholder: publicShareholder(s) }, 'Logged in');
});

/** GET /api/shareholder/me */
export const getShareholderMe = asyncHandler(async (req: Request, res: Response) => {
  const r = await query(
    `SELECT s.*, sc.name AS city_name FROM shareholders s LEFT JOIN service_cities sc ON sc.id = s.city_id WHERE s.id = $1`,
    [req.shareholder!.id]
  );
  if (!r.rows[0]) return unauthorizedResponse(res, 'Account not found');
  return successResponse(res, publicShareholder(r.rows[0]), 'Profile');
});

/** GET /api/shareholder/dashboard — city profit + my share + my payouts (period). */
export const getShareholderDashboard = asyncHandler(async (req: Request, res: Response) => {
  const me = req.shareholder!;
  if (!me.city_id) {
    return successResponse(res, { profit: 0, distributable: 0, myShare: 0, received: 0, pending: 0, balance: 0, sharePercent: me.share_percent, payouts: [] }, 'Dashboard');
  }
  const p = periodFromQuery(req.query);
  const cp = await computeCityProfit(me.city_id, p);
  const myShare = round2(cp.distributable * (me.share_percent / 100));

  // My received/pending for the period — a payout counts for the period it
  // PAYS (migration 69), not the day it was made.
  const payP = payoutPeriodClause(p, 2);
  const agg = await query(
    `SELECT status, COALESCE(SUM(amount),0) AS total FROM shareholder_payouts
      WHERE shareholder_id = $1${payP.sql} GROUP BY status`,
    [me.id, ...payP.params]
  );
  let received = 0, pending = 0;
  for (const r of agg.rows) {
    if (r.status === 'received') received = parseFloat(r.total) || 0;
    else if (r.status === 'pending') pending = parseFloat(r.total) || 0;
  }
  // Payout list (all-time, latest first) so they can confirm pending ones.
  const list = await query<DbRow<{ amount: string }>>(
    `SELECT id, amount, status, note, created_at, received_at,
            period_start::text AS period_start, period_end::text AS period_end
       FROM shareholder_payouts
      WHERE shareholder_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [me.id]
  );

  return successResponse(res, {
    totalSale: cp.totalSale, totalExpenses: cp.totalExpenses,
    inventoryCost: cp.inventoryCost, operatingExpenses: cp.operatingExpenses,
    refunds: cp.refunds, riderDeliveryPay: cp.riderDeliveryPay, profit: cp.profit,
    freshbazarShare: cp.freshbazarShare, distributable: cp.distributable,
    sharePercent: me.share_percent, myShare,
    received: round2(received), pending: round2(pending), balance: round2(myShare - received),
    payouts: list.rows.map((x) => ({ ...x, amount: parseFloat(x.amount) })),
  }, 'Dashboard');
});

/** POST /api/shareholder/payouts/:id/receive — confirm receipt (pending→received). */
export const receivePayout = asyncHandler(async (req: Request, res: Response) => {
  const upd = await query(
    `UPDATE shareholder_payouts SET status = 'received', received_at = NOW()
      WHERE id = $1 AND shareholder_id = $2 AND status = 'pending'
      RETURNING id, amount`,
    [req.params.id, req.shareholder!.id]
  );
  if (upd.rows.length === 0) return notFoundResponse(res, 'Payout not found or already processed');
  logger.info('Shareholder confirmed payout', { id: req.params.id, shareholder: req.shareholder!.id });
  return successResponse(res, { id: upd.rows[0].id, amount: parseFloat(upd.rows[0].amount) }, 'Payment confirmed received');
});

/** POST /api/shareholder/change-password */
export const changeShareholderPassword = asyncHandler(async (req: Request, res: Response) => {
  const current = String(req.body?.current_password || '');
  const next = String(req.body?.new_password || '');
  if (next.length < 6) return errorResponse(res, 'New password must be at least 6 characters.', 400);
  const r = await query(`SELECT password_hash FROM shareholders WHERE id = $1`, [req.shareholder!.id]);
  const hash = r.rows[0]?.password_hash;
  if (!hash || !(await bcrypt.compare(current, hash))) return errorResponse(res, 'Current password is incorrect.', 400);
  await query(`UPDATE shareholders SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [await bcrypt.hash(next, 10), req.shareholder!.id]);
  // Every other session ends (B38); this device carries on with a new token.
  await markCredentialsChanged('shareholders', req.shareholder!.id);
  const token = generateShareholderToken(req.shareholder!.id, req.shareholder!.email);
  return successResponse(res, { ok: true, token }, 'Password changed');
});
