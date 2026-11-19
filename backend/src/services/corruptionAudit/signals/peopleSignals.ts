// Corruption audit — Approvals, riders, collection points, and findings that belong to no one person.
// Moved out of evidence.ts's single buildEvidence() (W21): each section is now
// its own function; the code inside is unchanged.
import { query, type DbRow } from '../../../config/database';
import { APPROVAL_VALUE_THRESHOLD } from '../../../utils/adminApproval';
import { BUSINESS_TZ } from '../../../utils/businessTime';
import { type AuditCtx, num, r0, r2, rs, median, cleanLabel, win, day, city, priceOf } from '../evidenceKit';
import { strengthOf } from '../scoring';

export async function secondAdminApprovals(ctx: AuditCtx): Promise<void> {
  const { period, subjects, safe, tok, signal, isAdmin, isOwner } = ctx;

  // ── 10. Second-admin approvals ─────────────────────────────────────────────
  await safe('approvals', async () => {
    const r = await query(
      `SELECT l.admin_id, l.approved_by, l.value, ${day('l.created_at')} AS d
         FROM approval_value_log l WHERE l.admin_id IS NOT NULL AND ${win('l.created_at')}`,
      [period.from, period.to]
    );
    const by = new Map<string, any[]>();
    for (const x of r.rows) (by.get(x.admin_id) || by.set(x.admin_id, []).get(x.admin_id)!).push(x);
    const T = APPROVAL_VALUE_THRESHOLD;
    for (const [adminId, rows] of by) {
      if (!isAdmin(adminId) || isOwner(adminId)) continue;
      const key = `admin:${adminId}`;
      const perDay = new Map<string, number>();
      for (const x of rows) if (!x.approved_by) perDay.set(x.d, (perDay.get(x.d) || 0) + num(x.value));
      const near = Array.from(perDay.entries()).filter(([, v]) => T > 0 && v >= T * 0.8 && v < T);
      const activeDays = perDay.size;
      signal({
        code: 'just_under_approval_limit', title: 'Keeps daily un-approved value just under the second-admin limit', category: 'process', subject: key,
        strength: near.length >= 6 && near.length / Math.max(1, activeDays) >= 0.5 ? 'moderate' : near.length >= 3 ? 'weak' : null,
        amount: near.reduce((a, [, v]) => a + v, 0), n: near.length,
        facts: { days_just_under_limit: near.length, days_with_unapproved_value: activeDays, daily_limit: T },
        examples: near.slice(0, 5).map(([d, v]) => `${d}: ${rs(v)} of value-out with no second admin (limit ${rs(T)})`),
        innocent: ['Daily waste of a steady size naturally lands near the same figure.'],
      });
      const approved = rows.filter((x) => x.approved_by);
      const pair = new Map<string, number>();
      for (const x of approved) pair.set(x.approved_by, (pair.get(x.approved_by) || 0) + 1);
      const top = Array.from(pair.entries()).sort((a, b) => b[1] - a[1])[0];
      const others = Array.from(subjects.values()).filter((s) => s.type === 'admin').length - 1;
      signal({
        code: 'always_same_approver', title: 'Almost all their large actions are approved by the same second admin', category: 'process', subject: key,
        strength: top && approved.length >= 5 && top[1] / approved.length >= 0.8 && others >= 3
          ? (approved.length >= 10 ? 'moderate' : 'weak') : null,
        amount: approved.filter((x) => x.approved_by === top?.[0]).reduce((a, x) => a + num(x.value), 0), n: approved.length,
        facts: { approved_actions: approved.length, by_the_same_admin: top?.[1] ?? 0, the_approver: top ? tok('admin', top[0]) : null, other_admins_available: others },
        examples: top ? [`${top[1]} of ${approved.length} approvals came from ${tok('admin', top[0])}.`] : [],
        innocent: ['Only two admins work the same shift.', 'The approver is the manager everyone goes to.'],
      });
    }
  });
}

