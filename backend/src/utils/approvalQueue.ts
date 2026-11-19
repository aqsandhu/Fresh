// ============================================================================
// APPROVAL QUEUE — staff entries wait for the city admin (owner's decision J1).
//
// Where an action needs a second admin (waste, conversion, stock-count
// shortage, refund, expense, rider / worker payment, manual-order discount,
// salary increase) and the person sends no approval code, the action is not
// refused any more: it is stored here and the city admin approves it (one by
// one or all at once) or rejects it. Approving runs the SAME action again as
// the person who asked, with the approver as the second admin
// (controllers/admin/approvals.controller.ts) — every check runs again then.
// ============================================================================

import crypto from 'crypto';
import { Request } from 'express';
import { query } from '../config/database';
import { resolveCityScope } from './cityScope';
import logger from './logger';

/** Thrown inside the action: nothing was applied, the entry waits for approval. */
export class QueuedForApproval extends Error {
  readonly queued = true;
  constructor(message: string, readonly requestId: string) {
    super(message);
    this.name = 'QueuedForApproval';
  }
}

/** Set (only) by the approval replay: the action is approved by this admin. */
export interface ApprovalReplay {
  approvedBy: string;
  requestId: string;
}
export const approvalReplayOf = (req: Request): ApprovalReplay | undefined =>
  (req as unknown as { _approvalReplay?: ApprovalReplay })._approvalReplay;

// Never stored: approval codes / passwords typed with the request.
const SECRET_KEYS = new Set(['approval_phone', 'approvalPhone', 'approval_password', 'approvalPassword', 'password', 'otp', 'pin']);

function cleanBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) if (!SECRET_KEYS.has(k)) out[k] = v;
  return out;
}

/** The route this request came in on, e.g. "POST /api/admin/stock/waste" — null outside a real request. */
export function replayKeyOf(req: Request): string | null {
  const route = (req as unknown as { route?: { path?: unknown } }).route;
  if (!route || typeof route.path !== 'string') return null;
  return `${req.method} ${req.baseUrl || ''}${route.path}`;
}

/**
 * Store this request for approval (once — the same entry pressed twice is one
 * request). Written outside the caller's transaction, which is rolled back
 * when QueuedForApproval is thrown. Returns null when it cannot be queued.
 */
export async function enqueueApproval(
  req: Request,
  opts: { kind: string; label: string; value: number }
): Promise<{ id: string } | null> {
  const key = replayKeyOf(req);
  const requester = req.user?.id;
  if (!key || !requester) return null;
  const file = (req as unknown as { file?: { url?: string; mimetype?: string; originalname?: string } }).file;
  const payload = {
    params: { ...(req.params || {}) },
    query: { ...(req.query || {}) },
    body: cleanBody(req.body),
    file: file?.url ? { url: file.url, mimetype: file.mimetype ?? null, originalname: file.originalname ?? null } : null,
  };
  const scope = await resolveCityScope(req);
  const fingerprint = crypto.createHash('sha256').update(`${key}|${requester}|${JSON.stringify(payload)}`).digest('hex');
  const value = Math.round((Number.isFinite(opts.value) ? opts.value : 0) * 100) / 100;
  const ins = await query(
    `INSERT INTO approval_requests (city_id, kind, label, value, replay_key, payload, fingerprint, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     ON CONFLICT (fingerprint) WHERE status = 'pending' DO NOTHING
     RETURNING id`,
    [scope.cityId, opts.kind.slice(0, 40), opts.label.slice(0, 200), value, key, JSON.stringify(payload), fingerprint, requester]
  );
  let id: string | undefined = ins.rows[0]?.id;
  if (!id) {
    const existing = await query(`SELECT id FROM approval_requests WHERE fingerprint = $1 AND status = 'pending' LIMIT 1`, [fingerprint]);
    id = existing.rows[0]?.id;
  }
  if (!id) return null;
  logger.info('Sent for approval', { requestId: id, kind: opts.kind, value, by: requester });
  try {
    // Live badge for the city's approvers (best effort).
    const { emitToCityAdmins } = await import('../config/socket');
    emitToCityAdmins(scope.cityId, 'approval:requested', { id, kind: opts.kind, label: opts.label, value });
  } catch { /* socket not running (tests) */ }
  return { id };
}
