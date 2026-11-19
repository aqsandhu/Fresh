// Corruption audit — Period totals and the order-side signals: weight edits, waste and downgrades, refunds, packed orders cancelled, coupons.
// Moved out of evidence.ts's single buildEvidence() (W21): each section is now
// its own function; the code inside is unchanged.
import { query, type DbRow } from '../../../config/database';
import { BUSINESS_TZ } from '../../../utils/businessTime';
import { type AuditCtx, num, r0, r2, pct, rs, cleanLabel, win, day, city, priceOf } from '../evidenceKit';
import { bump, strengthOf } from '../scoring';

export async function periodTotals(ctx: AuditCtx): Promise<void> {
  const { period, P, totals, subjects, safe, signal, isOwner, act } = ctx;

  // ── Period totals (context for every judgement) ───────────────────────────
  await safe('order totals', async () => {
    const r = await query(
      `SELECT COUNT(*) FILTER (WHERE o.status = 'delivered' AND ${win('o.delivered_at')})::int AS delivered,
              COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered' AND ${win('o.delivered_at')}), 0) AS delivered_value,
              COUNT(*) FILTER (WHERE o.status = 'cancelled' AND ${win('o.cancelled_at')})::int AS cancelled,
              COALESCE(SUM(o.coupon_discount) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded') AND ${win('o.placed_at')}), 0) AS coupon_discount
         FROM orders o
        WHERE o.deleted_at IS NULL AND ${city('o.city_id')}`,
      P
    );
    totals.orders_delivered = num(r.rows[0].delivered);
    totals.sales_value = r0(num(r.rows[0].delivered_value));
    totals.orders_cancelled = num(r.rows[0].cancelled);
    totals.coupon_discount_given = r0(num(r.rows[0].coupon_discount));
  });
  await safe('expense totals', async () => {
    const r = await query(
      `SELECT e.type, COALESCE(SUM(e.amount), 0) AS total FROM expenses e
        WHERE ${win('e.incurred_at')} AND ${city('e.city_id')} GROUP BY e.type`,
      P
    );
    for (const x of r.rows) totals[`expenses_${x.type}`] = r0(num(x.total));
  });
  await safe('admin activity', async () => {
    const r = await query(
      `SELECT a.admin_id, COUNT(*)::int AS writes,
              COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM a.created_at AT TIME ZONE '${BUSINESS_TZ}') < 5)::int AS night_writes,
              COUNT(*) FILTER (WHERE a.status = 'failed' AND (a.error_message ILIKE '%permission%' OR a.error_message ILIKE '%super%admin%'))::int AS denied
         FROM audit_logs a
        WHERE a.admin_id IS NOT NULL AND ${win('a.created_at')}
        GROUP BY a.admin_id`,
      [period.from, period.to]
    );
    for (const x of r.rows) {
      const key = `admin:${x.admin_id}`;
      if (!subjects.has(key)) continue;
      const writes = num(x.writes);
      const night = num(x.night_writes);
      const denied = num(x.denied);
      act(key, 'recorded_actions', writes);
      signal({
        code: 'permission_denials', title: 'Repeatedly tried actions they are not allowed to do', category: 'process', subject: key,
        strength: denied >= 15 ? 'moderate' : denied >= 5 ? 'weak' : null,
        amount: 0, n: denied, facts: { denied_attempts: denied, all_recorded_actions: writes },
        examples: [`${denied} attempt(s) were refused for lack of permission or for needing the super admin.`],
        innocent: ['Exploring the panel while learning it.', 'Buttons shown for features the role cannot use.'],
      });
      signal({
        code: 'night_activity', title: 'Much of their work is recorded between midnight and 5 am', category: 'process', subject: key,
        strength: writes >= 10 && night / writes >= 0.3 && !isOwner(x.admin_id) ? 'weak' : null,
        amount: 0, n: night, facts: { night_actions: night, all_recorded_actions: writes, night_share_pct: pct(night, writes) },
        examples: [`${night} of ${writes} recorded actions happened between 00:00 and 05:00 Pakistan time.`],
        innocent: ['Night shift or early-morning mandi/packing hours.', 'Late-evening orders being closed after midnight.'],
      });
    }
  });
}

