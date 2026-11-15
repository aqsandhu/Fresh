// ============================================================================
// BACKGROUND JOB FAILURES REACH THE OWNER
//
// The daily books-watchdog (reconciliation) is one of the anti-corruption
// controls. When it failed, the error went to the server log only — nobody
// reads that, so the owner could go for weeks believing the books were being
// checked. A failed job now:
//   • goes to error monitoring (Sentry, when configured),
//   • puts a notification in every super admin's bell (and a live alert),
// at most once per job per ALERT_EVERY_MS so a job failing every hour does not
// flood the bell.
// ============================================================================

import { recordJobFailure } from './metrics';
import { query } from '../config/database';
import { emitToSuperAdmins } from '../config/socket';
import { captureException } from '../config/sentry';
import logger from './logger';

const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;
const lastAlert = new Map<string, number>();

/** For tests. */
export function resetJobAlerts(): void {
  lastAlert.clear();
}

export async function reportJobFailure(job: string, label: string, err: unknown): Promise<boolean> {
  const message = (err as Error)?.message || String(err);
  logger.error(`${label} failed`, { job, error: message });
  recordJobFailure(job);
  try {
    captureException(err instanceof Error ? err : new Error(message), { job });
  } catch {
    /* monitoring must never break the job runner */
  }
  const now = Date.now();
  if (now - (lastAlert.get(job) || 0) < ALERT_EVERY_MS) return false;
  lastAlert.set(job, now);
  try {
    const supers = await query(
      `SELECT id FROM users WHERE role = 'super_admin' AND status = 'active' AND deleted_at IS NULL`
    );
    for (const s of supers.rows) {
      await query(
        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'job_failed', $2, $3)`,
        [s.id, `${label} did not run`, `${label} failed: ${message.slice(0, 300)}. It will try again on its next run; if this keeps happening, the checks are not being done.`]
      );
    }
    emitToSuperAdmins('job:failed', { job, label, message: message.slice(0, 300), at: new Date().toISOString() });
  } catch (notifyErr) {
    logger.warn('Could not notify super admins about a failed job', { job, error: (notifyErr as Error)?.message });
  }
  return true;
}
