// ============================================================================
// PROFIT CALCULATION — shared by the admin Profit view and the shareholder
// portal so both see the SAME numbers for a city + period.
//   profit = Σ delivered-order sales − refunds − stock cost
//            − per-order rider pay (orders.rider_delivery_charge)
//            − other expenses
//   Per-order rider pay is a real cost on every delivered order: on COD the
//   rider keeps it out of the cash, on OCP orders the company owes it. It is
//   counted here automatically, so a manual "Pay rider → per-order pay"
//   expense (category 'commission') is a hand-over of money already counted
//   and is NOT subtracted a second time. Salary / other rider payments are.
//   FreshBazar share (if enabled) = per-order fixed | per-category % | % margin
//   distributable = profit − FreshBazar share
// ============================================================================

import { query } from '../config/database';
import { BUSINESS_TZ, TODAY_SQL, isThisMonthSql, localDate, localMidnight, localTs } from './businessTime';

export interface ProfitPeriod {
  period?: string;          // 'today' | 'month'
  month?: number;
  year?: number;
  date?: string;            // YYYY-MM-DD
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Period SQL fragment + params for a timestamptz column (most specific wins).
 * Days and months are Pakistan days/months (see utils/businessTime).
 */
export function periodClause(col: string, p: ProfitPeriod, startIndex: number): { sql: string; params: any[] } {
  const params: any[] = [];
  if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
    params.push(p.date);
    return { sql: ` AND ${localDate(col)} = $${startIndex}::date`, params };
  }
  if (Number.isInteger(p.month) && (p.month as number) >= 1 && (p.month as number) <= 12 && Number.isInteger(p.year)) {
    params.push(p.year, p.month);
    return { sql: ` AND EXTRACT(YEAR FROM ${localTs(col)}) = $${startIndex} AND EXTRACT(MONTH FROM ${localTs(col)}) = $${startIndex + 1}`, params };
  }
  if (p.period === 'today') return { sql: ` AND ${localDate(col)} = ${TODAY_SQL}`, params };
  if (p.period === 'month') return { sql: ` AND ${isThisMonthSql(col)}`, params };
  return { sql: '', params };
}

/** Stock bought up to the END of the period (Pakistan time) counts for its cost. */
function purchaseCostCutoffClause(col: string, p: ProfitPeriod, startIndex: number): { sql: string; params: any[] } {
  const params: any[] = [];
  if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
    params.push(p.date);
    return { sql: ` AND ${col} < ${localMidnight(`$${startIndex}::date + 1`)}`, params };
  }
  if (Number.isInteger(p.month) && (p.month as number) >= 1 && (p.month as number) <= 12 && Number.isInteger(p.year)) {
    params.push(p.year, p.month);
    return { sql: ` AND ${col} < ${localMidnight(`make_date($${startIndex}::int, $${startIndex + 1}::int, 1) + INTERVAL '1 month'`)}`, params };
  }
  if (p.period === 'today') return { sql: ` AND ${col} < ${localMidnight(`${TODAY_SQL} + 1`)}`, params };
  if (p.period === 'month') {
    return { sql: ` AND ${col} < ${localMidnight(`date_trunc('month', NOW() AT TIME ZONE '${BUSINESS_TZ}') + INTERVAL '1 month'`)}`, params };
  }
  return { sql: '', params };
}

/** Read period params off an Express query object. */
export function periodFromQuery(q: any): ProfitPeriod {
  return {
    period: typeof q.period === 'string' ? q.period : undefined,
    month: q.month !== undefined ? parseInt(String(q.month), 10) : undefined,
    year: q.year !== undefined ? parseInt(String(q.year), 10) : undefined,
    date: typeof q.date === 'string' ? q.date : undefined,
  };
}

export interface CityProfit {
  totalSale: number;
  orderCount: number;
  totalExpenses: number;
  inventoryCost: number;
  operatingExpenses: number;
  /** Money handed back on delivered orders in the period (refunds ledger). */
  refunds: number;
  /** Σ per-order rider pay on the period's delivered orders. */
  riderDeliveryPay: number;
  profit: number;
  freshbazarShare: number;
  distributable: number;
  settings: { enabled: boolean; mode: string; perOrder: number; marginPercent: number };
}

const defaultSettings = () => ({ enabled: false, mode: 'per_order_fixed', perOrder: 0, marginPercent: 0 });

