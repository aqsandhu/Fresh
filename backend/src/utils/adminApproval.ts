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
    throw Object.assign(new Error('Incorrect approver password.'), { http: 401 });
  }
  if (approver.id === req.user.id) {
    throw Object.assign(new Error('A different active admin must approve this action.'), { http: 400 });
  }
  return approver.id;
}

/**
 * If `value` is at/above the approval threshold, require a second admin to
 * co-approve (approval_phone + approval_password in the request body). Returns
 * the approver id + timestamp, or {null,null} when below threshold. Throws
 * { http } when approval is required but missing/invalid.
 */
export async function approvalForValue(
  client: Pick<PoolClient, 'query'>,
  req: Request,
  value: number,
  opts: { threshold?: number; label?: string } = {}
): Promise<{ approvedBy: string | null; approvedAt: string | null }> {
  const threshold = opts.threshold ?? APPROVAL_VALUE_THRESHOLD;
  if (!(value >= threshold)) return { approvedBy: null, approvedAt: null };
  const phone = String(req.body?.approval_phone || req.body?.approvalPhone || '');
  const password = String(req.body?.approval_password || req.body?.approvalPassword || req.body?.password || '');
  if (!phone || !password) {
    throw Object.assign(
      new Error(
        `A second admin's approval is required for ${opts.label || 'this action'} worth Rs. ${threshold.toLocaleString('en-PK')} or more.`
      ),
      { http: 400 }
    );
  }
  const approvedBy = await verifySecondApprover(client, req, phone, password);
  return { approvedBy, approvedAt: new Date().toISOString() };
}
