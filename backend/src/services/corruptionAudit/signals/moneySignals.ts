// Corruption audit — Money signals: expenses and payroll, purchases entered by staff, price dips, cash holding.
// Moved out of evidence.ts's single buildEvidence() (W21): each section is now
// its own function; the code inside is unchanged.
import { query, type DbRow } from '../../../config/database';
import { BUSINESS_TZ } from '../../../utils/businessTime';
import { type AuditCtx, num, r0, r2, pct, rs, median, cleanLabel, win, upTo, day, city } from '../evidenceKit';
import { strengthOf } from '../scoring';

export async function expensesAndPayroll(ctx: AuditCtx): Promise<void> {
  const { P, dataGaps, totals, safe, tok, signal, isAdmin, act } = ctx;

  // ── 6. Expenses and payroll ────────────────────────────────────────────────
  await safe('expenses', async () => {
    const r = await query(
      `SELECT e.id, e.created_by, e.type, e.category, e.amount, e.comment IS NOT NULL AND btrim(e.comment) <> '' AS has_comment,
              e.incurred_at, e.created_at, ${day('e.incurred_at')} AS d, e.ref_id
         FROM expenses e
        WHERE e.created_by IS NOT NULL AND e.type IN ('other', 'rider_payment')
          AND ${win('e.incurred_at')} AND ${city('e.city_id')}
        ORDER BY e.incurred_at`,
      P
    );
    const by = new Map<string, any[]>();
    for (const x of r.rows) (by.get(x.created_by) || by.set(x.created_by, []).get(x.created_by)!).push(x);
    for (const [adminId, all] of by) {
      if (!isAdmin(adminId)) continue;
      const key = `admin:${adminId}`;
      const rows = all.filter((x) => x.type === 'other');
      const total = rows.reduce((a, x) => a + num(x.amount), 0);
      act(key, 'expenses_recorded', rows.length);
      let dupValue = 0; let dupN = 0; let flaggedValue = 0; let flaggedN = 0;
      const lines: string[] = [];
      rows.forEach((x, i) => {
        const amount = num(x.amount);
        const flags: string[] = [];
        if (!x.has_comment) flags.push('no note');
        if (amount >= 5000 && amount % 1000 === 0) flags.push('round figure');
        if (new Date(x.created_at).getTime() - new Date(x.incurred_at).getTime() > 2 * 86400000) flags.push('back-dated');
        const dup = rows.some((y, j) => j < i && y.category === x.category && num(y.amount) === amount && amount >= 1000 &&
          Math.abs(new Date(y.incurred_at).getTime() - new Date(x.incurred_at).getTime()) <= 3 * 86400000);
        if (dup) { flags.push('same type and amount as another entry within 3 days'); dupValue += amount; dupN++; }
        if (dup || flags.length >= 2) {
          flaggedValue += amount; flaggedN++;
          lines.push(`${x.d} ${cleanLabel(x.category, 20)} ${rs(amount)} — ${flags.join(', ')}`);
        }
      });
      signal({
        code: 'expenses_irregular', title: 'Books expenses that look irregular', category: 'expenses', subject: key,
        strength: strengthOf({
          value: flaggedValue, n: flaggedN, minN: 2, weak: 3000, moderate: 10000, strong: 30000,
          strongIf: dupN >= 2,
        }),
        amount: flaggedValue, n: flaggedN,
        facts: {
          expenses_recorded: rows.length, expenses_total: r0(total), irregular_entries: flaggedN, irregular_value: r0(flaggedValue),
          repeated_entries: dupN, repeated_value: r0(dupValue), share_of_all_other_expenses_pct: pct(total, totals.expenses_other || 0),
        },
        examples: lines,
        innocent: ['Rent, salaries and bills are naturally round and repeat.', 'Receipts handed in late get entered a few days after the date.'],
      });
      const extra = all.filter((x) => x.type === 'rider_payment' && x.category !== 'salary');
      const extraValue = extra.reduce((a, x) => a + num(x.amount), 0);
      signal({
        code: 'rider_extra_payments', title: 'Pays riders extra money outside salary', category: 'expenses', subject: key,
        strength: strengthOf({ value: extraValue, n: extra.length, minN: 2, weak: 5000, moderate: 15000, strong: 1e12, strongIf: false }),
        amount: extraValue, n: extra.length,
        facts: { extra_payments: extra.length, extra_value: r0(extraValue), riders_paid: new Set(extra.map((x) => x.ref_id)).size },
        examples: extra.sort((a, b) => num(b.amount) - num(a.amount)).map((x) => `${x.d} ${cleanLabel(x.category, 20)} ${rs(num(x.amount))} to ${tok('rider', x.ref_id)}`),
        innocent: ['Fuel or bonus money agreed with the owner.', 'Riders already keep their per-order pay from the cash, so "commission" here can be a genuine double entry by mistake.'],
      });
    }
  });
  await safe('payroll', async () => {
    const r = await query(
      `SELECT e.created_by, e.category, e.amount, ${day('e.incurred_at')} AS d,
              to_char(e.incurred_at AT TIME ZONE '${BUSINESS_TZ}', 'YYYY-MM') AS ym,
              w.id AS worker_id, w.basic_salary, w.created_by AS worker_created_by,
              (SELECT COUNT(*) FROM worker_attendance wa WHERE wa.worker_id = w.id)::int AS attendance_marks
         FROM expenses e JOIN workers w ON w.id = e.ref_id
        WHERE e.type = 'worker_payment' AND e.created_by IS NOT NULL
          AND ${win('e.incurred_at')} AND ${city('e.city_id')}
        ORDER BY e.incurred_at`,
      P
    );
    const att = await query(`SELECT COUNT(*)::int AS c FROM worker_attendance`);
    const attendanceInUse = num(att.rows[0].c) > 0;
    if (!attendanceInUse && r.rows.length > 0) {
      dataGaps.push('Worker attendance is not being marked for anyone, so salaries could not be checked against attendance (a made-up worker would not stand out). Mark attendance on the Workers page.');
    }
    const by = new Map<string, any[]>();
    for (const x of r.rows) (by.get(x.created_by) || by.set(x.created_by, []).get(x.created_by)!).push(x);
    let w = 0;
    const workerAlias = new Map<string, string>();
    const wa = (id: string) => workerAlias.get(id) || workerAlias.set(id, `worker W${++w}`).get(id)!;
    for (const [adminId, rows] of by) {
      if (!isAdmin(adminId)) continue;
      const perMonth = new Map<string, { paid: number; basic: number; worker: string }>();
      let ghostValue = 0; let ghostN = 0;
      const lines: string[] = [];
      for (const x of rows) {
        if (x.category === 'salary') {
          const k = `${x.worker_id}|${x.ym}`;
          const cur = perMonth.get(k) || { paid: 0, basic: num(x.basic_salary), worker: x.worker_id };
          cur.paid += num(x.amount);
          perMonth.set(k, cur);
        }
        // Only meaningful where attendance is actually kept: if nobody's
        // attendance is ever marked, "never attended" says nothing about one worker.
        if (attendanceInUse && num(x.attendance_marks) === 0 && x.worker_created_by === adminId) {
          ghostValue += num(x.amount); ghostN++;
          lines.push(`${x.d} ${rs(num(x.amount))} ${x.category} to ${wa(x.worker_id)} — added by the same admin, attendance never marked`);
        }
      }
      let excess = 0; let excessN = 0;
      for (const [k, v] of perMonth) {
        if (v.paid > v.basic + 0.5) {
          excess += v.paid - v.basic; excessN++;
          lines.unshift(`${k.split('|')[1]} salary to ${wa(v.worker)}: paid ${rs(v.paid)} against a basic salary of ${rs(v.basic)}`);
        }
      }
      const value = Math.max(excess, ghostValue); // the two overlap — never add them
      signal({
        code: 'payroll_irregular', title: 'Salary payments that do not match the worker records', category: 'expenses', subject: `admin:${adminId}`,
        strength: strengthOf({ value, n: excessN + ghostN, minN: 1, weak: 2000, moderate: 8000, strong: 20000, strongIf: excessN >= 1 }),
        amount: value, n: excessN + ghostN,
        facts: {
          worker_payments: rows.length, months_paid_above_basic_salary: excessN, paid_above_basic_salary: r0(excess),
          payments_to_never_attended_workers_they_added: ghostN, value_of_those_payments: r0(ghostValue),
        },
        examples: lines,
        innocent: ['Advance salary or arrears paid in one month.', 'Attendance is simply not being marked for anyone (check other workers).'],
      });
    }
  });
}

