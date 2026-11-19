// ============================================================================
// APPROVALS — the city admin's queue of staff entries (owner's decision J1).
//
//   GET  /api/admin/approvals?status=pending   approvers: their city's entries;
//                                              everyone else: their own
//   POST /api/admin/approvals/:id/approve      runs the stored action again as
//                                              the person who asked, with the
//                                              approver as the second admin
//   POST /api/admin/approvals/:id/reject       { reason }
//   POST /api/admin/approvals/approve-all      each entry in turn; failures say why
//
// The approver must hold approvals.decide (or be the super admin), be another
// person than the one who asked, and the entry must be in their city.
// ============================================================================

import { asCaughtError, caughtMessage } from '../../utils/caughtError';
import { Request, Response, NextFunction } from 'express';
import { query, withTransaction, type DbRow } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse, notFoundResponse, forbiddenResponse } from '../../utils/response';
import { resolveCityScope } from '../../utils/cityScope';
import { permissionsFor } from '../../middleware/adminPermissions';
import logger from '../../utils/logger';
import * as stock from './stock.controller';
import * as orders from './orders.controller';
import { refundComplaint } from '../complaint.controller';
import { createExpense, createRiderPayment } from '../finance/expenses.controller';
import { payWorker, addIncrement } from '../finance/workers.controller';

type Handler = (req: Request, res: Response, next: NextFunction) => void;

/** Every action that can wait in the queue → the code that performs it. */
const REPLAY: Record<string, Handler> = {
  'POST /api/admin/stock/waste': stock.wasteStock,
  'POST /api/admin/stock/convert': stock.convertQuality,
  'POST /api/admin/stock/count': stock.countStock,
  'POST /api/admin/complaints/:id/refund': refundComplaint,
  'POST /api/admin/whatsapp-orders': orders.createWhatsappOrder,
  'POST /api/finance/expenses': createExpense,
  'POST /api/finance/rider-payment': createRiderPayment,
  'POST /api/finance/workers/:id/pay': payWorker,
  'POST /api/finance/workers/:id/increment': addIncrement,
};
export const replayableKeys = (): string[] => Object.keys(REPLAY);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canDecide = (req: Request): boolean => {
  const perms = req.adminPermissions ?? [];
  return req.user?.role === 'super_admin' || perms.includes('*') || perms.includes('approvals.decide');
};

function shape(r: DbRow<{ value: string; kind: string }>) {
  return {
    id: r.id, kind: r.kind, label: r.label, value: parseFloat(r.value) || 0, status: r.status,
    requestedAt: r.requested_at, requestedBy: r.requested_by, requestedByName: r.requested_by_name ?? null,
    decidedAt: r.decided_at, decidedByName: r.decided_by_name ?? null, note: r.note ?? null,
    cityName: r.city_name ?? null, details: summarise(r.kind, r.payload),
  };
}

/** A short line the approver can judge by (never the raw request). */
function summarise(kind: string, payload: any): string {
  const b = payload?.body ?? {};
  const bits: string[] = [];
  if (b.quantity != null) bits.push(`qty ${b.quantity}${b.quality ? ` (${b.quality})` : ''}`);
  if (b.counted_quantity != null) bits.push(`counted ${b.counted_quantity}`);
  if (b.amount != null) bits.push(`Rs. ${b.amount}`);
  if (b.category) bits.push(String(b.category));
  if (b.new_basic_salary != null) bits.push(`new salary Rs. ${b.new_basic_salary}`);
  if (b.discount_amount != null) bits.push(`discount Rs. ${b.discount_amount}`);
  const why = b.note || b.reason || b.comment;
  if (why) bits.push(`"${String(why).slice(0, 120)}"`);
  if (payload?.file?.url) bits.push('photo attached');
  return bits.join(' · ') || kind;
}