export async function weightEdits(ctx: AuditCtx): Promise<void> {
  const { P, totals, safe, cust, signal, top2Share, isAdmin, act, staffNote } = ctx;

  // ── 1. Weight edits (bills changed after weighing) ────────────────────────
  await safe('weight edits', async () => {
    const r = await query(
      `SELECT e.edited_by, e.old_total, e.new_total, ${day('e.created_at')} AS d, o.order_number, o.user_id, cu.full_name AS customer
         FROM order_item_weight_edits e
         JOIN orders o ON o.id = e.order_id
         LEFT JOIN users cu ON cu.id = o.user_id
        WHERE e.edited_by IS NOT NULL AND ${win('e.created_at')} AND ${city('o.city_id')}
        ORDER BY e.created_at`,
      P
    );
    totals.weight_edits = r.rows.length;
    const by = new Map<string, any[]>();
    for (const x of r.rows) (by.get(x.edited_by) || by.set(x.edited_by, []).get(x.edited_by)!).push(x);
    const stats = new Map<string, { n: number; down: number; up: number; downN: number; upN: number }>();
    for (const [adminId, rows] of by) {
      const s = { n: rows.length, down: 0, up: 0, downN: 0, upN: 0 };
      for (const x of rows) {
        const d = num(x.new_total) - num(x.old_total);
        if (d < -0.005) { s.down += -d; s.downN++; } else if (d > 0.005) { s.up += d; s.upN++; }
      }
      stats.set(adminId, s);
    }
    for (const [adminId, rows] of by) {
      if (!isAdmin(adminId)) continue;
      const key = `admin:${adminId}`;
      const s = stats.get(adminId)!;
      act(key, 'weight_edits', s.n);
      // Peers = every other editor together (needs enough edits to mean anything).
      let pn = 0; let pDown = 0; let pUp = 0;
      for (const [other, o] of stats) if (other !== adminId) { pn += o.n; pDown += o.downN; pUp += o.upN; }
      const peerDownShare = pn >= 10 ? pDown / pn : null;
      const peerUpShare = pn >= 10 ? pUp / pn : null;
      const downShare = s.downN / s.n;
      const upShare = s.upN / s.n;
      const netDown = s.down - s.up;
      const netUp = s.up - s.down;

      if (netDown > 0) {
        const byCust = new Map<string, number>();
        let staffBenefit = 0;
        for (const x of rows) {
          const d = num(x.old_total) - num(x.new_total);
          if (d <= 0) continue;
          byCust.set(x.user_id, (byCust.get(x.user_id) || 0) + d);
          if (staffNote(x.user_id)) staffBenefit += d;
        }
        const concentrated = byCust.size >= 4 && top2Share(byCust) >= 0.6;
        const oneWay = downShare >= 0.7 && (peerDownShare === null || downShare >= peerDownShare + 0.2);
        let strength = strengthOf({
          value: netDown, n: s.n, minN: 4, weak: 500, moderate: 1500, strong: 5000,
          moderateIf: oneWay, strongIf: oneWay && downShare >= 0.8 && s.n >= 8,
        });
        if (strength && strength !== 'strong' && (concentrated || staffBenefit > 0)) strength = bump(strength);
        signal({
          code: 'weight_bills_lowered', title: 'Lowers bills after weighing far more often than raising them', category: 'stock', subject: key,
          strength, amount: netDown, n: s.n,
          facts: {
            edits: s.n, lowered: s.downN, raised: s.upN, lowered_share_pct: pct(s.downN, s.n),
            peers_lowered_share_pct: peerDownShare === null ? null : r2(peerDownShare * 100),
            net_value_lowered: r0(netDown), customers_benefiting: byCust.size,
            top2_customers_share_pct: r2(top2Share(byCust) * 100), value_to_staff_accounts: r0(staffBenefit),
          },
          examples: rows.filter((x) => num(x.new_total) < num(x.old_total))
            .sort((a, b) => (num(b.old_total) - num(b.new_total)) - (num(a.old_total) - num(a.new_total)))
            .map((x) => `${x.d} order #${x.order_number}: ${rs(num(x.old_total))} → ${rs(num(x.new_total))} for ${cust(x.user_id, x.customer)}`),
          innocent: ['The ordered weight is an estimate; real items often weigh less.', 'A scale or packing habit shared by the whole team (compare the peers figure).'],
        });
      }
      if (netUp > 0) {
        const oneWay = upShare >= 0.7 && (peerUpShare === null || upShare >= peerUpShare + 0.2);
        signal({
          code: 'weight_bills_raised', title: 'Raises bills after weighing far more often than lowering them', category: 'pricing', subject: key,
          strength: strengthOf({
            value: netUp, n: s.n, minN: 4, weak: 1000, moderate: 3000, strong: 8000,
            moderateIf: oneWay, strongIf: oneWay && upShare >= 0.8 && s.n >= 8,
          }),
          amount: netUp, n: s.n,
          facts: {
            edits: s.n, raised: s.upN, lowered: s.downN, raised_share_pct: pct(s.upN, s.n),
            peers_raised_share_pct: peerUpShare === null ? null : r2(peerUpShare * 100), net_value_raised: r0(netUp),
          },
          examples: rows.filter((x) => num(x.new_total) > num(x.old_total))
            .sort((a, b) => (num(b.new_total) - num(b.old_total)) - (num(a.new_total) - num(a.old_total)))
            .map((x) => `${x.d} order #${x.order_number}: ${rs(num(x.old_total))} → ${rs(num(x.new_total))}`),
          innocent: ['Items such as melons or chicken usually weigh more than the estimate.', 'Customers asked for a little extra at packing time.'],
        });
      }
    }
  });
}