/** Compute a city's profit + FreshBazar share + distributable for a period. */
export async function computeCityProfit(cityId: string, p: ProfitPeriod): Promise<CityProfit> {
  const saleP = periodClause('o.delivered_at', p, 2);
  const sales = await query(
    `SELECT COALESCE(SUM(o.total_amount),0) AS total, COUNT(*) AS orders,
            COALESCE(SUM(COALESCE(o.rider_delivery_charge, 0)),0) AS rider_pay
       FROM orders o
      WHERE o.deleted_at IS NULL AND o.status = 'delivered' AND o.city_id = $1${saleP.sql}`,
    [cityId, ...saleP.params]
  );
  const totalSale = parseFloat(sales.rows[0].total) || 0;
  const orderCount = Number(sales.rows[0].orders) || 0;
  const riderDeliveryPay = parseFloat(sales.rows[0].rider_pay) || 0;

  // Refunds paid out on delivered orders of this city reduce real sales.
  // (Refunded/cancelled orders are already excluded by status above; this
  // catches partial refunds via complaints on orders that stay delivered.)
  let refunds = 0;
  const refundsTable = await query(`SELECT to_regclass('public.refunds') IS NOT NULL AS ok`);
  if (refundsTable.rows[0]?.ok) {
    const refP = periodClause('r.created_at', p, 2);
    const ref = await query(
      `SELECT COALESCE(SUM(r.amount),0) AS total
         FROM refunds r
         JOIN orders o ON o.id = r.order_id
        WHERE o.deleted_at IS NULL AND o.status = 'delivered' AND o.city_id = $1${refP.sql}`,
      [cityId, ...refP.params]
    );
    refunds = parseFloat(ref.rows[0].total) || 0;
  }

  const expP = periodClause('incurred_at', p, 2);
  const exp = await query(
    `SELECT COALESCE(SUM(amount),0) AS total
       FROM expenses
      WHERE city_id = $1 AND type <> 'stock_purchase'
        AND NOT (type = 'rider_payment' AND COALESCE(category, '') = 'commission')${expP.sql}`,
    [cityId, ...expP.params]
  );
  const operatingExpenses = parseFloat(exp.rows[0].total) || 0;

  const costP = purchaseCostCutoffClause('sp.purchased_at', p, 2 + saleP.params.length);
  const inventory = await query(
    `WITH sold AS (
       SELECT oi.product_id,
              COALESCE(oi.quality, 'A') AS quality,
              SUM(
                CASE
                  WHEN oi.final_weight_kg IS NOT NULL THEN GREATEST(0, oi.final_weight_kg)
                  ELSE oi.quantity * CASE COALESCE(oi.unit, 'full')
                    WHEN 'half_kg' THEN 0.5
                    WHEN 'quarter_kg' THEN 0.25
                    WHEN 'half_dozen' THEN 0.5
                    ELSE 1
                  END
                END
              ) AS qty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.deleted_at IS NULL
          AND o.status = 'delivered'
          AND o.city_id = $1
          AND oi.product_id IS NOT NULL${saleP.sql}
        GROUP BY oi.product_id, COALESCE(oi.quality, 'A')
     ),
     purchase_units AS (
       SELECT sp.product_id,
              q.quality,
              q.qty,
              CASE
                WHEN (COALESCE(sp.grade_a,0) + COALESCE(sp.grade_b,0) + COALESCE(sp.grade_c,0)) > 0
                THEN sp.purchase_price * (q.qty / NULLIF(COALESCE(sp.grade_a,0) + COALESCE(sp.grade_b,0) + COALESCE(sp.grade_c,0), 0))
                ELSE 0
              END AS allocated_cost
         FROM stock_purchases sp
         CROSS JOIN LATERAL (
           VALUES
             ('A', COALESCE(sp.grade_a,0)),
             ('B', COALESCE(sp.grade_b,0)),
             ('C', COALESCE(sp.grade_c,0))
         ) AS q(quality, qty)
        WHERE sp.city_id = $1
          AND q.qty > 0${costP.sql}
     ),
     avg_cost AS (
       SELECT product_id, quality, SUM(allocated_cost) / NULLIF(SUM(qty), 0) AS unit_cost
         FROM purchase_units
        GROUP BY product_id, quality
     )
     SELECT COALESCE(SUM(s.qty * COALESCE(a.unit_cost, 0)), 0) AS total
       FROM sold s
       LEFT JOIN avg_cost a ON a.product_id = s.product_id AND a.quality = s.quality`,
    [cityId, ...saleP.params, ...costP.params]
  );
  const inventoryCost = parseFloat(inventory.rows[0].total) || 0;
  const totalExpenses = operatingExpenses + inventoryCost + riderDeliveryPay;
  const profit = round2(totalSale - refunds - totalExpenses);

  const setRow = await query(`SELECT * FROM profit_settings WHERE city_id = $1`, [cityId]);
  const s = setRow.rows[0] || null;
  let freshbazarShare = 0;
  if (s && s.freshbazar_enabled) {
    if (s.freshbazar_mode === 'per_order_fixed') {
      freshbazarShare = orderCount * (parseFloat(s.freshbazar_per_order) || 0);
    } else if (s.freshbazar_mode === 'profit_margin_percent') {
      freshbazarShare = profit > 0 ? profit * ((parseFloat(s.freshbazar_margin_percent) || 0) / 100) : 0;
    } else if (s.freshbazar_mode === 'category_percent') {
      const catP = periodClause('o.delivered_at', p, 2);
      const catSale = await query(
        `SELECT pr.category_id, COALESCE(SUM(oi.total_price),0) AS sale
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN products pr ON pr.id = oi.product_id
          WHERE o.deleted_at IS NULL AND o.status = 'delivered' AND o.city_id = $1${catP.sql}
          GROUP BY pr.category_id`,
        [cityId, ...catP.params]
      );
      const shares = await query(`SELECT category_id, percent FROM profit_category_shares WHERE city_id = $1`, [cityId]);
      const pct: Record<string, number> = {};
      for (const row of shares.rows) pct[row.category_id] = parseFloat(row.percent) || 0;
      for (const c of catSale.rows) freshbazarShare += (parseFloat(c.sale) || 0) * ((pct[c.category_id] || 0) / 100);
    }
  }
  freshbazarShare = round2(Math.max(0, freshbazarShare));

  return {
    totalSale: round2(totalSale), orderCount, totalExpenses: round2(totalExpenses),
    inventoryCost: round2(inventoryCost), operatingExpenses: round2(operatingExpenses),
    refunds: round2(refunds), riderDeliveryPay: round2(riderDeliveryPay), profit,
    freshbazarShare, distributable: round2(profit - freshbazarShare),
    settings: s ? { enabled: s.freshbazar_enabled === true, mode: s.freshbazar_mode, perOrder: parseFloat(s.freshbazar_per_order) || 0, marginPercent: parseFloat(s.freshbazar_margin_percent) || 0 } : defaultSettings(),
  };
}
