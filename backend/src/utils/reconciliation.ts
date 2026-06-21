// ============================================================================
// RECONCILIATION ENGINE — the owner's automatic watchdog.
//
// Runs periodically (and on demand). It proves, WITHOUT anyone watching, that:
//  1) every change in physical on-hand stock was explained by the audited
//     ledger (a gap = stock moved outside the controlled path → leak/corruption),
//  2) money-exit activity (refunds, free/discounted orders, waste) is summarised,
//  3) any admin's weight edits are not systematically biased upward (catches the
//     "+1kg × many orders" skim that no single edit reveals),
//  4) no OCP is sitting on collected cash too long / has open shortages.
//
// When anything doesn't add up it raises an in-app owner alert (socket +
// persistent notification for super-admins). Delivery is intentionally
// dependency-free (no new email/WhatsApp secrets); a channel can be plugged in
// later at the single alert point below.
// ============================================================================

import { query } from '../config/database';
import { emitToAdmins } from '../config/socket';
import logger from './logger';
import { ensureReconciliationTables } from '../config/reconciliationSchema';
import { hasCatalogV2Columns } from '../config/catalogV2Schema';
import { hasOcpTables } from '../config/ocpSchema';

const EPS = 0.01;
const OCP_CASH_OVERDUE_DAYS = Math.max(1, Number(process.env.OCP_CASH_OVERDUE_DAYS || 3));
const WEIGHT_BIAS_ALERT_VALUE = Math.max(0, Number(process.env.WEIGHT_BIAS_ALERT_VALUE || 1000));

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ReconciliationResult {
  ok: boolean;
  anomalyCount: number;
  summary: Record<string, unknown>;
  runId?: string;
}

