// ============================================================================
// LEADER LOCK — run a background job on exactly ONE instance at a time.
// ----------------------------------------------------------------------------
// The schedulers (daily reconciliation, hourly abandoned-cart reminders) live
// inside the web process, so every replica would otherwise fire the same job
// in parallel — duplicate alerts, duplicate reminder notifications, and two
// reconciliation runs racing to write the same baseline snapshot.
//
// A transaction-scoped Postgres advisory lock, held on a dedicated pooled
// client for the duration of the job, makes each run exclusive across
// instances. Transaction scope (not session scope) is deliberate: Supabase's
// transaction pooler (:6543) may hand a session's statements to different
// server connections, which breaks pg_advisory_lock/unlock pairs — but a
// single open transaction is always pinned to one connection. The lock
// releases itself if the holder dies (the transaction is rolled back).
// ============================================================================

import { withClient } from '../config/database';
import logger from './logger';

/**
 * Runs `fn` only if this process wins the advisory lock named `lockName`.
 * Resolves to `null` (without running `fn`) when another instance holds it.
 * `fn` does its own work through the normal pool; the lock-holding client is
 * used for nothing but keeping the transaction (and therefore the lock) open.
 */
export async function runExclusively<T>(lockName: string, fn: () => Promise<T>): Promise<T | null> {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const r = await client.query<{ ok: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)::bigint) AS ok',
        [lockName]
      );
      if (!r.rows[0]?.ok) {
        logger.info('Skipping scheduled job — another instance holds the lock', { lockName });
        return null;
      }
      return await fn();
    } finally {
      // Nothing was written on this client; ROLLBACK simply ends the
      // transaction and releases the advisory lock.
      await client.query('ROLLBACK').catch((err) =>
        logger.warn('Leader-lock transaction cleanup failed (lock releases with the connection)', {
          lockName,
          err,
        })
      );
    }
  });
}
