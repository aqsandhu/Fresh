// ============================================================================
// Rider availability — ONE rule for riders.status everywhere a task changes.
//
//   • offline / on_leave stay as they are (only the rider's duty toggle or an
//     admin changes those). Finishing a delivery must never put an off-duty
//     rider back on the dispatch list.
//   • otherwise: 'busy' while the rider holds any active task
//     (assigned / in_progress), 'available' when the hands are empty.
//
// Before this, deliver / fail always wrote 'available' (even with two more
// orders on the bike, or after the rider went off duty), a displaced rider
// stayed 'busy' forever, and login forced 'available'.
// ============================================================================

import type { QueryResult } from 'pg';
import { query as poolQuery } from '../config/database';

export type Queryable = { query: (sql: string, params?: unknown[]) => Promise<QueryResult<any>> };

const defaultRunner: Queryable = { query: (sql, params) => poolQuery(sql, params as any[]) };

export const ACTIVE_TASK_STATUSES = ['assigned', 'in_progress'] as const;

/**
 * Recompute riders.status for one rider from his active tasks. Returns the
 * resulting status (or null when the rider does not exist).
 */
export async function syncRiderAvailability(
  riderId: string | null | undefined,
  runner: Queryable = defaultRunner
): Promise<string | null> {
  if (!riderId) return null;
  const result = await runner.query(
    `UPDATE riders r
        SET status = CASE
              WHEN r.status IN ('offline', 'on_leave') THEN r.status
              WHEN EXISTS (
                SELECT 1 FROM rider_tasks t
                 WHERE t.rider_id = r.id AND t.status IN ('assigned', 'in_progress')
              ) THEN 'busy'::rider_status
              ELSE 'available'::rider_status
            END,
            updated_at = NOW()
      WHERE r.id = $1
      RETURNING r.status`,
    [riderId]
  );
  return result.rows[0]?.status ?? null;
}

/** Same rule for several riders (e.g. every rider displaced by a cancel). */
export async function syncRidersAvailability(
  riderIds: Array<string | null | undefined>,
  runner: Queryable = defaultRunner
): Promise<void> {
  const unique = Array.from(new Set(riderIds.filter((id): id is string => Boolean(id))));
  for (const id of unique) {
    await syncRiderAvailability(id, runner);
  }
}

/**
 * The status a rider asked for via the duty toggle, adjusted for the tasks he
 * still holds: going "available" with an order on the bike means 'busy'.
 */
export function resolveDutyStatus(requested: string, hasActiveTasks: boolean): string {
  if (requested === 'available' && hasActiveTasks) return 'busy';
  return requested;
}
