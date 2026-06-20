// ============================================================================
// FINANCE — WORKERS (admin). Worker profiles + attendance + salary increments
// + payments (salary/bonus/commission/other). Every payment is logged in the
// shared `expenses` ledger (type worker_payment) so it shows in Expenses and
// adds to the totals. City-scoped.
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse, notFoundResponse } from '../../utils/response';
import { resolveCityScope } from '../../utils/cityScope';
import { ensureFinanceTables } from '../../config/financeSchema';
import logger from '../../utils/logger';

const num = (v: unknown): number => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : NaN; };

async function workerInScope(scope: { cityId: string | null; unrestricted: boolean }, id: string): Promise<any | null> {
  const r = await query('SELECT * FROM workers WHERE id = $1', [id]);
  const w = r.rows[0];
  if (!w) return null;
  if (!scope.unrestricted && scope.cityId && w.city_id !== scope.cityId) return null;
  return w;
}

// ── GET /api/finance/workers ─────────────────────────────────────────────────
export const listWorkers = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return successResponse(res, [], 'Workers');
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Workers');
  const params: any[] = [];
  let where = '1=1';
  if (!scope.unrestricted && scope.cityId) { params.push(scope.cityId); where += ` AND w.city_id = $${params.length}`; }
  else if (typeof req.query.city_id === 'string' && req.query.city_id) { params.push(req.query.city_id); where += ` AND w.city_id = $${params.length}`; }
  const r = await query(
    `SELECT w.id, w.name, w.phone, w.designation, w.basic_salary, w.status, w.city_id, sc.name AS city_name, w.created_at
       FROM workers w LEFT JOIN service_cities sc ON sc.id = w.city_id
      WHERE ${where} ORDER BY (w.status='active') DESC, w.name ASC`,
    params
  );
  return successResponse(res, r.rows.map((w: any) => ({ ...w, basic_salary: parseFloat(w.basic_salary) })), 'Workers');
});

// ── POST /api/finance/workers ────────────────────────────────────────────────
export const createWorker = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance is being set up. Try again shortly.', 503);
  const scope = await resolveCityScope(req);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return errorResponse(res, 'Worker name is required.', 400);
  const basic = num(req.body?.basic_salary);
  const cityId = (!scope.unrestricted && scope.cityId) ? scope.cityId : (req.body?.city_id || null);
  const r = await query(
    `INSERT INTO workers (city_id, name, phone, designation, basic_salary, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [cityId, name, req.body?.phone || null, req.body?.designation || null, Number.isFinite(basic) && basic >= 0 ? basic : 0, req.user?.id ?? null]
  );
  logger.info('Worker created', { id: r.rows[0].id, by: req.user?.id });
  return successResponse(res, { id: r.rows[0].id }, 'Worker added');
});

// ── PUT /api/finance/workers/:id — profile + active/inactive ─────────────────
export const updateWorker = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance not ready.', 503);
  const scope = await resolveCityScope(req);
  const w = await workerInScope(scope, req.params.id);
  if (!w) return notFoundResponse(res, 'Worker not found');
  const sets: string[] = [];
  const vals: any[] = [];
  const add = (col: string, v: any) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (typeof req.body?.name === 'string' && req.body.name.trim()) add('name', req.body.name.trim());
  if (req.body?.phone !== undefined) add('phone', req.body.phone || null);
  if (req.body?.designation !== undefined) add('designation', req.body.designation || null);
  if (req.body?.status === 'active' || req.body?.status === 'inactive') add('status', req.body.status);
  if (sets.length === 0) return errorResponse(res, 'Nothing to update.', 400);
  vals.push(req.params.id);
  await query(`UPDATE workers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  return successResponse(res, { id: req.params.id }, 'Worker updated');
});

// ── GET /api/finance/workers/:id — detail (salary history + payments) ────────
export const getWorker = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return notFoundResponse(res, 'Worker not found');
  const scope = await resolveCityScope(req);
  const w = await workerInScope(scope, req.params.id);
  if (!w) return notFoundResponse(res, 'Worker not found');
  const changes = await query(
    `SELECT id, effective_from, new_basic_salary, note, created_at FROM worker_salary_changes
      WHERE worker_id = $1 ORDER BY effective_from DESC, created_at DESC`,
    [req.params.id]
  );
  const payments = await query(
    `SELECT id, category, amount, comment, for_month, incurred_at FROM expenses
      WHERE ref_type = 'worker_payment' AND ref_id = $1 ORDER BY incurred_at DESC LIMIT 100`,
    [req.params.id]
  );
  return successResponse(res, {
    ...w,
    basic_salary: parseFloat(w.basic_salary),
    salaryChanges: changes.rows.map((c: any) => ({ ...c, new_basic_salary: parseFloat(c.new_basic_salary) })),
    payments: payments.rows.map((p: any) => ({ ...p, amount: parseFloat(p.amount) })),
  }, 'Worker');
});

