// ============================================================================
// RIDER SCHEMA PROBES — cached checks for objects added by later migrations,
// so rider endpoints keep working on a database that has not run them yet.
//   • rider_cash_settlements / _orders      (migration 41)
//   • rider_tasks.arrived_at                (migration 57)
//   • atta_requests.paid_amount + rider_cash_settlement_atta (migration 57)
// A probe that returns false is retried after RETRY_MS so a deploy that runs
// the migration after boot is picked up without a restart.
// ============================================================================

import { query } from './database';

const RETRY_MS = 5 * 60 * 1000;

type Probe = { value: boolean | null; checkedAt: number };

function makeProbe(sql: string, params: unknown[], expect: (rows: any[]) => boolean) {
  const state: Probe = { value: null, checkedAt: 0 };
  return async (): Promise<boolean> => {
    if (state.value === true) return true;
    if (state.value === false && Date.now() - state.checkedAt < RETRY_MS) return false;
    try {
      const r = await query(sql, params);
      state.value = expect(r.rows);
    } catch {
      state.value = false;
    }
    state.checkedAt = Date.now();
    return state.value;
  };
}

/** rider_cash_settlements + rider_cash_settlement_orders exist. */
export const hasRiderCashSettlementTables = makeProbe(
  `SELECT COUNT(*)::int AS count
     FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('rider_cash_settlements', 'rider_cash_settlement_orders')`,
  [],
  (rows) => Number(rows[0]?.count || 0) === 2
);

/** rider_tasks.arrived_at exists. */
export const hasRiderTaskArrivedColumn = makeProbe(
  `SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rider_tasks' AND column_name = 'arrived_at'`,
  [],
  (rows) => rows.length > 0
);

/** atta_requests.paid_amount/collected_by_rider_id + rider_cash_settlement_atta exist. */
export const hasAttaCashColumns = makeProbe(
  `SELECT
      (SELECT COUNT(*)::int FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'atta_requests'
          AND column_name IN ('paid_amount', 'collected_by_rider_id')) AS cols,
      (SELECT COUNT(*)::int FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'rider_cash_settlement_atta') AS tbl`,
  [],
  (rows) => Number(rows[0]?.cols || 0) === 2 && Number(rows[0]?.tbl || 0) === 1
);