// ── GET /api/admin/approvals ────────────────────────────────────────────────
export const listApprovals = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const status = ['pending', 'approved', 'rejected', 'failed'].includes(String(req.query.status)) ? String(req.query.status) : 'pending';
  const params: unknown[] = [status];
  let where = `ar.status = $1`;
  if (!canDecide(req)) {
    params.push(req.user?.id);
    where += ` AND ar.requested_by = $${params.length}`;
  } else if (scope.forbidden) {
    return successResponse(res, { requests: [], canDecide: true }, 'Approvals');
  } else if (scope.cityId) {
    params.push(scope.cityId);
    where += ` AND ar.city_id = $${params.length}`;
  }
  const r = await query(
    `SELECT ar.*, ru.full_name AS requested_by_name, du.full_name AS decided_by_name, sc.name AS city_name
       FROM approval_requests ar
       LEFT JOIN users ru ON ru.id = ar.requested_by
       LEFT JOIN users du ON du.id = ar.decided_by
       LEFT JOIN service_cities sc ON sc.id = ar.city_id
      WHERE ${where}
      ORDER BY ar.requested_at ${status === 'pending' ? 'ASC' : 'DESC'}
      LIMIT 200`,
    params
  );
  return successResponse(res, { requests: r.rows.map(shape), canDecide: canDecide(req) }, 'Approvals');
});

/** Run the stored action as the person who asked, approved by `approverId`. */
async function replay(row: any, approverId: string): Promise<{ ok: boolean; status: number; message: string; data?: unknown }> {
  const handler = REPLAY[row.replay_key];
  if (!handler) return { ok: false, status: 400, message: 'This kind of entry can no longer be approved here.' };
  const u = await query(
    `SELECT id, phone, role, status, full_name FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [row.requested_by]
  );
  const requester = u.rows[0];
  if (!requester || requester.status !== 'active') {
    return { ok: false, status: 400, message: 'The admin who sent this is no longer active.' };
  }
  const p = row.payload || {};
  const [method, fullPath] = String(row.replay_key).split(' ');
  const headers: Record<string, string> = {};
  if (row.city_id) headers['x-city-id'] = row.city_id;
  const fakeReq: any = {
    method, baseUrl: fullPath, originalUrl: fullPath, path: fullPath, url: fullPath,
    params: p.params || {}, query: p.query || {}, body: p.body || {}, file: p.file || undefined,
    headers, ip: 'approval-queue', cookies: {},
    get(name: string) { return headers[String(name).toLowerCase()]; },
    header(name: string) { return headers[String(name).toLowerCase()]; },
    user: { id: requester.id, userId: requester.id, phone: requester.phone, role: requester.role, full_name: requester.full_name, status: requester.status },
    _approvalReplay: { approvedBy: approverId, requestId: row.id },
  };
  fakeReq.adminPermissions = await permissionsFor(requester.id, requester.role);
  fakeReq.cityScope = await resolveCityScope(fakeReq);

  return new Promise((resolve) => {
    let done = false;
    const finish = (out: { ok: boolean; status: number; message: string; data?: unknown }) => { if (!done) { done = true; resolve(out); } };
    const fakeRes: any = {
      statusCode: 200, headersSent: false, locals: {},
      status(c: number) { this.statusCode = c; return this; },
      setHeader() { return this; }, set() { return this; }, cookie() { return this; }, clearCookie() { return this; },
      json(body: any) { finish({ ok: this.statusCode < 300, status: this.statusCode, message: body?.message || '', data: body?.data }); return this; },
      send(body: any) { finish({ ok: this.statusCode < 300, status: this.statusCode, message: typeof body === 'string' ? body : '' }); return this; },
      end() { finish({ ok: this.statusCode < 300, status: this.statusCode, message: '' }); return this; },
    };
    try {
      handler(fakeReq, fakeRes, (err?: any) => {
        if (!err) return finish({ ok: false, status: 500, message: 'The action did not finish.' });
        finish({ ok: false, status: err.statusCode || err.http || 500, message: err.message || 'The action failed.' });
      });
    } catch (errCaught: unknown) {
      const err = asCaughtError(errCaught);
      finish({ ok: false, status: 500, message: err?.message || 'The action failed.' });
    }
  });
}

type Decision = { id: string; ok: boolean; status: number; message: string };

/** Claim one pending entry for this approver (409 if someone else got it first). */
async function decide(req: Request, id: string, action: 'approve' | 'reject', reason?: string): Promise<Decision> {
  if (!UUID_RE.test(id)) return { id, ok: false, status: 404, message: 'Not found' };
  const scope = await resolveCityScope(req);
  let claimed;
  try {
    claimed = await withTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE`, [id]);
      const row = r.rows[0];
      if (!row) throw Object.assign(new Error('Not found'), { http: 404 });
      if (req.user?.role !== 'super_admin' && (scope.forbidden || !scope.cityId || row.city_id !== scope.cityId)) {
        throw Object.assign(new Error('Not found'), { http: 404 });
      }
      if (row.status !== 'pending') throw Object.assign(new Error(`This entry was already ${row.status}.`), { http: 409 });
      if (row.requested_by === req.user?.id) {
        throw Object.assign(new Error('Someone else must approve your own entry.'), { http: 403 });
      }
      if (action === 'reject') {
        await client.query(
          `UPDATE approval_requests SET status = 'rejected', decided_by = $2, decided_at = NOW(), note = $3 WHERE id = $1`,
          [id, req.user?.id, reason ? String(reason).slice(0, 500) : null]
        );
        return { ...row, status: 'rejected' };
      }
      await client.query(`UPDATE approval_requests SET status = 'approving', decided_by = $2, decided_at = NOW() WHERE id = $1`, [id, req.user?.id]);
      return row;
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http) return { id, ok: false, status: err.http, message: caughtMessage(errCaught, 'Could not complete this request.') };
    throw err;
  }
  if (action === 'reject') return { id, ok: true, status: 200, message: 'Rejected' };

  const out = await replay(claimed, req.user!.id);
  await query(
    `UPDATE approval_requests SET status = $2, note = $3, result = $4::jsonb WHERE id = $1`,
    [id, out.ok ? 'approved' : 'failed', out.ok ? null : out.message.slice(0, 500), JSON.stringify({ status: out.status, message: out.message, data: out.data ?? null })]
  );
  logger.info('Approval decided', { requestId: id, ok: out.ok, by: req.user?.id, kind: claimed.kind });
  return { id, ok: out.ok, status: out.ok ? 200 : (out.status >= 400 ? out.status : 400), message: out.ok ? (out.message || 'Approved') : out.message };
}