export async function staffPurchases(ctx: AuditCtx): Promise<void> {
  const { P, totals, safe, signal, isAdmin } = ctx;

  // ── 7. Purchases entered by staff ──────────────────────────────────────────
  await safe('stock purchases', async () => {
    const r = await query<DbRow<{ created_by: string | null; role: string | null }>>(
      `SELECT sp.id, sp.created_by, sp.purchase_price, sp.raw_weight, sp.waste, (sp.grade_a + sp.grade_b + sp.grade_c) AS sellable,
              ${day('sp.purchased_at')} AS d, p.name_en, u.role, sp.supplier_name, sp.bill_number, sp.bill_photo_url,
              (SELECT AVG(x.purchase_price / NULLIF(x.grade_a + x.grade_b + x.grade_c, 0))
                 FROM stock_purchases x
                WHERE x.product_id = sp.product_id AND x.id <> sp.id AND x.purchased_at < sp.purchased_at
                  AND x.purchased_at > sp.purchased_at - INTERVAL '60 days') AS avg_rate,
              (SELECT COUNT(*) FROM stock_purchases x
                WHERE x.product_id = sp.product_id AND x.id <> sp.id AND x.purchased_at < sp.purchased_at
                  AND x.purchased_at > sp.purchased_at - INTERVAL '60 days')::int AS earlier
         FROM stock_purchases sp JOIN products p ON p.id = sp.product_id LEFT JOIN users u ON u.id = sp.created_by
        WHERE ${win('sp.purchased_at')} AND ${city('sp.city_id')}
        ORDER BY sp.purchased_at`,
      P
    );
    totals.purchases = r.rows.length;
    totals.purchases_value = r0(r.rows.reduce((a: number, x) => a + num(x.purchase_price), 0));
    const by = new Map<string, any[]>();
    for (const x of r.rows) if (x.created_by && x.role !== 'super_admin') (by.get(x.created_by) || by.set(x.created_by, []).get(x.created_by)!).push(x);
    for (const [adminId, rows] of by) {
      if (!isAdmin(adminId)) continue;
      const total = rows.reduce((a, x) => a + num(x.purchase_price), 0);
      let excess = 0; let highRate = 0; let highWaste = 0; let noSupplier = 0; let noBill = 0;
      const lines: string[] = [];
      for (const x of rows) {
        const sellable = num(x.sellable);
        const rate = sellable > 0 ? num(x.purchase_price) / sellable : 0;
        const avg = num(x.avg_rate);
        const wastePct = num(x.raw_weight) > 0 ? (num(x.waste) / num(x.raw_weight)) * 100 : 0;
        const notes: string[] = [];
        if (avg > 0 && num(x.earlier) >= 2 && rate > avg * 1.25) {
          excess += (rate - avg) * sellable; highRate++;
          notes.push(`rate ${rs(rate)}/unit vs usual ${rs(avg)}`);
        }
        if (wastePct > 15) { highWaste++; notes.push(`${r2(wastePct)}% declared waste`); }
        // Purchases from before migration 65 have no supplier at all — counted, but
        // only as 'not recorded', never as a finding on their own.
        if (!x.supplier_name) noSupplier++;
        if (!x.bill_number && !x.bill_photo_url) noBill++;
        // Only WHETHER a seller and a bill were recorded — never the seller's name:
        // it is free text typed by the person under audit (see prompt.ts).
        notes.push(`${x.supplier_name ? 'seller recorded' : 'NO seller recorded'}, ${x.bill_photo_url ? 'bill photo' : x.bill_number ? 'bill no.' : 'no bill'}`);
        lines.push(`${x.d} ${cleanLabel(x.name_en)} ${rs(num(x.purchase_price))}${notes.length ? ` — ${notes.join(', ')}` : ''}`);
      }
      signal({
        code: 'purchase_by_staff', title: 'Entered stock purchases although purchasing is the owner\'s job', category: 'expenses', subject: `admin:${adminId}`,
        strength: excess >= 10000 ? 'strong' : excess >= 3000 || highWaste >= 2 ? 'moderate' : 'weak',
        amount: excess > 0 ? excess : 0, n: rows.length,
        facts: {
          purchases_entered: rows.length, purchases_value: r0(total), above_usual_rate: highRate,
          paid_above_usual_rate: r0(excess), with_waste_over_15_pct: highWaste,
          without_supplier_recorded: noSupplier, without_bill_number_or_photo: noBill,
        },
        examples: lines.sort((a, b) => Number(b.includes('—')) - Number(a.includes('—'))),
        innocent: ['The owner dictated the figures and this person only typed them in.', 'Mandi rates move a lot from day to day.'],
      });
    }
  });
}

