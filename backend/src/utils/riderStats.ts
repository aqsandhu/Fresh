// ============================================================================
// Rider stats — shared by the rider app (GET /rider/stats, /rider/stats/today)
// and the admin panel (GET /admin/riders/:id/stats) so both always show the
// same numbers.
//
// Business timezone is Asia/Karachi and a delivery belongs to the day it was
// DELIVERED. The old code built windows with the server's local clock (UTC on
// Render → "today" started at 05:00 PKT) and filtered on placed_at, so an
// order placed last night and delivered this morning landed in yesterday.
//
// Cash model (COD):
//   • A direct (non-OCP) COD order delivered by the rider: the rider collected
//     paid_amount and keeps his rider_delivery_charge; he owes the rest.
//   • An Atta Chakki delivery he completed: he collected atta paid_amount and
//     owes all of it (atta carries no rider pay).
//   • OCP orders: the cash goes to the collection point, not the company.
// "Unsettled" = not yet linked to a rider_cash_settlements row — exactly the
// lines the admin "Receive cash" action settles.
// ============================================================================

import { query } from '../config/database';
import { hasAttaCashColumns, hasRiderCashSettlementTables } from '../config/riderSchema';

import { BUSINESS_TZ } from './businessTime';

export { BUSINESS_TZ };

export interface PeriodStats {
  /** Delivered orders in the period. */
  orders: number;
  /** Rider pay (rider_delivery_charge) for those orders. */
  earnings: number;
  /** Atta Chakki pickups + deliveries completed in the period. */
  attaTasks: number;
}

export interface RiderPaymentStats {
  /** All-time COD cash collected (direct orders + atta). */
  totalCollected: number;
  /** All-time rider pay on delivered orders. */
  totalEarned: number;
  /** Rider pay on COD orders where he kept it out of the cash. */
  codEarned: number;
  /** Rider pay on orders where no cash passed through him (OCP / prepaid) — owed BY the company. */
  nonCashEarned: number;
  /** Cash already handed over (received settlements). */
  totalSettled: number;
  /** Customer cash still with the rider (unsettled lines, his share included). */
  cashInHand: number;
  /** His own pay inside cashInHand (kept, not handed over). */
  unsettledEarned: number;
  /** cashInHand − unsettledEarned → what he must hand to the company. */
  paymentPending: number;
  /** Unsettled lines (orders + atta) — what "Receive cash" will settle. */
  pendingOrders: number;
  pendingAtta: number;
}

