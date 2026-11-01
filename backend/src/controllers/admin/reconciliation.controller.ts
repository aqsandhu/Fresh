// ============================================================================
// ADMIN RECONCILIATION — the owner's books-watchdog report.
// Super-admin only: view the latest automated reconciliation (stock-conservation
// + money-exit + OCP-cash anomalies) and trigger a run on demand.
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse } from '../../utils/response';
import { ensureReconciliationTables } from '../../config/reconciliationSchema';
import { runReconciliation } from '../../utils/reconciliation';

/** GET /api/admin/reconciliation — latest run + recent history. */
export const getReconciliation = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only a super-admin can view reconciliation.', 403);
  }
  if (!(await ensureReconciliationTables())) {
    return successResponse(res, { latest: null, history: [] }, 'Reconciliation');
  }
  const latest = await query(
    `SELECT id, run_at, window_from, anomaly_count, summary
       FROM reconciliation_runs ORDER BY run_at DESC LIMIT 1`
  );
  const history = await query(
    `SELECT id, run_at, anomaly_count FROM reconciliation_runs ORDER BY run_at DESC LIMIT 30`
  );
  return successResponse(res, { latest: latest.rows[0] || null, history: history.rows }, 'Reconciliation');
});

/** POST /api/admin/reconciliation/run — run the checks now. */
export const runReconciliationNow = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only a super-admin can run reconciliation.', 403);
  }
  const result = await runReconciliation({ createdBy: req.user?.id ?? null });
  return successResponse(res, result, result.ok ? 'All checks passed' : `${result.anomalyCount} issue(s) found`);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/audit-logs — who changed what (super admin only).
 * Every admin POST/PUT/PATCH/DELETE is recorded with old + new values by the
 * audit middleware; until now there was no screen to read it.
 * Filters: admin_id, resource, q (action / record id), days (default 7).
 */
export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only the super admin can view the audit log.', 403);
  }
  const params: unknown[] = [];
  const where: string[] = [];
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '7'), 10) || 7));
  params.push(String(days));
  where.push(`a.created_at > NOW() - ($${params.length} || ' days')::interval`);
  const adminId = req.query.admin_id ?? req.query.adminId;
  if (typeof adminId === 'string' && UUID_RE.test(adminId)) {
    params.push(adminId);
    where.push(`a.admin_id = $${params.length}`);
  }
  if (typeof req.query.resource === 'string' && /^[a-z0-9_-]{1,40}$/i.test(req.query.resource)) {
    params.push(req.query.resource);
    where.push(`a.resource = $${params.length}`);
  }
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    params.push(`%${req.query.q.trim().slice(0, 80)}%`);
    where.push(`(a.action ILIKE $${params.length} OR a.resource_id::text ILIKE $${params.length})`);
  }
  const r = await query(
    `SELECT a.id, a.action, a.admin_id, COALESCE(u.full_name, a.admin_email) AS admin_name,
            a.resource, a.resource_id, a.old_data, a.new_data, a.status, a.error_message,
            a.ip_address, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.admin_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT 300`,
    params
  );
  return successResponse(res, r.rows, 'Audit log');
});
