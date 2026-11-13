// ============================================================================
// ADMIN — AI CORRUPTION AUDIT (super admin only, every endpoint).
//
//   GET  /api/admin/corruption-audit/settings        AI company / model / key state
//   PUT  /api/admin/corruption-audit/settings        save them (key is write-only)
//   POST /api/admin/corruption-audit/settings/test   one tiny call to prove the key works
//   POST /api/admin/corruption-audit/run             start an audit for a period
//   GET  /api/admin/corruption-audit/runs            history
//   GET  /api/admin/corruption-audit/runs/:id        one run (evidence + verdicts)
//   GET  /api/admin/corruption-audit/cash            cash each admin should still hold
//   POST /api/admin/corruption-audit/cash-handovers  record cash an admin handed to the owner
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse, notFoundResponse } from '../../utils/response';
import { pktDateString } from '../../utils/businessTime';
import logger from '../../utils/logger';
import { closeStaleAudits, startAudit } from '../../services/corruptionAudit';
import {
  auditAiReady, callAuditAi, getAuditAiConfig, publicAuditAiConfig, saveAuditAiConfig,
} from '../../services/corruptionAudit/aiClient';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PERIOD_DAYS = 366;

/** The one gate for this whole feature. */
function ownerOnly(req: Request, res: Response): boolean {
  if (req.user?.role === 'super_admin') return true;
  errorResponse(res, 'Only the super admin can use the corruption audit.', 403);
  return false;
}

