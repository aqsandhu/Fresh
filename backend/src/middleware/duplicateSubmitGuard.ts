// ============================================================================
// DUPLICATE-SUBMIT GUARD (A34, round 7)
// ----------------------------------------------------------------------------
// Three fast clicks on "Refund" booked three refunds; an expense or a rider
// payment the same. Each request was valid on its own, so nothing stopped it.
// For money / stock / order-creating routes: the SAME admin sending the SAME
// request (same URL, same body, same file) again within a short window is
// refused with 409 and nothing is booked twice. A first attempt that FAILS
// (4xx/5xx) releases the guard at once, so a corrected retry is never blocked.
//
// Kept in Postgres (one row per request fingerprint, atomic upsert) so it
// holds across server instances; if that table cannot be used the guard
// steps aside (old behaviour) and logs it.
// ============================================================================

import { asCaughtError } from '../utils/caughtError';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { ConflictError } from './errorHandler';
import logger from '../utils/logger';

export const DUPLICATE_WINDOW_MS = Math.max(1000, Number(process.env.DUPLICATE_SUBMIT_WINDOW_MS) || 15000);

let tableReady: Promise<boolean> | null = null;
function ensureTable(): Promise<boolean> {
  if (!tableReady) {
    tableReady = query(
      `CREATE TABLE IF NOT EXISTS request_guards (
         key TEXT PRIMARY KEY,
         expires_at TIMESTAMPTZ NOT NULL
       )`
    )
      .then(() => true)
      .catch((err) => {
        logger.warn('Duplicate-submit guard: request_guards table unavailable', { message: err?.message });
        tableReady = null; // try again on a later request
        return false;
      });
  }
  return tableReady;
}

/** JSON with sorted keys, so {a,b} and {b,a} are the same request. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
    .join(',')}}`;
}

/** Fingerprint of "this admin sends this exact request". */
export function requestFingerprint(req: Request): string {
  const many = Array.isArray(req.files)
    ? req.files
    : req.files
      ? Object.values(req.files as Record<string, Express.Multer.File[]>).flat()
      : [];
  const file = [req.file, ...many]
    .filter(Boolean)
    .map((f) => `${(f as Express.Multer.File).originalname}:${(f as Express.Multer.File).size}`)
    .join(',');
  const url = (req.originalUrl || req.url || '').split('?')[0];
  return crypto
    .createHash('sha256')
    .update([req.user?.id ?? '-', req.method, url, stableJson(req.body ?? null), file].join('|'))
    .digest('hex');
}

export const duplicateSubmitGuard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (req.method === 'GET' || !req.user?.id) return next();
  if (!(await ensureTable())) return next();

  const key = requestFingerprint(req);
  try {
    const r = await query(
      `INSERT INTO request_guards (key, expires_at)
       VALUES ($1, NOW() + ($2 || ' milliseconds')::interval)
       ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at
         WHERE request_guards.expires_at < NOW()
       RETURNING key`,
      [key, String(DUPLICATE_WINDOW_MS)]
    );
    if (r.rows.length === 0) {
      return next(new ConflictError('This was already recorded a moment ago — it was not booked twice.'));
    }
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    logger.warn('Duplicate-submit guard skipped', { message: err?.message });
    return next();
  }

  // A failed first attempt must not block the corrected retry. A request that
  // went to the approval queue (202) is released too: the queue merges an
  // identical pending request itself and answers with the same request id.
  res.on('finish', () => {
    if (res.statusCode >= 400 || res.statusCode === 202) {
      query('DELETE FROM request_guards WHERE key = $1', [key]).catch(() => {});
    }
  });
  // Old fingerprints are useless after the window — trim now and then.
  if (Math.random() < 0.02) {
    query(`DELETE FROM request_guards WHERE expires_at < NOW() - INTERVAL '1 hour'`).catch(() => {});
  }
  next();
};