// ── POST /api/admin/approvals/:id/approve ───────────────────────────────────
export const approveRequest = asyncHandler(async (req: Request, res: Response) => {
  if (!canDecide(req)) return forbiddenResponse(res, 'You cannot approve entries.');
  const d = await decide(req, req.params.id, 'approve');
  if (d.status === 404) return notFoundResponse(res, 'Entry not found');
  if (!d.ok) return errorResponse(res, d.message, d.status);
  return successResponse(res, { id: d.id }, `Approved — ${d.message}`);
});

// ── POST /api/admin/approvals/:id/reject ────────────────────────────────────
export const rejectRequest = asyncHandler(async (req: Request, res: Response) => {
  if (!canDecide(req)) return forbiddenResponse(res, 'You cannot reject entries.');
  const d = await decide(req, req.params.id, 'reject', req.body?.reason);
  if (d.status === 404) return notFoundResponse(res, 'Entry not found');
  if (!d.ok) return errorResponse(res, d.message, d.status);
  return successResponse(res, { id: d.id }, 'Rejected — nothing was changed');
});

// ── POST /api/admin/approvals/approve-all ───────────────────────────────────
export const approveAll = asyncHandler(async (req: Request, res: Response) => {
  if (!canDecide(req)) return forbiddenResponse(res, 'You cannot approve entries.');
  const scope = await resolveCityScope(req);
  if (req.user?.role !== 'super_admin' && (scope.forbidden || !scope.cityId)) return successResponse(res, { approved: 0, failed: [] }, 'Nothing to approve');
  const params: unknown[] = [req.user?.id];
  let where = `status = 'pending' AND requested_by <> $1`;
  if (scope.cityId) { params.push(scope.cityId); where += ` AND city_id = $${params.length}`; }
  const ids = (await query(`SELECT id FROM approval_requests WHERE ${where} ORDER BY requested_at ASC LIMIT 100`, params)).rows.map((r: any) => r.id);
  let approved = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const d = await decide(req, id, 'approve');
    if (d.ok) approved++;
    else if (d.status !== 409) failed.push({ id, reason: d.message });
  }
  return successResponse(res, { approved, failed }, failed.length ? `Approved ${approved}; ${failed.length} could not be applied` : `Approved ${approved}`);
});