export async function priceDips(ctx: AuditCtx): Promise<void> {
  const { P, systemFindings, safe, cust, signal, isAdmin, staffNote } = ctx;

  // ── 8. Price dips: goods sold far below their own usual price for a short while
  await safe('price dips', async () => {
    const r = await query(
      `SELECT oi.product_id, oi.product_name, COALESCE(oi.unit, 'full') AS unit, COALESCE(oi.quality, 'A') AS quality,
              (o.restaurant_id IS NOT NULL) AS b2b, oi.unit_price, oi.quantity, o.placed_at, ${day('o.placed_at')} AS d,
              o.order_number, o.user_id, cu.full_name AS customer
         FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN users cu ON cu.id = o.user_id
        WHERE oi.product_id IS NOT NULL AND oi.unit_price > 0 AND o.deleted_at IS NULL
          AND o.status <> 'cancelled' AND o.replacement_for_order_id IS NULL
          AND ${win('o.placed_at')} AND ${city('o.city_id')}
        ORDER BY o.placed_at
        LIMIT 30000`,
      P
    );
    const groups = new Map<string, any[]>();
    for (const x of r.rows) {
      const k = `${x.product_id}|${x.unit}|${x.quality}|${x.b2b}`;
      (groups.get(k) || groups.set(k, []).get(k)!).push(x);
    }
    const dips: { rows: any[]; ref: number; value: number; productId: string }[] = [];
    for (const rows of groups.values()) {
      if (rows.length < 5) continue;
      const ref = median(rows.map((x) => num(x.unit_price)));
      if (!ref) continue;
      const low = rows.filter((x) => num(x.unit_price) < ref * 0.65);
      if (!low.length || low.length > rows.length * 0.3) continue;
      const span = new Date(low[low.length - 1].placed_at).getTime() - new Date(low[0].placed_at).getTime();
      if (span > 48 * 3600000) continue; // a lasting drop is a market price, not a dip
      const value = low.reduce((a, x) => a + (ref - num(x.unit_price)) * num(x.quantity), 0);
      if (value >= 500) dips.push({ rows: low, ref, value, productId: rows[0].product_id });
    }
    dips.sort((a, b) => b.value - a.value);
    const perAdmin = new Map<string, { value: number; n: number; restored: number; lines: string[]; byCust: Map<string, number>; staff: number }>();
    let orphanValue = 0; let orphanN = 0;
    for (const dip of dips.slice(0, 25)) {
      const first = dip.rows[0].placed_at;
      const ch = await query(
        `SELECT a.admin_id, a.created_at FROM audit_logs a
          WHERE a.status = 'success' AND a.admin_id IS NOT NULL
            AND (a.resource_id = $1 OR a.action LIKE '%/products/' || $1 || '%')
            AND a.action LIKE 'PUT%' AND a.new_data::text LIKE '%price%'
            AND a.created_at <= $2::timestamptz AND a.created_at > $2::timestamptz - INTERVAL '36 hours'
          ORDER BY a.created_at DESC LIMIT 1`,
        [dip.productId, first]
      );
      const actor: string | null = ch.rows[0]?.admin_id ?? null;
      const name = cleanLabel(dip.rows[0].product_name);
      if (!isAdmin(actor)) {
        orphanValue += dip.value; orphanN++;
        continue;
      }
      const back = await query(
        `SELECT 1 FROM audit_logs a
          WHERE a.status = 'success' AND a.admin_id = $3 AND a.action LIKE 'PUT%' AND a.new_data::text LIKE '%price%'
            AND (a.resource_id = $1 OR a.action LIKE '%/products/' || $1 || '%')
            AND a.created_at > $2::timestamptz AND a.created_at < $2::timestamptz + INTERVAL '72 hours' LIMIT 1`,
        [dip.productId, first, actor]
      );
      const cur = perAdmin.get(actor) || { value: 0, n: 0, restored: 0, lines: [], byCust: new Map<string, number>(), staff: 0 };
      cur.value += dip.value; cur.n += dip.rows.length;
      if (back.rows.length) cur.restored++;
      for (const x of dip.rows) {
        const v = (dip.ref - num(x.unit_price)) * num(x.quantity);
        cur.byCust.set(x.user_id, (cur.byCust.get(x.user_id) || 0) + v);
        if (staffNote(x.user_id)) cur.staff += v;
        cur.lines.push(`${x.d} order #${x.order_number}: ${name} sold at ${rs(num(x.unit_price))} (usual ${rs(dip.ref)}) to ${cust(x.user_id, x.customer)}${back.rows.length ? ' — price changed again afterwards' : ''}`);
      }
      perAdmin.set(actor, cur);
    }
    for (const [adminId, d] of perAdmin) {
      const few = d.byCust.size <= 2;
      signal({
        code: 'price_dip_sales', title: 'Changed a price shortly before goods were sold far below their usual price', category: 'pricing', subject: `admin:${adminId}`,
        strength: strengthOf({
          value: d.value, n: d.n, minN: 1, weak: 1000, moderate: 4000, strong: 10000,
          moderateIf: d.restored > 0 || few, strongIf: d.restored > 0 && (few || d.staff > 0),
        }),
        amount: d.value, n: d.n,
        facts: {
          order_lines_sold_low: d.n, value_below_usual_price: r0(d.value), prices_changed_again_after_the_sale: d.restored,
          customers_who_bought_low: d.byCust.size, value_to_staff_accounts: r0(d.staff),
        },
        examples: d.lines,
        innocent: ['A real clearance of stock about to spoil.', 'A typing mistake in the price that was corrected later.'],
      });
    }
    if (orphanN) {
      systemFindings.push({
        code: 'price_dips_unattributed', title: 'Goods sold far below their usual price — the price change could not be traced to a person',
        detail: `${orphanN} short price dip(s) worth about ${rs(orphanValue)} below the usual price. The audit log of that time does not show who changed the price (entries before the audit-log fix did not store the product).`,
        severity: orphanValue >= 5000 ? 'medium' : 'low', amount: r0(orphanValue),
      });
    }
  });
}