// ── GET /api/finance/workers/:id/attendance?month=&year= ─────────────────────
export const getWorkerAttendance = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return successResponse(res, [], 'Attendance');
  const scope = await resolveCityScope(req);
  const w = await workerInScope(scope, req.params.id);
  if (!w) return notFoundResponse(res, 'Worker not found');
  const month = parseInt(String(req.query.month || ''), 10);
  const year = parseInt(String(req.query.year || ''), 10);
  const params: any[] = [req.params.id];
  let where = 'worker_id = $1';
  if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year)) {
    params.push(year); params.push(month);
    where += ` AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3`;
  }
  const r = await query(`SELECT date, status, note FROM worker_attendance WHERE ${where} ORDER BY date ASC`, params);
  return successResponse(res, r.rows, 'Attendance');
});

// ── POST /api/finance/workers/:id/attendance — mark (upsert) ─────────────────
export const markAttendance = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance not ready.', 503);
  const scope = await resolveCityScope(req);
  const w = await workerInScope(scope, req.params.id);
  if (!w) return notFoundResponse(res, 'Worker not found');
  const date = typeof req.body?.date === 'string' ? req.body.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorResponse(res, 'Enter a valid date.', 400);
  const status = ['present', 'absent', 'half', 'leave'].includes(req.body?.status) ? req.body.status : 'present';
  await query(
    `INSERT INTO worker_attendance (worker_id, date, status, note, created_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (worker_id, date) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note`,
    [req.params.id, date, status, req.body?.note || null, req.user?.id ?? null]
  );
  return successResponse(res, { date, status }, 'Attendance saved');
});

// ── POST /api/finance/workers/:id/increment — raise basic salary ─────────────
export const addIncrement = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance not ready.', 503);
  const scope = await resolveCityScope(req);
  const w = await workerInScope(scope, req.params.id);
  if (!w) return notFoundResponse(res, 'Worker not found');
  const newSalary = num(req.body?.new_basic_salary);
  const effFrom = typeof req.body?.effective_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.effective_from)
    ? req.body.effective_from : new Date().toISOString().slice(0, 10);
  if (!Number.isFinite(newSalary) || newSalary < 0) return errorResponse(res, 'Enter a valid new salary.', 400);
  await query(
    `INSERT INTO worker_salary_changes (worker_id, effective_from, new_basic_salary, note, created_by)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.params.id, effFrom, newSalary, req.body?.note || null, req.user?.id ?? null]
  );
  // The worker's current basic salary becomes the latest increment.
  await query(`UPDATE workers SET basic_salary = $1, updated_at = NOW() WHERE id = $2`, [newSalary, req.params.id]);
  logger.info('Worker increment', { worker: req.params.id, newSalary, by: req.user?.id });
  return successResponse(res, { new_basic_salary: newSalary, effective_from: effFrom }, 'Increment applied');
});

// ── POST /api/finance/workers/:id/pay — salary/bonus/commission/other ────────
export const payWorker = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFinanceTables())) return errorResponse(res, 'Finance not ready.', 503);
  const scope = await resolveCityScope(req);
  const w = await workerInScope(scope, req.params.id);
  if (!w) return notFoundResponse(res, 'Worker not found');
  const amount = num(req.body?.amount);
  const kind = ['salary', 'bonus', 'commission', 'other'].includes(req.body?.category) ? req.body.category : 'salary';
  if (!Number.isFinite(amount) || amount <= 0) return errorResponse(res, 'Enter a valid amount.', 400);
  const incurredAt = typeof req.body?.paid_at === 'string' && req.body.paid_at ? req.body.paid_at : new Date().toISOString();
  const r = await query(
    `INSERT INTO expenses (city_id, type, category, amount, comment, ref_type, ref_id, for_month, incurred_at, created_by)
     VALUES ($1, 'worker_payment', $2, $3, $4, 'worker_payment', $5, $6, $7, $8) RETURNING id`,
    [w.city_id, kind, amount, req.body?.comment || null, req.params.id, req.body?.for_month || null, incurredAt, req.user?.id ?? null]
  );
  logger.info('Worker payment', { id: r.rows[0].id, worker: req.params.id, amount, kind, by: req.user?.id });
  return successResponse(res, { id: r.rows[0].id }, 'Payment recorded');
});
