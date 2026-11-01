// ============================================================================
// Probes for migration 60 (anti-corruption controls). Code keeps working on a
// database that hasn't run the migration yet: the new controls simply stay off
// until it has (re-checked every 5 minutes while missing).
// ============================================================================

import { query } from './database';

const RETRY_MS = 5 * 60 * 1000;

function makeProbe(sql: string, expect: (rows: any[]) => boolean) {
  const state: { value: boolean | null; checkedAt: number } = { value: null, checkedAt: 0 };
  return async (): Promise<boolean> => {
    if (state.value === true) return true;
    if (state.value === false && Date.now() - state.checkedAt < RETRY_MS) return false;
    try {
      state.value = expect((await query(sql)).rows);
    } catch {
      state.value = false;
    }
    state.checkedAt = Date.now();
    return state.value;
  };
}

const tableExists = (name: string) =>
  makeProbe(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${name}'`,
    (rows) => rows.length > 0
  );

/** approval_value_log exists (daily second-admin threshold). */
export const hasApprovalValueLog = tableExists('approval_value_log');

/** stock_counts exists (physical shelf counts). */
export const hasStockCounts = tableExists('stock_counts');

/** orders.cash_received_by exists (office "Payment received" receiver). */
export const hasOrderCashReceivedColumn = makeProbe(
  `SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cash_received_by'`,
  (rows) => rows.length > 0
);