let tablesReady = false;
async function auditTablesReady(): Promise<boolean> {
  if (tablesReady) return true;
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS c FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('corruption_audit_runs', 'admin_cash_handovers')`
    );
    tablesReady = Number(r.rows[0].c) === 2;
  } catch {
    tablesReady = false;
  }
  return tablesReady;
}
const NOT_MIGRATED = 'The audit needs database migration 62 — run the database migrations (migrate:sql).';

export const getAuditSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!ownerOnly(req, res)) return;
  return successResponse(res, publicAuditAiConfig(await getAuditAiConfig()), 'Audit AI settings');
});

export const updateAuditSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!ownerOnly(req, res)) return;
  const error = await saveAuditAiConfig(req.body || {}, req.user?.id);
  if (error) return errorResponse(res, error, 400);
  logger.info('Audit AI settings updated', { by: req.user?.id });
  return successResponse(res, publicAuditAiConfig(await getAuditAiConfig()), 'AI settings saved');
});

export const testAuditSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!ownerOnly(req, res)) return;
  const cfg = await getAuditAiConfig();
  if (!auditAiReady(cfg)) return errorResponse(res, 'Save the AI company, model name and API key first.', 400);
  try {
    const text = await callAuditAi(cfg, 'You are a connection test. Reply with the single word OK.', 'Reply with the single word OK.', 200);
    return successResponse(res, { ok: true, reply: text.trim().slice(0, 80) }, `${cfg.model} answered — the key works.`);
  } catch (err: any) {
    return errorResponse(res, `The AI did not accept the request: ${String(err?.message || 'unknown error').slice(0, 300)}`, 400);
  }
});

export const runAudit = asyncHandler(async (req: Request, res: Response) => {
  if (!ownerOnly(req, res)) return;
  if (!(await auditTablesReady())) return errorResponse(res, NOT_MIGRATED, 503);

  const from = String(req.body?.from || '');
  const to = String(req.body?.to || '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return errorResponse(res, 'Choose a start date and an end date.', 400);
  }
  if (to < from) return errorResponse(res, 'The end date is before the start date.', 400);
  if (from > pktDateString()) return errorResponse(res, 'The period has not started yet.', 400);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (days > MAX_PERIOD_DAYS) return errorResponse(res, `Choose a period of at most ${MAX_PERIOD_DAYS} days.`, 400);

  const cityRaw = req.body?.city_id;
  const cityId = typeof cityRaw === 'string' && UUID_RE.test(cityRaw) ? cityRaw : null;

  await closeStaleAudits();
  const busy = await query(`SELECT 1 FROM corruption_audit_runs WHERE status = 'running' LIMIT 1`);
  if (busy.rows.length) return errorResponse(res, 'An audit is already running — wait for it to finish.', 409);

  const useAi = !(req.body?.use_ai === false || req.body?.use_ai === 'false');
  const id = await startAudit({ from, to, cityId, useAi, createdBy: req.user?.id ?? null });
  return successResponse(res, { id, status: 'running' }, 'Audit started');
});

export const listAuditRuns = asyncHandler(async (req: Request, res: Response) => {
  if (!ownerOnly(req, res)) return;
  if (!(await auditTablesReady())) return successResponse(res, [], 'Audit runs');
  await closeStaleAudits();
  const r = await query(
    `SELECT a.id, a.period_from::text AS period_from, a.period_to::text AS period_to, a.status, a.ai_used, a.ai_provider, a.ai_model,
            a.error, a.created_at, a.finished_at, c.name AS city_name,
            jsonb_array_length(COALESCE(a.evidence->'signals', '[]'::jsonb)) AS signal_count,
            (SELECT COALESCE(MAX((p->>'riskPercent')::numeric), 0) FROM jsonb_array_elements(COALESCE(a.result->'people', '[]'::jsonb)) p) AS top_risk
       FROM corruption_audit_runs a LEFT JOIN service_cities c ON c.id = a.city_id
      ORDER BY a.created_at DESC LIMIT 40`
  );
  return successResponse(res, r.rows.map((x: any) => ({ ...x, top_risk: Number(x.top_risk) || 0 })), 'Audit runs');
});

export const getAuditRun = asyncHandler(async (req: Request, res: Response) => {
  if (!ownerOnly(req, res)) return;
  if (!UUID_RE.test(req.params.id) || !(await auditTablesReady())) return notFoundResponse(res, 'Audit not found');
  const r = await query(
    `SELECT a.id, a.period_from::text AS period_from, a.period_to::text AS period_to, a.status, a.ai_used, a.ai_provider, a.ai_model,
            a.error, a.created_at, a.finished_at, a.evidence, a.result, c.name AS city_name
       FROM corruption_audit_runs a LEFT JOIN service_cities c ON c.id = a.city_id
      WHERE a.id = $1`,
    [req.params.id]
  );
  if (r.rows.length === 0) return notFoundResponse(res, 'Audit not found');
  return successResponse(res, r.rows[0], 'Audit');
});

/** Cash each admin collected (all time) minus what they handed to the owner. */
export const getCashPosition = asyncHandler(async (req: Request, res: Response) => {
  if (!ownerOnly(req, res)) return;
  if (!(await auditTablesReady())) return successResponse(res, { admins: [], handovers: [] }, 'Cash position');
  const admins = await query(
    `SELECT u.id, u.full_name, u.role,
            COALESCE(c.rider_cash, 0) AS rider_cash, COALESCE(c.ocp_cash, 0) AS ocp_cash, COALESCE(c.office_cash, 0) AS office_cash,
            COALESCE(c.total, 0) AS collected, COALESCE(h.handed, 0) AS handed, h.last_at
       FROM users u
       LEFT JOIN (
         SELECT x.admin_id,
                SUM(x.amount) FILTER (WHERE x.source = 'rider') AS rider_cash,
                SUM(x.amount) FILTER (WHERE x.source = 'ocp') AS ocp_cash,
                SUM(x.amount) FILTER (WHERE x.source = 'office') AS office_cash,
                SUM(x.amount) AS total
           FROM (
             SELECT s.received_by AS admin_id, 'rider' AS source, s.amount FROM rider_cash_settlements s WHERE s.received_by IS NOT NULL AND s.status = 'received'
             UNION ALL
             SELECT s.received_by, 'ocp', s.amount FROM ocp_settlements s WHERE s.status = 'received' AND s.received_by IS NOT NULL
             UNION ALL
             SELECT o.cash_received_by, 'office', o.paid_amount FROM orders o WHERE o.cash_received_by IS NOT NULL AND o.deleted_at IS NULL
           ) x GROUP BY x.admin_id
       ) c ON c.admin_id = u.id
       LEFT JOIN (
         SELECT admin_id, SUM(amount) AS handed, MAX(handed_at) AS last_at FROM admin_cash_handovers GROUP BY admin_id
       ) h ON h.admin_id = u.id
      WHERE u.role IN ('admin', 'super_admin') AND u.deleted_at IS NULL
        AND (c.total IS NOT NULL OR h.handed IS NOT NULL OR u.role = 'admin')
      ORDER BY (COALESCE(c.total, 0) - COALESCE(h.handed, 0)) DESC, u.full_name`
  );
  const handovers = await query(
    `SELECT h.id, h.admin_id, u.full_name AS admin_name, h.amount, h.note, h.handed_at, r.full_name AS received_by_name
       FROM admin_cash_handovers h
       LEFT JOIN users u ON u.id = h.admin_id
       LEFT JOIN users r ON r.id = h.received_by
      ORDER BY h.handed_at DESC LIMIT 60`
  );
  const n = (v: unknown) => Math.round((parseFloat(String(v)) || 0) * 100) / 100;
  return successResponse(res, {
    admins: admins.rows.map((a: any) => ({
      id: a.id, name: a.full_name, is_owner: a.role === 'super_admin',
      rider_cash: n(a.rider_cash), ocp_cash: n(a.ocp_cash), office_cash: n(a.office_cash),
      collected: n(a.collected), handed: n(a.handed), balance: n(n(a.collected) - n(a.handed)), last_handover_at: a.last_at,
    })),
    handovers: handovers.rows.map((h: any) => ({ ...h, amount: n(h.amount) })),
  }, 'Cash position');
});

export const recordCashHandover = asyncHandler(async (req: Request, res: Response) => {
  if (!ownerOnly(req, res)) return;
  if (!(await auditTablesReady())) return errorResponse(res, NOT_MIGRATED, 503);
  const adminId = String(req.body?.admin_id || '');
  const amount = Math.round((parseFloat(String(req.body?.amount)) || 0) * 100) / 100;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  if (!UUID_RE.test(adminId)) return errorResponse(res, 'Choose the admin who handed over the cash.', 400);
  if (!(amount > 0) || amount > 100000000) return errorResponse(res, 'Enter the amount you received.', 400);
  if (adminId === req.user?.id) return errorResponse(res, 'Record cash that another admin handed to you.', 400);
  const u = await query(`SELECT 1 FROM users WHERE id = $1 AND role IN ('admin', 'super_admin') AND deleted_at IS NULL`, [adminId]);
  if (u.rows.length === 0) return notFoundResponse(res, 'Admin not found');
  const r = await query(
    `INSERT INTO admin_cash_handovers (admin_id, amount, note, received_by) VALUES ($1, $2, $3, $4) RETURNING id, handed_at`,
    [adminId, amount, note || null, req.user?.id ?? null]
  );
  logger.info('Admin cash handover recorded', { id: r.rows[0].id, adminId, amount, by: req.user?.id });
  return successResponse(res, { id: r.rows[0].id, handed_at: r.rows[0].handed_at }, 'Cash hand-over recorded');
});
