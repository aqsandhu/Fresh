// ============================================================================
// TWO-PERSON APPROVAL for high-value money/stock exits.
// A single admin must never be able to move large value out of the business
// alone (free goods, refunds, waste, conversions). For any action whose value
// is at/above the threshold, a SECOND active admin must co-sign with their own
// phone + password. Reused across stock, refunds, and manual-order discounts so
// the rule can't drift between features.
// ============================================================================

import { Request } from 'express';
import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { normalizePhoneNumber } from './validators';
import { hasApprovalValueLog } from '../config/controlsSchema';
import { TODAY_SQL, localDate } from './businessTime';

/** Money value (Rs.) at/above which a second active admin must co-approve. */
export const APPROVAL_VALUE_THRESHOLD = Math.max(
  0,
  Number(process.env.APPROVAL_VALUE_THRESHOLD || process.env.STOCK_APPROVAL_VALUE_THRESHOLD || 5000)
);

/**
 * Verify a SECOND active admin (phone + password) who is NOT the acting admin.
 * Returns the approver's user id. Throws { http } on any failure. The password
 * is only bcrypt-compared — never logged or returned.
 */
export async function verifySecondApprover(
  client: Pick<PoolClient, 'query'>,
  req: Request,
  phone: string,
  password: string
): Promise<string> {
  if (!req.user?.id) throw Object.assign(new Error('Please login again.'), { http: 401 });
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizePhoneNumber(phone);
  } catch {
    throw Object.assign(new Error('Enter a valid approver phone number.'), { http: 400 });
  }
  const u = await client.query(
    `SELECT id, password_hash
       FROM users
      WHERE phone = $1
        AND role IN ('admin', 'super_admin')
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1`,
    [normalizedPhone]
  );
  const approver = u.rows[0];
  if (!approver?.password_hash || !(await bcrypt.compare(password, approver.password_hash))) {
    throw Object.assign(new Error('Incorrect approver password.'), { http: 400 });
  }
  if (approver.id === req.user.id) {
    throw Object.assign(new Error('A different active admin must approve this action.'), { http: 400 });
  }
  return approver.id;
}

/**
 * Second-admin rule for value leaving the business (waste, conversion,
 * refund, discount, stock-count shortage).
 *
 * The threshold applies to the acting admin's whole Pakistan DAY of
 * un-approved value, not to one action: five Rs 4,900 wastes used to pass
 * with no second admin (Rs 24,500 out). Every value-out action is written to
 * approval_value_log inside the caller's transaction (so a failed action
 * leaves no row). Without migration 60 it falls back to per-action.
 *
 * Returns the approver id + timestamp, or {null,null} when no approval was
 * needed. Throws { http } when approval is required but missing/invalid.
 */
export async function approvalForValue(
  client: Pick<PoolClient, 'query'>,
  req: Request,
  value: number,
  opts: { threshold?: number; label?: string; kind?: string } = {}
): Promise<{ approvedBy: string | null; approvedAt: string | null }> {
  const threshold = opts.threshold ?? APPROVAL_VALUE_THRESHOLD;
  const amount = Number.isFinite(value) && value > 0 ? value : 0;
  const adminId = req.user?.id ?? null;
  const logReady = adminId ? await hasApprovalValueLog() : false;

  let todayBefore = 0;
  if (logReady && amount > 0) {
    const r = await client.query(
      `SELECT COALESCE(SUM(value), 0) AS total
         FROM approval_value_log
        WHERE admin_id = $1 AND approved_by IS NULL
          AND ${localDate('created_at')} = ${TODAY_SQL}`,
      [adminId]
    );
    todayBefore = parseFloat(r?.rows?.[0]?.total) || 0;
  }

  const singleOver = amount >= threshold;
  const dayOver = amount > 0 && todayBefore + amount >= threshold;
  let result: { approvedBy: string | null; approvedAt: string | null } = { approvedBy: null, approvedAt: null };

  if (singleOver || dayOver) {
    const phone = String(req.body?.approval_phone || req.body?.approvalPhone || '');
    const password = String(req.body?.approval_password || req.body?.approvalPassword || req.body?.password || '');
    if (!phone || !password) {
      const limit = threshold.toLocaleString('en-PK');
      const msg = singleOver
        ? `A second admin's approval is required for ${opts.label || 'this action'} worth Rs. ${limit} or more.`
        : `A second admin's approval is required: your un-approved stock/money changes today would reach Rs. ${Math.round(todayBefore + amount).toLocaleString('en-PK')} (limit Rs. ${limit} per day).`;
      throw Object.assign(new Error(msg), { http: 400 });
    }
    const approvedBy = await verifySecondApprover(client, req, phone, password);
    result = { approvedBy, approvedAt: new Date().toISOString() };
  }

  if (logReady && amount > 0) {
    await client.query(
      `INSERT INTO approval_value_log (admin_id, kind, value, approved_by) VALUES ($1, $2, $3, $4)`,
      [adminId, String(opts.kind || opts.label || 'value').slice(0, 40), Math.round(amount * 100) / 100, result.approvedBy]
    );
  }
  return result;
}