export async function riders(ctx: AuditCtx): Promise<void> {
  const { period, P, baselines, safe, tok, signal, isAdmin, isOwner, act } = ctx;

  // ── 11. Riders ─────────────────────────────────────────────────────────────
  await safe('rider cash', async () => {
    const r = await query(
      `SELECT o.rider_id, COALESCE(SUM(GREATEST(o.paid_amount - COALESCE(o.rider_delivery_charge, 0), 0)), 0) AS due,
              COUNT(*)::int AS orders, MIN(o.delivered_at) AS oldest
         FROM orders o
        WHERE o.rider_id IS NOT NULL AND o.deleted_at IS NULL AND o.status = 'delivered'
          AND o.payment_method = 'cash_on_delivery' AND o.payment_status = 'completed' AND o.ocp_id IS NULL
          AND o.cash_received_by IS NULL
          AND NOT EXISTS (SELECT 1 FROM rider_cash_settlement_orders so WHERE so.order_id = o.id)
          AND o.delivered_at < (($2::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}') - INTERVAL '2 days'
          AND $1::date IS NOT NULL AND ${city('o.city_id')}
        GROUP BY o.rider_id`,
      P
    );
    for (const x of r.rows) {
      const age = Math.floor((Math.min(Date.now(), Date.parse(`${period.to}T23:59:59+05:00`)) - new Date(x.oldest).getTime()) / 86400000);
      signal({
        code: 'rider_cash_overdue', title: 'Holds delivery cash that is overdue for hand-over', category: 'cash', subject: `rider:${x.rider_id}`,
        strength: strengthOf({ value: num(x.due), n: num(x.orders), minN: 1, weak: 3000, moderate: 10000, strong: 25000, moderateIf: age >= 4, strongIf: age >= 7 }),
        amount: num(x.due), n: num(x.orders),
        facts: { cash_overdue: r0(num(x.due)), orders: num(x.orders), oldest_order_days_ago: age },
        examples: [`${x.orders} delivered cash order(s), ${rs(num(x.due))} due, the oldest delivered ${age} day(s) ago.`],
        innocent: ['The office has not sat down to settle with this rider yet.', 'Cash was handed over but "Receive cash" was not pressed.'],
      });
    }
  });
  await safe('rider deliveries', async () => {
    const r = await query<DbRow<{ rider_id: string }>>(
      `SELECT t.rider_id, COUNT(*)::int AS tasks,
              COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed,
              COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE t.status = 'completed' AND t.arrived_at IS NULL)::int AS no_arrival
         FROM rider_tasks t JOIN riders rd ON rd.id = t.rider_id
        WHERE t.order_id IS NOT NULL AND ${win('t.assigned_at')} AND ${city('rd.city_id')}
        GROUP BY t.rider_id`,
      P
    );
    const c = await query<DbRow<{ rider_id: string }>>(
      `SELECT o.rider_id, COUNT(DISTINCT c.id)::int AS complaints, COALESCE(SUM(rf.amount), 0) AS refunded
         FROM complaints c JOIN orders o ON o.id = c.order_id
         LEFT JOIN refunds rf ON rf.complaint_id = c.id
        WHERE o.rider_id IS NOT NULL AND ${win('c.created_at')} AND ${city('o.city_id')}
        GROUP BY o.rider_id`,
      P
    );
    const compl = new Map<string, any>(c.rows.map((x) => [x.rider_id, x]));
    const big = r.rows.filter((x) => num(x.tasks) >= 15);
    const peerFail = (id: string) => median(big.filter((x) => x.rider_id !== id).map((x) => num(x.failed) / num(x.tasks)));
    const peerNoArr = (id: string) => median(big.filter((x) => x.rider_id !== id && num(x.completed) > 0).map((x) => num(x.no_arrival) / num(x.completed)));
    const peerCompl = (id: string) => median(big.filter((x) => x.rider_id !== id).map((x) => num(compl.get(x.rider_id)?.complaints) / num(x.tasks)));
    baselines.riders_with_15_plus_tasks = big.length;
    for (const x of r.rows) {
      const key = `rider:${x.rider_id}`;
      const tasks = num(x.tasks);
      act(key, 'tasks', tasks);
      act(key, 'failed', num(x.failed));
      if (tasks < 15) continue;
      const failRate = num(x.failed) / tasks;
      const pf = peerFail(x.rider_id);
      signal({
        code: 'rider_failed_deliveries', title: 'Reports far more failed deliveries than other riders', category: 'delivery', subject: key,
        strength: failRate >= 0.25 && (pf === null || failRate >= pf * 3) ? 'moderate' : failRate >= 0.15 && (pf === null || failRate >= pf * 2) ? 'weak' : null,
        amount: 0, n: tasks,
        facts: { tasks, failed: num(x.failed), failed_pct: r2(failRate * 100), other_riders_failed_pct: pf === null ? null : r2(pf * 100) },
        examples: [`${x.failed} of ${tasks} tasks failed.`],
        innocent: ['Their area has more absent customers or bad addresses.'],
      });
      const cm = compl.get(x.rider_id);
      const cRate = num(cm?.complaints) / tasks;
      const pc = peerCompl(x.rider_id);
      signal({
        code: 'rider_complaints', title: 'Their deliveries draw far more complaints than other riders\'', category: 'delivery', subject: key,
        strength: num(cm?.complaints) >= 3 && cRate >= 0.15 && (pc === null || cRate >= Math.max(pc * 3, 0.05)) ? 'moderate'
          : num(cm?.complaints) >= 3 && cRate >= 0.08 && (pc === null || cRate >= Math.max(pc * 2, 0.04)) ? 'weak' : null,
        amount: num(cm?.refunded), n: num(cm?.complaints),
        facts: { tasks, complaints: num(cm?.complaints), complaint_pct: r2(cRate * 100), other_riders_complaint_pct: pc === null ? null : r2(pc * 100), refunded_on_their_orders: r0(num(cm?.refunded)) },
        examples: [`${num(cm?.complaints)} complaint(s) on ${tasks} tasks; ${rs(num(cm?.refunded))} refunded on them.`],
        innocent: ['Complaints about quality or packing are not the rider\'s doing.'],
      });
      const done = num(x.completed);
      const na = done > 0 ? num(x.no_arrival) / done : 0;
      const pn = peerNoArr(x.rider_id);
      signal({
        code: 'rider_no_arrival_mark', title: 'Completes deliveries without marking arrival, unlike other riders', category: 'process', subject: key,
        strength: done >= 15 && na >= 0.5 && pn !== null && na >= Math.max(pn * 2, 0.2) ? 'weak' : null,
        amount: 0, n: done,
        facts: { completed: done, without_arrival_mark: num(x.no_arrival), share_pct: r2(na * 100), other_riders_share_pct: pn === null ? null : r2(pn * 100) },
        examples: [`${x.no_arrival} of ${done} completed deliveries have no "arrived" mark.`],
        innocent: ['Weak mobile signal at the door.', 'Not trained to press the button.'],
      });
    }
    const pay = await query<DbRow<{ rider_id: string }>>(
      `SELECT o.rider_id, COUNT(*)::int AS n, AVG(o.rider_delivery_charge) AS avg_pay, SUM(o.rider_delivery_charge) AS total
         FROM orders o
        WHERE o.rider_id IS NOT NULL AND o.status = 'delivered' AND o.rider_delivery_charge > 0 AND o.deleted_at IS NULL
          AND ${win('o.delivered_at')} AND ${city('o.city_id')}
        GROUP BY o.rider_id`,
      P
    );
    const enough = pay.rows.filter((x) => num(x.n) >= 10);
    for (const x of enough) {
      const peer = median(enough.filter((y) => y.rider_id !== x.rider_id).map((y) => num(y.avg_pay)));
      if (peer === null || enough.length < 3) continue;
      const avg = num(x.avg_pay);
      const excess = (avg - peer) * num(x.n);
      const setBy = await query(
        `SELECT created_by FROM rider_delivery_charges WHERE rider_id = $1 AND created_by IS NOT NULL ORDER BY charge_per_order DESC LIMIT 1`,
        [x.rider_id]
      );
      const strength = avg >= peer * 1.8 ? strengthOf({ value: excess, n: num(x.n), minN: 10, weak: 2000, moderate: 6000, strong: 1e12, strongIf: false }) : null;
      const facts = { deliveries: num(x.n), average_pay_per_order: r2(avg), other_riders_average: r2(peer), paid_above_others: r0(excess) };
      signal({
        code: 'rider_pay_above_peers', title: 'Paid far more per delivery than other riders', category: 'expenses', subject: `rider:${x.rider_id}`,
        strength, amount: excess, n: num(x.n), facts: { ...facts, rate_set_by: setBy.rows[0] ? tok('admin', setBy.rows[0].created_by) : null },
        examples: [`${rs(avg)} per order on ${x.n} deliveries; other riders average ${rs(peer)}.`],
        innocent: ['Covers a far-away area or night slot with a higher agreed rate.'],
      });
      const setter: string | null = setBy.rows[0]?.created_by ?? null;
      if (isAdmin(setter) && !isOwner(setter)) {
        signal({
          code: 'set_rider_pay_high', title: 'Set one rider\'s per-delivery pay far above the others', category: 'expenses', subject: `admin:${setter}`,
          strength, amount: excess, n: num(x.n), facts: { ...facts, rider: tok('rider', x.rider_id) },
          examples: [`${tok('rider', x.rider_id)} earns ${rs(avg)} per order; other riders average ${rs(peer)}.`],
          innocent: ['The owner agreed this rate for a difficult route.'],
        });
      }
    }
  });
}