export async function wasteAndDowngrades(ctx: AuditCtx): Promise<void> {
  const { P, totals, safe, tok, signal, isAdmin, act } = ctx;

  // ── 2. Waste and quality downgrades ────────────────────────────────────────
  await safe('waste and conversions', async () => {
    const r = await query(
      `SELECT m.created_by, m.reason, m.quality, m.delta, m.note, m.approved_by, ${day('m.created_at')} AS d,
              m.product_id, p.name_en, p.price, p.price_b, p.price_c
         FROM stock_movements m JOIN products p ON p.id = m.product_id
        WHERE m.reason IN ('waste', 'convert_out') AND m.created_by IS NOT NULL
          AND ${win('m.created_at')} AND ${city('p.city_id')}
        ORDER BY m.created_at`,
      P
    );
    const waste = new Map<string, any[]>();
    const conv = new Map<string, any[]>();
    let allWaste = 0;
    for (const x of r.rows) {
      const qty = -num(x.delta);
      if (x.reason === 'waste') {
        x.value = qty * priceOf(x.quality, x);
        allWaste += x.value;
        (waste.get(x.created_by) || waste.set(x.created_by, []).get(x.created_by)!).push(x);
      } else {
        const to = /to Quality ([ABC])/i.exec(String(x.note || ''))?.[1]?.toUpperCase();
        if (!to) continue;
        x.to = to;
        x.value = qty * Math.max(0, priceOf(x.quality, x) - priceOf(to, x));
        if (x.value > 0) (conv.get(x.created_by) || conv.set(x.created_by, []).get(x.created_by)!).push(x);
      }
    }
    totals.waste_value = r0(allWaste);
    const sales = totals.sales_value || 0;
    // How much of each product was SOLD in the period — spoilage of 5-10 % of
    // what moves is ordinary for produce; wasting a large part of it is not.
    const soldRes = await query<DbRow<{ product_id: string }>>(
      `SELECT oi.product_id, COALESCE(SUM(oi.quantity * CASE COALESCE(oi.unit, 'full')
                WHEN 'half_kg' THEN 0.5 WHEN 'quarter_kg' THEN 0.25 WHEN 'half_dozen' THEN 0.5 ELSE 1 END), 0) AS units
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'delivered' AND o.deleted_at IS NULL AND ${win('o.delivered_at')} AND ${city('o.city_id')}
        GROUP BY oi.product_id`,
      P
    );
    const sold = new Map<string, number>(soldRes.rows.map((x) => [x.product_id, num(x.units)]));
    const wastedAll = new Map<string, number>();
    for (const list of waste.values()) for (const x of list) wastedAll.set(x.product_id, (wastedAll.get(x.product_id) || 0) + -num(x.delta));
    for (const [adminId, rows] of waste) {
      if (!isAdmin(adminId)) continue;
      const key = `admin:${adminId}`;
      const value = rows.reduce((a, x) => a + x.value, 0);
      const approvers = new Map<string, number>();
      let unapproved = 0;
      for (const x of rows) {
        if (x.approved_by) approvers.set(x.approved_by, (approvers.get(x.approved_by) || 0) + x.value);
        else unapproved += x.value;
      }
      const ofSales = sales > 0 ? value / sales : 0;
      // Structural mark: a product of which this person wasted a large part of
      // everything that moved (sold + wasted), on at least 3 occasions.
      let worstRate = 0; let worstName = '';
      const mine = new Map<string, { qty: number; n: number; name: string }>();
      for (const x of rows) {
        const cur = mine.get(x.product_id) || { qty: 0, n: 0, name: x.name_en };
        cur.qty += -num(x.delta); cur.n++;
        mine.set(x.product_id, cur);
      }
      for (const [pid, m] of mine) {
        const moved = (sold.get(pid) || 0) + (wastedAll.get(pid) || 0);
        const rate = moved > 0 ? m.qty / moved : 0;
        if (m.n >= 3 && rate > worstRate) { worstRate = rate; worstName = m.name; }
      }
      const heavy = worstRate >= 0.2;
      act(key, 'waste_entries', rows.length);
      signal({
        code: 'waste_high', title: 'Writes off a lot of stock as waste', category: 'stock', subject: key,
        strength: strengthOf({
          value, n: rows.length, minN: 2, weak: 2000, moderate: 6000, strong: 15000,
          moderateIf: heavy || ofSales >= 0.08, strongIf: heavy && ofSales >= 0.05 && rows.length >= 4,
        }),
        amount: value, n: rows.length,
        facts: {
          waste_entries: rows.length, waste_value_at_selling_price: r0(value), pct_of_period_sales: r2(ofSales * 100),
          share_of_all_waste_pct: pct(value, allWaste), value_without_second_admin: r0(unapproved),
          products: new Set(rows.map((x) => x.name_en)).size,
          worst_product: worstName ? cleanLabel(worstName) : null,
          worst_product_wasted_pct_of_all_that_moved: r2(worstRate * 100),
        },
        examples: rows.sort((a, b) => b.value - a.value)
          .map((x) => `${x.d} ${cleanLabel(x.name_en)} (Q${x.quality}) ${r2(-num(x.delta))} wasted ≈ ${rs(x.value)}${x.approved_by ? `, co-approved by ${tok('admin', x.approved_by)}` : ''}`),
        innocent: ['Fresh produce spoils — heat, slow days and load-shedding raise waste.', 'This person may simply be the one who records waste for the whole store.'],
      });
    }
    for (const [adminId, rows] of conv) {
      if (!isAdmin(adminId)) continue;
      const value = rows.reduce((a, x) => a + x.value, 0);
      signal({
        code: 'quality_downgraded', title: 'Moves stock down to a cheaper quality', category: 'stock', subject: `admin:${adminId}`,
        strength: strengthOf({ value, n: rows.length, minN: 2, weak: 1000, moderate: 4000, strong: 10000, strongIf: rows.length >= 5 }),
        amount: value, n: rows.length,
        facts: { downgrades: rows.length, selling_value_lost: r0(value) },
        examples: rows.sort((a, b) => b.value - a.value)
          .map((x) => `${x.d} ${cleanLabel(x.name_en)} ${r2(-num(x.delta))} from Q${x.quality} to Q${x.to} ≈ ${rs(x.value)} less`),
        innocent: ['Stock that sat a day genuinely drops a grade.', 'Supervised re-grading after a purchase.'],
      });
    }
  });
}

