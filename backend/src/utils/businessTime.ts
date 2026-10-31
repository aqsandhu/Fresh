// ============================================================================
// Business time (Asia/Karachi) for SQL.
//
// The DB session runs in UTC, and production goes through Supabase's
// TRANSACTION pooler (:6543), where a per-session `SET TIME ZONE` is not
// reliable. So "today", "this month" and "on 2026-10-31" are written with an
// explicit AT TIME ZONE in every report query instead of relying on
// CURRENT_DATE / ::date (which used the UTC day: 00:00–05:00 PKT orders landed
// on the previous day and month boundaries were 5 h off).
// ============================================================================

export const BUSINESS_TZ = 'Asia/Karachi';

/** Local wall-clock timestamp of a timestamptz column/expression. */
export const localTs = (col: string): string => `(${col} AT TIME ZONE '${BUSINESS_TZ}')`;

/** Local calendar date of a timestamptz column/expression. */
export const localDate = (col: string): string => `(${col} AT TIME ZONE '${BUSINESS_TZ}')::date`;

/** Today's date in Pakistan. */
export const TODAY_SQL = `(NOW() AT TIME ZONE '${BUSINESS_TZ}')::date`;

/** timestamptz of local midnight at the start of a date expression. */
export const localMidnight = (dateExpr: string): string => `((${dateExpr})::timestamp AT TIME ZONE '${BUSINESS_TZ}')`;

/** `col` falls on today's local date (index-friendly range form). */
export const isTodaySql = (col: string): string =>
  `(${col} >= ${localMidnight(TODAY_SQL)} AND ${col} < ${localMidnight(`${TODAY_SQL} + 1`)})`;

/** `col` falls in the current local calendar month. */
export const isThisMonthSql = (col: string): string =>
  `date_trunc('month', ${localTs(col)}) = date_trunc('month', NOW() AT TIME ZONE '${BUSINESS_TZ}')`;

/** Pakistan has no DST: a fixed UTC+05:00. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Today's (or the given instant's) date in Pakistan as YYYY-MM-DD. */
export const pktDateString = (at: Date = new Date()): string =>
  new Date(at.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);

/** Weekday (0 = Sunday) of a YYYY-MM-DD calendar date, independent of the server TZ. */
export const weekdayOfDate = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();