export async function collectionPoints(ctx: AuditCtx): Promise<void> {
  const { period, P, safe, tok, signal, isAdmin, isOwner } = ctx;

  // ── 12. Collection points ──────────────────────────────────────────────────
  await safe('collection points cash and stock', async () => {
    const due = await query(
      `SELECT od.ocp_id, COALESCE(SUM(od.paid_amount), 0) AS due, COUNT(*)::int AS orders, MIN(od.delivered_at) AS oldest
         FROM orders od
        WHERE od.ocp_id IS NOT NULL AND od.deleted_at IS NULL AND od.paid_amount > 0 AND od.status = 'delivered'
          AND od.payment_method = 'cash_on_delivery' AND od.payment_status = 'completed'
          AND NOT EXISTS (SELECT 1 FROM ocp_settlement_orders so JOIN ocp_settlements s ON s.id = so.settlement_id
                           WHERE so.order_id = od.id AND s.status = 'received')
          AND od.delivered_at < (($2::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}') - INTERVAL '3 days'
          AND $1::date IS NOT NULL AND ${city('od.city_id')}
        GROUP BY od.ocp_id`,
      P
    );
    for (const x of due.rows) {
      const age = Math.floor((Math.min(Date.now(), Date.parse(`${period.to}T23:59:59+05:00`)) - new Date(x.oldest).getTime()) / 86400000);
      signal({
        code: 'ocp_cash_overdue', title: 'Holds collected cash that is overdue', category: 'cash', subject: `ocp:${x.ocp_id}`,
        strength: strengthOf({ value: num(x.due), n: num(x.orders), minN: 1, weak: 5000, moderate: 20000, strong: 50000, moderateIf: age >= 5, strongIf: age >= 7 }),
        amount: num(x.due), n: num(x.orders),
        facts: { cash_overdue: r0(num(x.due)), orders: num(x.orders), oldest_order_days_ago: age },
        examples: [`${x.orders} paid order(s), ${rs(num(x.due))} not yet received by the office; oldest ${age} day(s) ago.`],
        innocent: ['A settlement was sent and is waiting for the office to confirm it.'],
      });
    }
    const sh = await query(
      `SELECT s.ocp_id, s.resolved_by, s.status, s.shortage_qty, s.quality, ${day('s.created_at')} AS d, ${win('s.created_at')} AS created_in,
              (s.resolved_at IS NOT NULL AND ${win('s.resolved_at')}) AS resolved_in, p.name_en, p.price, p.price_b, p.price_c
         FROM ocp_stock_shortages s JOIN order_collection_points o ON o.id = s.ocp_id LEFT JOIN products p ON p.id = s.product_id
        WHERE (${win('s.created_at')} OR (s.resolved_at IS NOT NULL AND ${win('s.resolved_at')})) AND ${city('o.city_id')}`,
      P
    );
    const byOcp = new Map<string, any[]>();
    const byResolver = new Map<string, any[]>();
    for (const x of sh.rows) {
      x.value = num(x.shortage_qty) * priceOf(x.quality, x);
      if (x.created_in) (byOcp.get(x.ocp_id) || byOcp.set(x.ocp_id, []).get(x.ocp_id)!).push(x);
      if (x.resolved_in && x.resolved_by) (byResolver.get(x.resolved_by) || byResolver.set(x.resolved_by, []).get(x.resolved_by)!).push(x);
    }
    for (const [ocpId, rows] of byOcp) {
      const value = rows.reduce((a, x) => a + x.value, 0);
      signal({
        code: 'ocp_stock_short', title: 'Stock sent to this collection point keeps coming up short', category: 'stock', subject: `ocp:${ocpId}`,
        strength: strengthOf({ value, n: rows.length, minN: 2, weak: 2000, moderate: 6000, strong: 15000, strongIf: rows.length >= 4 }),
        amount: value, n: rows.length,
        facts: { shortages: rows.length, value_at_selling_price: r0(value), still_open: rows.filter((x) => x.status === 'open').length },
        examples: rows.sort((a, b) => b.value - a.value).map((x) => `${x.d} ${cleanLabel(x.name_en)} short by ${r2(num(x.shortage_qty))} ≈ ${rs(x.value)}`),
        innocent: ['Less was sent than was entered (the sender\'s side).', 'Drying and trimming loss on produce.'],
      });
    }
    for (const [adminId, rows] of byResolver) {
      if (!isAdmin(adminId) || isOwner(adminId)) continue;
      const value = rows.reduce((a, x) => a + x.value, 0);
      signal({
        code: 'shortages_written_off', title: 'Closes collection-point stock shortages', category: 'stock', subject: `admin:${adminId}`,
        strength: strengthOf({ value, n: rows.length, minN: 2, weak: 2000, moderate: 6000, strong: 1e12, strongIf: false }),
        amount: value, n: rows.length,
        facts: { shortages_closed: rows.length, value_at_selling_price: r0(value), collection_points: new Set(rows.map((x) => x.ocp_id)).size },
        examples: rows.sort((a, b) => b.value - a.value).map((x) => `${x.d} ${cleanLabel(x.name_en)} ${r2(num(x.shortage_qty))} at ${tok('ocp', x.ocp_id)} ≈ ${rs(x.value)}`),
        innocent: ['Closing shortages after the stock was found or paid for is their job.'],
      });
    }
    const rej = await query(
      `SELECT s.ocp_id, COUNT(*)::int AS n, COALESCE(SUM(s.amount), 0) AS total FROM ocp_settlements s JOIN order_collection_points o ON o.id = s.ocp_id
        WHERE s.status = 'rejected' AND ${win('s.requested_at')} AND ${city('o.city_id')} GROUP BY s.ocp_id`,
      P
    );
    for (const x of rej.rows) {
      signal({
        code: 'ocp_settlements_rejected', title: 'Cash settlements they sent were rejected by the office', category: 'cash', subject: `ocp:${x.ocp_id}`,
        strength: num(x.n) >= 2 ? 'weak' : null, amount: num(x.total), n: num(x.n),
        facts: { rejected_settlements: num(x.n), value: r0(num(x.total)) },
        examples: [`${x.n} settlement(s) worth ${rs(num(x.total))} rejected — the cash counted did not match.`],
        innocent: ['Counting mistakes on either side.'],
      });
    }
  });
}