export interface RiderStatsResult {
  stats: {
    today: PeriodStats;
    thisWeek: PeriodStats;
    lastWeek: PeriodStats;
    thisMonth: PeriodStats;
    lastMonth: PeriodStats;
  };
  payment: RiderPaymentStats;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Local (Asia/Karachi) period bounds as SQL expressions over `ts` (timestamptz). */
const PERIOD_SQL = (ts: string) => {
  const local = `(${ts} AT TIME ZONE '${BUSINESS_TZ}')`;
  const now = `(NOW() AT TIME ZONE '${BUSINESS_TZ}')`;
  return {
    today: `${local} >= date_trunc('day', ${now})`,
    thisWeek: `${local} >= date_trunc('week', ${now})`,
    lastWeek: `${local} >= date_trunc('week', ${now}) - INTERVAL '7 days' AND ${local} < date_trunc('week', ${now})`,
    thisMonth: `${local} >= date_trunc('month', ${now})`,
    lastMonth: `${local} >= date_trunc('month', ${now}) - INTERVAL '1 month' AND ${local} < date_trunc('month', ${now})`,
  };
};

const PERIODS = ['today', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'] as const;

export async function computeRiderStats(riderId: string): Promise<RiderStatsResult> {
  const [settlementsReady, attaCashReady] = await Promise.all([
    hasRiderCashSettlementTables(),
    hasAttaCashColumns(),
  ]);

  // ── Orders: per-period counts/earnings on delivered_at ──────────────────
  const oTs = 'COALESCE(o.delivered_at, o.updated_at)';
  const op = PERIOD_SQL(oTs);
  const periodCols = PERIODS.map(
    (p) => `COUNT(*) FILTER (WHERE ${op[p]}) AS ${p}_orders,
            COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE ${op[p]}), 0) AS ${p}_earnings`
  ).join(',\n');

  const directCod = `o.payment_method = 'cash_on_delivery' AND o.payment_status = 'completed' AND o.ocp_id IS NULL`;
  const unsettledOrder = settlementsReady
    ? `NOT EXISTS (SELECT 1 FROM rider_cash_settlement_orders so WHERE so.order_id = o.id)`
    : 'TRUE';

  const orderRes = await query(
    `SELECT
       ${periodCols},
       COALESCE(SUM(o.rider_delivery_charge), 0) AS total_earned,
       COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE ${directCod}), 0) AS cod_earned,
       COALESCE(SUM(o.paid_amount) FILTER (WHERE ${directCod}), 0) AS order_collected,
       COALESCE(SUM(o.paid_amount) FILTER (WHERE ${directCod} AND ${unsettledOrder}), 0) AS order_unsettled_cash,
       COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE ${directCod} AND ${unsettledOrder}), 0) AS order_unsettled_earned,
       COALESCE(SUM(GREATEST(o.paid_amount - COALESCE(o.rider_delivery_charge, 0), 0))
         FILTER (WHERE ${directCod} AND ${unsettledOrder}), 0) AS order_unsettled_due,
       COUNT(*) FILTER (WHERE ${directCod} AND ${unsettledOrder}
                          AND o.paid_amount - COALESCE(o.rider_delivery_charge, 0) > 0) AS order_unsettled_count
     FROM orders o
    WHERE o.rider_id = $1 AND o.status = 'delivered' AND o.deleted_at IS NULL`,
    [riderId]
  );
  const o = orderRes.rows[0] || {};

  // ── Atta tasks completed per period (pickups + deliveries) ──────────────
  const tp = PERIOD_SQL('rt.completed_at');
  const attaTaskRes = await query(
    `SELECT ${PERIODS.map((p) => `COUNT(*) FILTER (WHERE ${tp[p]}) AS ${p}_atta`).join(', ')}
       FROM rider_tasks rt
      WHERE rt.rider_id = $1 AND rt.status = 'completed'
        AND rt.task_type IN ('atta_pickup', 'atta_delivery')`,
    [riderId]
  );
  const a = attaTaskRes.rows[0] || {};

  // ── Atta cash collected by this rider ───────────────────────────────────
  let attaCollected = 0;
  let attaUnsettled = 0;
  let attaUnsettledCount = 0;
  if (attaCashReady) {
    const attaCash = await query(
      `SELECT COALESCE(SUM(ar.paid_amount), 0) AS collected,
              COALESCE(SUM(ar.paid_amount) FILTER (
                WHERE NOT EXISTS (SELECT 1 FROM rider_cash_settlement_atta sa WHERE sa.atta_request_id = ar.id)
              ), 0) AS unsettled,
              COUNT(*) FILTER (
                WHERE ar.paid_amount > 0
                  AND NOT EXISTS (SELECT 1 FROM rider_cash_settlement_atta sa WHERE sa.atta_request_id = ar.id)
              ) AS unsettled_count
         FROM atta_requests ar
        WHERE ar.collected_by_rider_id = $1 AND ar.status = 'delivered'`,
      [riderId]
    );
    attaCollected = num(attaCash.rows[0]?.collected);
    attaUnsettled = num(attaCash.rows[0]?.unsettled);
    attaUnsettledCount = num(attaCash.rows[0]?.unsettled_count);
  }

  // ── Settled so far ──────────────────────────────────────────────────────
  let totalSettled = 0;
  if (settlementsReady) {
    const settled = await query(
      `SELECT COALESCE(SUM(amount), 0) AS settled
         FROM rider_cash_settlements
        WHERE rider_id = $1 AND status = 'received'`,
      [riderId]
    );
    totalSettled = num(settled.rows[0]?.settled);
  }

  const stats = Object.fromEntries(
    PERIODS.map((p) => [
      p,
      { orders: num(o[`${p.toLowerCase()}_orders`]), earnings: round2(num(o[`${p.toLowerCase()}_earnings`])), attaTasks: num(a[`${p.toLowerCase()}_atta`]) },
    ])
  ) as RiderStatsResult['stats'];

  const totalEarned = round2(num(o.total_earned));
  const codEarned = round2(num(o.cod_earned));
  const cashInHand = round2(num(o.order_unsettled_cash) + attaUnsettled);
  const unsettledEarned = round2(num(o.order_unsettled_earned));
  const paymentPending = round2(num(o.order_unsettled_due) + attaUnsettled);

  return {
    stats,
    payment: {
      totalCollected: round2(num(o.order_collected) + attaCollected),
      totalEarned,
      codEarned,
      nonCashEarned: round2(Math.max(totalEarned - codEarned, 0)),
      totalSettled: round2(totalSettled),
      cashInHand,
      unsettledEarned,
      paymentPending,
      pendingOrders: num(o.order_unsettled_count),
      pendingAtta: attaUnsettledCount,
    },
  };
}

/** Today's deliveries + pay for the rider dashboard (Asia/Karachi day). */
export async function computeRiderToday(riderId: string): Promise<{
  date: string;
  totalDeliveries: number;
  totalEarnings: number;
  attaTasks: number;
}> {
  const today = PERIOD_SQL('COALESCE(o.delivered_at, o.updated_at)').today;
  const tasksToday = PERIOD_SQL('rt.completed_at').today;
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM orders o
         WHERE o.rider_id = $1 AND o.status = 'delivered' AND o.deleted_at IS NULL AND ${today}) AS deliveries,
       (SELECT COALESCE(SUM(o.rider_delivery_charge), 0) FROM orders o
         WHERE o.rider_id = $1 AND o.status = 'delivered' AND o.deleted_at IS NULL AND ${today}) AS earnings,
       (SELECT COUNT(*) FROM rider_tasks rt
         WHERE rt.rider_id = $1 AND rt.status = 'completed'
           AND rt.task_type IN ('atta_pickup', 'atta_delivery') AND ${tasksToday}) AS atta,
       to_char(NOW() AT TIME ZONE '${BUSINESS_TZ}', 'YYYY-MM-DD') AS local_date`,
    [riderId]
  );
  const r = result.rows[0] || {};
  return {
    date: r.local_date,
    totalDeliveries: num(r.deliveries),
    totalEarnings: round2(num(r.earnings)),
    attaTasks: num(r.atta),
  };
}