export async function runReconciliation(opts: { createdBy?: string | null } = {}): Promise<ReconciliationResult> {
  if (!(await ensureReconciliationTables())) {
    return { ok: true, anomalyCount: 0, summary: { skipped: 'reconciliation tables unavailable' } };
  }

  const anomalies: any[] = [];

  // Window = since the previous run. First run only sets the baseline snapshot.
  const last = await query(`SELECT run_at FROM reconciliation_runs ORDER BY run_at DESC LIMIT 1`);
  const windowFrom: string | null = last.rows[0]?.run_at ?? null;

  // ── 1) STOCK CONSERVATION ──────────────────────────────────────────────────
  if (await hasCatalogV2Columns()) {
    const snapRes = await query(`SELECT product_id, quality, on_hand FROM stock_snapshots`);
    const snap = new Map<string, number>();
    for (const r of snapRes.rows) snap.set(`${r.product_id}:${r.quality}`, parseFloat(r.on_hand) || 0);

    const prodRes = await query(
      `SELECT id, name_en, stock_quantity, stock_quantity_b, stock_quantity_c
         FROM products WHERE is_active = TRUE`
    );
    const ledgerRes = await query(
      `SELECT product_id, quality, COALESCE(SUM(delta), 0) AS total
         FROM stock_movements
        WHERE ($1::timestamptz IS NULL OR created_at > $1)
        GROUP BY product_id, quality`,
      [windowFrom]
    );
    const ledger = new Map<string, number>();
    for (const r of ledgerRes.rows) ledger.set(`${r.product_id}:${r.quality}`, parseFloat(r.total) || 0);

    const cols: [string, string][] = [['A', 'stock_quantity'], ['B', 'stock_quantity_b'], ['C', 'stock_quantity_c']];
    for (const p of prodRes.rows) {
      for (const [q, col] of cols) {
        const curr = parseFloat(p[col]) || 0;
        const key = `${p.id}:${q}`;
        const prev = snap.get(key);
        if (prev !== undefined) {
          const expected = ledger.get(key) || 0;
          const actual = curr - prev;
          if (Math.abs(actual - expected) > EPS) {
            anomalies.push({
              type: 'stock_drift',
              product_id: p.id, product: p.name_en, quality: q,
              expected_change: round2(expected), actual_change: round2(actual),
              unexplained: round2(actual - expected),
            });
          }
        }
        await query(
          `INSERT INTO stock_snapshots (product_id, quality, on_hand, taken_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (product_id, quality) DO UPDATE SET on_hand = EXCLUDED.on_hand, taken_at = NOW()`,
          [p.id, q, curr]
        );
      }
    }
  }

  // ── 2) MONEY-EXIT DIGEST (since the last run) ──────────────────────────────
  const since = windowFrom;

  let refunds = { count: 0, total: 0 };
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
         FROM refunds WHERE ($1::timestamptz IS NULL OR created_at > $1)`,
      [since]
    );
    refunds = { count: Number(r.rows[0].count) || 0, total: round2(parseFloat(r.rows[0].total) || 0) };
  } catch { /* refunds table may not exist yet */ }

  let waste = { count: 0, qty: 0 };
  try {
    const w = await query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(-delta), 0) AS qty
         FROM stock_movements WHERE reason = 'waste' AND ($1::timestamptz IS NULL OR created_at > $1)`,
      [since]
    );
    waste = { count: Number(w.rows[0].count) || 0, qty: round2(parseFloat(w.rows[0].qty) || 0) };
  } catch { /* ignore */ }

  let discountedOrders = { count: 0 };
  try {
    const d = await query(
      `SELECT COUNT(*)::int AS count FROM orders
        WHERE replacement_for_order_id IS NOT NULL AND ($1::timestamptz IS NULL OR placed_at > $1)`,
      [since]
    );
    discountedOrders = { count: Number(d.rows[0].count) || 0 };
  } catch { /* column may not exist yet */ }

  const weightBias: any[] = [];
  try {
    const wb = await query(
      `SELECT edited_by, COUNT(*)::int AS edits, COALESCE(SUM(new_total - old_total), 0) AS net_value
         FROM order_item_weight_edits
        WHERE ($1::timestamptz IS NULL OR created_at > $1)
        GROUP BY edited_by`,
      [since]
    );
    for (const r of wb.rows) {
      const net = round2(parseFloat(r.net_value) || 0);
      if (net >= WEIGHT_BIAS_ALERT_VALUE) {
        const entry = { edited_by: r.edited_by, edits: Number(r.edits), net_upward_value: net };
        weightBias.push(entry);
        anomalies.push({ type: 'weight_upward_bias', ...entry });
      }
    }
  } catch { /* table may not exist yet */ }

  // ── 3) OCP CASH / SHORTAGES ────────────────────────────────────────────────
  const ocp: any = { overdue: [], open_shortages: 0 };
  if (await hasOcpTables()) {
    try {
      const overdue = await query(
        `SELECT o.id, o.name, COALESCE(SUM(od.paid_amount), 0) AS due, MIN(od.delivered_at) AS oldest
           FROM orders od JOIN order_collection_points o ON o.id = od.ocp_id
          WHERE od.deleted_at IS NULL AND od.paid_amount > 0 AND od.status = 'delivered'
            AND od.payment_method = 'cash_on_delivery' AND od.payment_status = 'completed'
            AND NOT EXISTS (SELECT 1 FROM ocp_settlement_orders so WHERE so.order_id = od.id)
            AND od.delivered_at < NOW() - ($1 || ' days')::interval
          GROUP BY o.id, o.name HAVING COALESCE(SUM(od.paid_amount), 0) > 0`,
        [String(OCP_CASH_OVERDUE_DAYS)]
      );
      ocp.overdue = overdue.rows.map((r: any) => ({ ocp_id: r.id, name: r.name, due: round2(parseFloat(r.due) || 0), oldest: r.oldest }));
      for (const o of ocp.overdue) anomalies.push({ type: 'ocp_cash_overdue', ...o });
      const sh = await query(`SELECT COUNT(*)::int AS c FROM ocp_stock_shortages WHERE status = 'open'`);
      ocp.open_shortages = Number(sh.rows[0].c) || 0;
      if (ocp.open_shortages > 0) anomalies.push({ type: 'ocp_open_shortages', count: ocp.open_shortages });
    } catch { /* ignore */ }
  }

  const summary = {
    window_from: windowFrom,
    stock_drift: anomalies.filter((a) => a.type === 'stock_drift'),
    refunds,
    waste,
    discounted_orders: discountedOrders,
    weight_upward_bias: weightBias,
    ocp,
  };
  const anomalyCount = anomalies.length;

  const runRow = await query(
    `INSERT INTO reconciliation_runs (window_from, anomaly_count, summary, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id, run_at`,
    [windowFrom, anomalyCount, JSON.stringify(summary), opts.createdBy ?? null]
  );
  const runId = runRow.rows[0].id;

  // Owner alert — only when something doesn't add up (so it's signal, not noise).
  if (anomalyCount > 0) {
    emitToAdmins('reconciliation:alert', { runId, anomalyCount, anomalies });
    try {
      const supers = await query(
        `SELECT id FROM users WHERE role = 'super_admin' AND status = 'active' AND deleted_at IS NULL`
      );
      for (const s of supers.rows) {
        await query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, 'reconciliation_alert', $2, $3)`,
          [s.id, 'Reconciliation: please review', `${anomalyCount} issue(s) found in the latest books check. Open the Reconciliation report.`]
        );
      }
    } catch (e: any) {
      logger.warn('reconciliation alert notify failed', { error: e?.message });
    }
  }

  logger.info('Reconciliation run complete', { runId, anomalyCount });
  return { ok: anomalyCount === 0, anomalyCount, summary, runId };
}