export async function refunds(ctx: AuditCtx): Promise<void> {
  const { P, systemFindings, totals, safe, tok, cust, signal, top2Share, isAdmin, act, staffNote } = ctx;

  // ── 3. Refunds ─────────────────────────────────────────────────────────────
  await safe('refunds', async () => {
    const r = await query<DbRow<{ refunded_by: string | null }>>(
      `SELECT rf.refunded_by, rf.amount, rf.approved_by, ${day('rf.created_at')} AS d, o.order_number, o.user_id, o.rider_id, cu.full_name AS customer
         FROM refunds rf JOIN orders o ON o.id = rf.order_id LEFT JOIN users cu ON cu.id = o.user_id
        WHERE ${win('rf.created_at')} AND ${city('o.city_id')}
        ORDER BY rf.amount DESC`,
      P
    );
    const all = r.rows.reduce((a: number, x) => a + num(x.amount), 0);
    totals.refunds_value = r0(all);
    totals.refunds = r.rows.length;
    const noActor = r.rows.filter((x) => !x.refunded_by);
    if (noActor.length) {
      systemFindings.push({
        code: 'refunds_due_unassigned', title: 'Refunds recorded with nobody named as paying them',
        detail: `${noActor.length} refund row(s) worth ${rs(noActor.reduce((a: number, x) => a + num(x.amount), 0))} were created automatically when a paid order was cancelled. Check each was really paid back, and by whom.`,
        severity: 'low', amount: r0(noActor.reduce((a: number, x) => a + num(x.amount), 0)),
      });
    }
    const by = new Map<string, any[]>();
    for (const x of r.rows) if (x.refunded_by) (by.get(x.refunded_by) || by.set(x.refunded_by, []).get(x.refunded_by)!).push(x);
    for (const [adminId, rows] of by) {
      if (!isAdmin(adminId)) continue;
      const value = rows.reduce((a, x) => a + num(x.amount), 0);
      const byCust = new Map<string, number>();
      let staff = 0;
      for (const x of rows) {
        byCust.set(x.user_id, (byCust.get(x.user_id) || 0) + num(x.amount));
        if (staffNote(x.user_id)) staff += num(x.amount);
      }
      const repeat = Array.from(byCust.keys()).filter((u) => rows.filter((x) => x.user_id === u).length >= 2).length;
      const concentrated = (rows.length >= 4 && byCust.size >= 1 && top2Share(byCust) >= 0.6 && byCust.size < rows.length) || staff > 0;
      act(`admin:${adminId}`, 'refunds', rows.length);
      signal({
        code: 'refunds_high', title: 'Pays out a lot in refunds', category: 'cash', subject: `admin:${adminId}`,
        strength: strengthOf({
          value, n: rows.length, minN: 2, weak: 2000, moderate: 6000, strong: 15000,
          moderateIf: rows.length >= 3 && (concentrated || repeat >= 2), strongIf: rows.length >= 5 && concentrated,
        }),
        amount: value, n: rows.length,
        facts: {
          refunds: rows.length, refund_value: r0(value), share_of_all_refunds_pct: pct(value, all),
          customers: byCust.size, customers_refunded_twice_or_more: repeat,
          top2_customers_share_pct: r2(top2Share(byCust) * 100), value_to_staff_accounts: r0(staff),
          co_approved: rows.filter((x) => x.approved_by).length,
        },
        examples: rows.map((x) => `${x.d} order #${x.order_number}: ${rs(num(x.amount))} to ${cust(x.user_id, x.customer)}${x.approved_by ? `, co-approved by ${tok('admin', x.approved_by)}` : ''}`),
        innocent: ['One person may handle all complaints, so all refunds carry their name.', 'A bad batch of produce causes a burst of genuine refunds.'],
      });
    }
  });
}

