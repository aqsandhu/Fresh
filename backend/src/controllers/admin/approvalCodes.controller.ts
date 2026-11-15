// ============================================================================
// APPROVAL CODES — the second admin approves from their own phone.
//
//   POST /api/admin/approval-codes   → { code, expiresAt } for the signed-in admin
//   GET  /api/admin/approval-codes   → my recent codes and what each was used for
//
// The requester types the approver's phone + this code where the approver's
// password used to go (see utils/adminApproval.ts). Only a hash is stored.
// ============================================================================
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse } from '../../utils/response';
import { APPROVAL_CODE_TTL_SECONDS, APPROVAL_CODE_MAX_ATTEMPTS } from '../../utils/adminApproval';
import logger from '../../utils/logger';

export const createApprovalCode = asyncHandler(async (req: Request, res: Response) => {
  const approverId = req.user?.id;
  if (!approverId || !['admin', 'super_admin'].includes(String(req.user?.role))) {
    return errorResponse(res, 'Only an admin can give an approval code.', 403);
  }
  // Older open codes of this approver stop working: one live code at a time.
  await query(`UPDATE approval_codes SET expires_at = NOW() WHERE approver_id = $1 AND used_at IS NULL AND expires_at > NOW()`, [approverId]);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const hash = await bcrypt.hash(code, 10);
  const row = await query(
    `INSERT INTO approval_codes (approver_id, code_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval) RETURNING expires_at`,
    [approverId, hash, String(APPROVAL_CODE_TTL_SECONDS)]
  );
  logger.info('Approval code issued', { approverId });
  return successResponse(
    res,
    { code, expiresAt: row.rows[0].expires_at, validSeconds: APPROVAL_CODE_TTL_SECONDS, maxWrongTries: APPROVAL_CODE_MAX_ATTEMPTS },
    'Approval code created'
  );
});

export const listMyApprovalCodes = asyncHandler(async (req: Request, res: Response) => {
  const rows = await query(
    `SELECT ac.created_at, ac.expires_at, ac.used_at, ac.used_for, ac.attempts, u.full_name AS used_by_name
       FROM approval_codes ac LEFT JOIN users u ON u.id = ac.used_by
      WHERE ac.approver_id = $1
      ORDER BY ac.created_at DESC LIMIT 20`,
    [req.user?.id]
  );
  return successResponse(res, { codes: rows.rows }, 'Your approval codes');
});
