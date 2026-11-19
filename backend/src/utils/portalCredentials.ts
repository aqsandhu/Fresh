// ============================================================================
// PORTAL CREDENTIAL CHANGES END OLD SESSIONS (B38, round 10)
//
// Shareholder and OCP portal tokens are plain 12-hour JWTs (no refresh token
// to revoke). Changing a password / PIN — often BECAUSE it leaked — left every
// token issued before the change working for up to 12 hours. Each portal row
// now records when its credentials last changed; a token issued before that
// moment is refused. Works before migration 74 too (the column simply reads
// as missing and nothing is refused).
// ============================================================================

import { asCaughtError } from './caughtError';
import { query } from '../config/database';
import logger from './logger';

export type PortalTable = 'shareholders' | 'order_collection_points';

const columnCache = new Map<PortalTable, boolean>();

/** True once migration 74 added credentials_changed_at to this table. */
export async function hasCredentialsChangedColumn(table: PortalTable): Promise<boolean> {
  const cached = columnCache.get(table);
  if (cached !== undefined) return cached;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'credentials_changed_at' LIMIT 1`,
      [table]
    );
    const present = (r.rowCount ?? 0) > 0;
    // Only remember "present" — a missing column may appear after a deploy's
    // migration without a restart.
    if (present) columnCache.set(table, true);
    return present;
  } catch (errorCaught: unknown) {
    const error = asCaughtError(errorCaught);
    logger.warn('Could not probe credentials_changed_at', { table, error: error?.message });
    return false;
  }
}

/** Record that this account's password / PIN just changed (ends older tokens). */
export async function markCredentialsChanged(table: PortalTable, id: string): Promise<void> {
  if (!(await hasCredentialsChangedColumn(table))) return;
  await query(`UPDATE ${table} SET credentials_changed_at = NOW() WHERE id = $1`, [id]);
}

/**
 * Was this token issued before the account's last password / PIN change?
 * `iat` is whole seconds; the change time is floored to seconds so a token
 * minted right after the change (same second) still works.
 */
export function tokenPredatesCredentialChange(
  iat: number | undefined | null,
  changedAt: Date | string | null | undefined
): boolean {
  if (!changedAt || typeof iat !== 'number') return false;
  const changedMs = new Date(changedAt).getTime();
  if (!Number.isFinite(changedMs)) return false;
  return iat < Math.floor(changedMs / 1000);
}

/** SQL fragment that reads the column whether or not migration 74 ran. */
export const CREDENTIALS_CHANGED_SELECT = (alias: string) =>
  `(to_jsonb(${alias}) ->> 'credentials_changed_at') AS credentials_changed_at`;