export async function unownedFindings(ctx: AuditCtx): Promise<void> {
  const { period, P, dataGaps, systemFindings, totals, safe } = ctx;

  // ── 13. Things that belong to no one person ────────────────────────────────
  await safe('shelf counts', async () => {
    const r = await query(
      `SELECT COUNT(*)::int AS counts, COUNT(*) FILTER (WHERE sc.variance < 0)::int AS short,
              COALESCE(SUM(-sc.variance_value) FILTER (WHERE sc.variance < 0), 0) AS shortage,
              COALESCE(SUM(sc.variance_value) FILTER (WHERE sc.variance > 0), 0) AS surplus
         FROM stock_counts sc WHERE ${win('sc.created_at')} AND ${city('sc.city_id')}`,
      P
    );
    const x = r.rows[0];
    totals.shelf_counts = num(x.counts);
    totals.shelf_shortage_value = r0(num(x.shortage));
    if (num(x.counts) === 0) {
      dataGaps.push('No physical shelf count was recorded in this period. Without a count, stock that left the store unbilled is invisible to any audit — the books only agree with themselves.');
    } else if (num(x.shortage) > 0) {
      systemFindings.push({
        code: 'shelf_shortage', title: 'Stock missing from the shelf',
        detail: `${x.short} of ${x.counts} shelf count(s) found less than the books: ${rs(num(x.shortage))} at selling price (surplus found elsewhere: ${rs(num(x.surplus))}). A count names the person who counted, not the person who took the goods.`,
        severity: num(x.shortage) >= 10000 ? 'high' : num(x.shortage) >= 2000 ? 'medium' : 'low', amount: r0(num(x.shortage)),
      });
    }
  });
  await safe('watchdog history', async () => {
    const r = await query(
      `SELECT COUNT(*)::int AS runs, COALESCE(SUM(jsonb_array_length(COALESCE(summary->'stock_drift', '[]'::jsonb))), 0)::int AS drift
         FROM reconciliation_runs WHERE ${win('run_at')}`,
      [period.from, period.to]
    );
    if (num(r.rows[0].drift) > 0) {
      systemFindings.push({
        code: 'stock_changed_outside_app', title: 'Stock changed without a ledger entry',
        detail: `The daily watchdog found ${r.rows[0].drift} product balance(s) that moved with no matching entry in the stock ledger — a change made directly in the database or by a bug, not through the admin panel.`,
        severity: 'high', amount: 0,
      });
    }
  });
  await safe('audit trail', async () => {
    const r = await query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE a.resource_id IS NULL AND a.action ~ '[0-9a-f]{8}-[0-9a-f]{4}')::int AS legacy
         FROM audit_logs a WHERE ${win('a.created_at')}`,
      [period.from, period.to]
    );
    if (num(r.rows[0].legacy) > 0) {
      dataGaps.push(`${r.rows[0].legacy} of ${r.rows[0].total} audit-log entries in this period were written before the audit-log fix and do not hold the old value of what was changed. Price changes and cancellations from that time can only be partly traced to a person.`);
    }
    const del = await query(
      `SELECT COUNT(*)::int AS c FROM orders o WHERE o.deleted_at IS NOT NULL AND ${win('o.deleted_at')} AND ${city('o.city_id')}`,
      P
    );
    if (num(del.rows[0].c) > 0) {
      systemFindings.push({
        code: 'orders_deleted', title: 'Orders deleted', severity: 'low', amount: 0,
        detail: `${del.rows[0].c} order(s) were deleted in this period (only a super admin can do this; delivered orders cannot be deleted).`,
      });
    }
  });
}