export async function cashHolding(ctx: AuditCtx): Promise<void> {
  const { period, P, dataGaps, systemFindings, safe, tok, signal, top2Share, isAdmin, isOwner, act } = ctx;

  // ── 9. Cash: who holds what ────────────────────────────────────────────────
  await safe('cash custody', async () => {
    const used = await query(`SELECT COUNT(*)::int AS c FROM admin_cash_handovers`);
    const col = await query(
      `SELECT x.admin_id, COALESCE(SUM(x.amount), 0) AS collected, MIN(x.at) AS first_at,
              COALESCE(SUM(x.amount) FILTER (WHERE ${win('x.at')}), 0) AS collected_in_period
         FROM (
           SELECT s.received_by AS admin_id, s.amount, s.received_at AS at, s.city_id FROM rider_cash_settlements s WHERE s.received_by IS NOT NULL AND s.status = 'received'
           UNION ALL
           SELECT s.received_by, s.amount, s.received_at, o.city_id FROM ocp_settlements s JOIN order_collection_points o ON o.id = s.ocp_id
            WHERE s.status = 'received' AND s.received_by IS NOT NULL
           UNION ALL
           SELECT o.cash_received_by, o.paid_amount, o.cash_received_at, o.city_id FROM orders o WHERE o.cash_received_by IS NOT NULL AND o.deleted_at IS NULL
         ) x
        WHERE ${upTo('x.at')} AND ${city('x.city_id')}
        GROUP BY x.admin_id`,
      P
    );
    const handed = await query<DbRow<{ admin_id: string }>>(
      `SELECT h.admin_id, COALESCE(SUM(h.amount), 0) AS handed, MAX(h.handed_at) AS last_at
         FROM admin_cash_handovers h WHERE h.handed_at < (($1::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}') GROUP BY h.admin_id`,
      [period.to]
    );
    const handedBy = new Map<string, any>(handed.rows.map((x) => [x.admin_id, x]));
    const ledgerUsed = num(used.rows[0].c) > 0;
    let staffCollected = 0;
    for (const x of col.rows) {
      if (!isAdmin(x.admin_id)) continue;
      const key = `admin:${x.admin_id}`;
      act(key, 'cash_collected_in_period', num(x.collected_in_period));
      if (isOwner(x.admin_id)) continue; // cash reaching the owner is the end of the chain
      staffCollected += num(x.collected);
      if (!ledgerUsed) continue;
      const h = handedBy.get(x.admin_id);
      const balance = num(x.collected) - num(h?.handed);
      const since = new Date(h?.last_at || x.first_at).getTime();
      const age = Math.max(0, Math.floor((Math.min(Date.now(), Date.parse(`${period.to}T23:59:59+05:00`)) - since) / 86400000));
      signal({
        code: 'cash_not_handed_over', title: 'Holds collected cash that has not been handed to the owner', category: 'cash', subject: key,
        strength: strengthOf({ value: balance, n: 1, minN: 1, weak: 5000, moderate: 20000, strong: 50000, moderateIf: age >= 3, strongIf: age >= 7 }),
        amount: balance, n: 1,
        facts: {
          collected_all_time: r0(num(x.collected)), handed_to_owner_all_time: r0(num(h?.handed)),
          should_still_hold: r0(balance), days_since_last_handover: age, collected_in_this_period: r0(num(x.collected_in_period)),
        },
        examples: [`Collected ${rs(num(x.collected))} from riders, collection points and the office counter; ${rs(num(h?.handed))} recorded as handed to the owner.`],
        innocent: ['Cash was handed over but the owner has not recorded it yet.', 'Small shop expenses were paid from this cash (compare with the expenses they recorded).'],
      });
    }
    if (!ledgerUsed && staffCollected > 0) {
      dataGaps.push(`Staff admins have collected ${rs(staffCollected)} in cash so far, but no "cash handed to owner" entry has ever been recorded — so who still holds how much cannot be judged. Record hand-overs on the Audit page.`);
    }

    const off = await query(
      `SELECT o.cash_received_by AS admin_id, o.rider_id, o.paid_amount, o.order_number, ${day('o.cash_received_at')} AS d
         FROM orders o
        WHERE o.cash_received_by IS NOT NULL AND o.rider_id IS NOT NULL AND o.deleted_at IS NULL
          AND ${win('o.cash_received_at')} AND ${city('o.city_id')}
        ORDER BY o.paid_amount DESC`,
      P
    );
    const byAdmin = new Map<string, any[]>();
    const byRider = new Map<string, any[]>();
    for (const x of off.rows) {
      (byAdmin.get(x.admin_id) || byAdmin.set(x.admin_id, []).get(x.admin_id)!).push(x);
      (byRider.get(x.rider_id) || byRider.set(x.rider_id, []).get(x.rider_id)!).push(x);
    }
    for (const [adminId, rows] of byAdmin) {
      if (!isAdmin(adminId) || isOwner(adminId)) continue;
      const value = rows.reduce((a, x) => a + num(x.paid_amount), 0);
      const riders = new Map<string, number>();
      for (const x of rows) riders.set(x.rider_id, (riders.get(x.rider_id) || 0) + num(x.paid_amount));
      signal({
        code: 'office_took_rider_cash', title: 'Marks rider-delivered orders as "payment received at office"', category: 'cash', subject: `admin:${adminId}`,
        strength: strengthOf({ value, n: rows.length, minN: 3, weak: 3000, moderate: 10000, strong: 1e12, moderateIf: top2Share(riders) >= 0.8 && rows.length >= 5, strongIf: false }),
        amount: value, n: rows.length,
        facts: { orders: rows.length, cash_value: r0(value), riders_involved: riders.size, top2_riders_share_pct: r2(top2Share(riders) * 100) },
        examples: rows.map((x) => `${x.d} order #${x.order_number} ${rs(num(x.paid_amount))} — rider ${tok('rider', x.rider_id)} no longer owes this cash`),
        innocent: ['The rider handed over cash order by order instead of in one settlement.', 'The customer paid at the shop.'],
      });
    }
    for (const [riderId, rows] of byRider) {
      const value = rows.reduce((a, x) => a + num(x.paid_amount), 0);
      signal({
        code: 'rider_cash_cleared_by_office', title: 'Their cash dues are cleared order by order from the office instead of a counted settlement', category: 'cash', subject: `rider:${riderId}`,
        strength: strengthOf({ value, n: rows.length, minN: 3, weak: 3000, moderate: 10000, strong: 1e12, moderateIf: rows.length >= 5, strongIf: false }),
        amount: value, n: rows.length,
        facts: { orders: rows.length, cash_value: r0(value), admins_involved: new Set(rows.map((x) => x.admin_id)).size },
        examples: rows.map((x) => `${x.d} order #${x.order_number} ${rs(num(x.paid_amount))} marked received by ${tok('admin', x.admin_id)}`),
        innocent: ['A normal habit of handing cash to the office after each trip.'],
      });
    }

    const none = await query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(o.paid_amount), 0) AS total FROM orders o
        WHERE o.status = 'delivered' AND o.payment_method = 'cash_on_delivery' AND o.payment_status = 'completed'
          AND o.rider_id IS NULL AND o.ocp_id IS NULL AND o.cash_received_by IS NULL AND o.deleted_at IS NULL
          AND ${win('o.delivered_at')} AND ${city('o.city_id')}`,
      P
    );
    if (num(none.rows[0].c) > 0) {
      systemFindings.push({
        code: 'cash_with_no_holder', title: 'Paid orders with nobody recorded as holding the cash',
        detail: `${none.rows[0].c} delivered cash order(s) worth ${rs(num(none.rows[0].total))} were marked delivered from the office with no rider and no collection point. Before the fix that stamps the admin's name, the books did not say who took this money.`,
        severity: num(none.rows[0].total) >= 5000 ? 'high' : 'medium', amount: r0(num(none.rows[0].total)),
      });
    }
    const unpaid = await query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(o.total_amount - o.paid_amount), 0) AS total FROM orders o
        WHERE o.status = 'delivered' AND o.payment_status <> 'completed' AND o.deleted_at IS NULL
          AND ${win('o.delivered_at')} AND ${city('o.city_id')}`,
      P
    );
    if (num(unpaid.rows[0].c) > 0) {
      systemFindings.push({
        code: 'delivered_not_paid', title: 'Delivered orders still showing unpaid',
        detail: `${unpaid.rows[0].c} delivered order(s) show ${rs(num(unpaid.rows[0].total))} not collected. Goods left; the money is not in the books.`,
        severity: num(unpaid.rows[0].total) >= 5000 ? 'high' : 'medium', amount: r0(num(unpaid.rows[0].total)),
      });
    }
  });
}