export async function packedOrdersCancelled(ctx: AuditCtx): Promise<void> {
  const { P, totals, safe, cust, signal, isAdmin } = ctx;

  // ── 4. Packed orders cancelled ─────────────────────────────────────────────
  await safe('late cancellations', async () => {
    const r = await query(
      `SELECT o.order_number, o.total_amount, ${day('o.cancelled_at')} AS d, o.user_id, cu.full_name AS customer,
              COALESCE(o.cancelled_by, (
                SELECT a.admin_id FROM audit_logs a
                 WHERE a.resource_id = o.id::text AND a.status = 'success' AND a.new_data->>'status' = 'cancelled'
                 ORDER BY a.created_at DESC LIMIT 1)) AS actor
         FROM orders o LEFT JOIN users cu ON cu.id = o.user_id
        WHERE o.status = 'cancelled' AND o.ready_at IS NOT NULL AND o.deleted_at IS NULL
          AND ${win('o.cancelled_at')} AND ${city('o.city_id')}
        ORDER BY o.total_amount DESC`,
      P
    );
    totals.packed_orders_cancelled = r.rows.length;
    const by = new Map<string, any[]>();
    for (const x of r.rows) if (x.actor) (by.get(x.actor) || by.set(x.actor, []).get(x.actor)!).push(x);
    for (const [adminId, rows] of by) {
      if (!isAdmin(adminId)) continue;
      const value = rows.reduce((a, x) => a + num(x.total_amount), 0);
      signal({
        code: 'packed_orders_cancelled', title: 'Cancels orders after the goods were already packed', category: 'stock', subject: `admin:${adminId}`,
        strength: strengthOf({ value, n: rows.length, minN: 3, weak: 3000, moderate: 10000, strong: 25000, moderateIf: rows.length >= 5, strongIf: false }),
        amount: value, n: rows.length,
        facts: { packed_orders_cancelled: rows.length, goods_value: r0(value), all_packed_cancellations: r.rows.length },
        examples: rows.map((x) => `${x.d} order #${x.order_number} (${rs(num(x.total_amount))}) of ${cust(x.user_id, x.customer)}`),
        innocent: ['Customer could not be reached or refused at the last minute.', 'The books put the goods back in stock — a shelf count shows whether they really came back.'],
      });
    }
  });
}

