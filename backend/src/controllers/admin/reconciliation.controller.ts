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
