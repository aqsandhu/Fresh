// ============================================================================
// PROFIT CALCULATION — shared by the admin Profit view and the shareholder
// portal so both see the SAME numbers for a city + period.
//   profit = Σ delivered-order sales − Σ expenses
//   FreshBazar share (if enabled) = per-order fixed | per-category % | % margin
//   distributable = profit − FreshBazar share
// ============================================================================

import { query } from '../config/database';

export interface ProfitPeriod {
  period?: string;          // 'today' | 'month'
  month?: number;
  year?: number;
  date?: string;            // YYYY-MM-DD
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Period SQL fragment + params for a timestamp column (most specific wins). */
export function periodClause(col: string, p: ProfitPeriod, startIndex: number): { sql: string; params: any[] } {
  const params: any[] = [];
  if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
    params.push(p.date);
    return { sql: ` AND ${col}::date = $${startIndex}::date`, params };
  }
  if (Number.isInteger(p.month) && (p.month as number) >= 1 && (p.month as number) <= 12 && Number.isInteger(p.year)) {
    params.push(p.year, p.month);
    return { sql: ` AND EXTRACT(YEAR FROM ${col}) = $${startIndex} AND EXTRACT(MONTH FROM ${col}) = $${startIndex + 1}`, params };
  }
  if (p.period === 'today') return { sql: ` AND ${col}::date = CURRENT_DATE`, params };
  if (p.period === 'month') return { sql: ` AND date_trunc('month', ${col}) = date_trunc('month', CURRENT_DATE)`, params };
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
    `SELECT COALESCE(SUM(o.total_amount),0) AS total, COUNT(*) AS orders
       FROM orders o
      WHERE o.deleted_at IS NULL AND o.status = 'delivered' AND o.city_id = $1${saleP.sql}`,
    [cityId, ...saleP.params]
  );
  const totalSale = parseFloat(sales.rows[0].total) || 0;
  const orderCount = Number(sales.rows[0].orders) || 0;

  const expP = periodClause('incurred_at', p, 2);
  const exp = await query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE city_id = $1${expP.sql}`,
    [cityId, ...expP.params]
  );
  const totalExpenses = parseFloat(exp.rows[0].total) || 0;
  const profit = round2(totalSale - totalExpenses);

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
    totalSale: round2(totalSale), orderCount, totalExpenses: round2(totalExpenses), profit,
    freshbazarShare, distributable: round2(profit - freshbazarShare),
    settings: s ? { enabled: s.freshbazar_enabled === true, mode: s.freshbazar_mode, perOrder: parseFloat(s.freshbazar_per_order) || 0, marginPercent: parseFloat(s.freshbazar_margin_percent) || 0 } : defaultSettings(),
  };
}