export async function coupons(ctx: AuditCtx): Promise<void> {
  const { P, safe, cust, signal, top2Share, isAdmin, staffNote } = ctx;

  // ── 5. Coupons ─────────────────────────────────────────────────────────────
  await safe('coupons', async () => {
    const r = await query(
      `SELECT c.created_by, c.code, cr.discount_amount, cr.user_id, cu.full_name AS customer, ${day('cr.created_at')} AS d, o.order_number
         FROM coupon_redemptions cr
         JOIN coupons c ON c.id = cr.coupon_id
         LEFT JOIN orders o ON o.id = cr.order_id
         LEFT JOIN users cu ON cu.id = cr.user_id
        WHERE c.created_by IS NOT NULL AND COALESCE(c.trigger_type, 'manual') = 'manual'
          AND ${win('cr.created_at')} AND ${city('c.city_id')}
          AND (o.id IS NULL OR o.status NOT IN ('cancelled', 'refunded'))
        ORDER BY cr.discount_amount DESC`,
      P
    );
    const by = new Map<string, any[]>();
    for (const x of r.rows) (by.get(x.created_by) || by.set(x.created_by, []).get(x.created_by)!).push(x);
    for (const [adminId, rows] of by) {
      if (!isAdmin(adminId)) continue;
      const value = rows.reduce((a, x) => a + num(x.discount_amount), 0);
      const byCust = new Map<string, number>();
      let staff = 0;
      for (const x of rows) {
        byCust.set(x.user_id, (byCust.get(x.user_id) || 0) + num(x.discount_amount));
        if (staffNote(x.user_id)) staff += num(x.discount_amount);
      }
      const share = top2Share(byCust);
      const narrow = rows.length >= 4 && share >= 0.6;
      let strength = strengthOf({
        value, n: rows.length, minN: 3, weak: 2000, moderate: 6000, strong: 15000,
        moderateIf: narrow, strongIf: rows.length >= 6 && share >= 0.7,
      });
      if (strength === 'weak' && staff > 0) strength = 'moderate';
      signal({
        code: 'coupon_giveaway', title: 'Coupons they created gave large discounts to very few customers', category: 'pricing', subject: `admin:${adminId}`,
        strength, amount: value, n: rows.length,
        facts: {
          redemptions: rows.length, discount_given: r0(value), customers: byCust.size,
          top2_customers_share_pct: r2(share * 100), value_to_staff_accounts: r0(staff),
          coupon_codes: new Set(rows.map((x) => x.code)).size,
        },
        examples: rows.map((x) => `${x.d} coupon ${cleanLabel(x.code, 20)}: ${rs(num(x.discount_amount))} off for ${cust(x.user_id, x.customer)}`),
        innocent: ['A real promotion that only a few customers happened to use.', 'A goodwill coupon given to a customer after a complaint.'],
      });
    }
  });
}
