// ============================================================================
// CORRUPTION AUDIT — evidence builder.
//
// Reads the books for ONE period and turns them into signals about people
// (admins, riders, collection points) plus findings that belong to nobody in
// particular. Rules that keep it fair:
//   • every signal carries its sample size and the rupees involved,
//   • volume alone is never "strong": doing a lot of work is not evidence.
//     A strong signal needs a structural mark — one-directional bias, the
//     same few beneficiaries, a duplicate, a price put back after the sale …
//   • where peers exist the person is compared with them, so a habit the
//     whole team shares (e.g. estimates that always run heavy) is not held
//     against one person,
//   • anything that could not be measured is written to `dataGaps`.
// People in example lines are written as [[admin:<id>]] / [[cust:<id>]]
// tokens: the AI gets aliases, the owner's screen gets names.
// ============================================================================

import { query } from '../../config/database';
import logger from '../../utils/logger';
import { APPROVAL_VALUE_THRESHOLD } from '../../utils/adminApproval';
import { BUSINESS_TZ } from '../../utils/businessTime';
import { EvidencePack, Signal, SignalCategory, Strength, Subject, SubjectType, SystemFinding } from './types';
import { bump, strengthOf } from './scoring';

const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const r0 = (n: number): number => Math.round(n);
const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (part: number, whole: number): number => (whole > 0 ? r2((part / whole) * 100) : 0);
const rs = (n: number): string => `Rs ${r0(n).toLocaleString('en-PK')}`;
const median = (xs: number[]): number | null => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
/** Admin-typed text (product names, expense types) is DATA for the AI: strip it to plain words. */
export const cleanLabel = (v: unknown, max = 30): string =>
  String(v ?? '').replace(/[^\p{L}\p{N} .&/-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || 'item';

const win = (col: string): string =>
  `${col} >= ($1::date::timestamp AT TIME ZONE '${BUSINESS_TZ}') AND ${col} < (($2::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}')`;
const upTo = (col: string): string => `${col} < (($2::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}')`;
const day = (col: string): string => `to_char(${col} AT TIME ZONE '${BUSINESS_TZ}', 'YYYY-MM-DD')`;
const city = (col: string): string => `($3::uuid IS NULL OR ${col} = $3)`;
const priceOf = (quality: string, p: any): number => {
  const preferred = quality === 'B' ? num(p.price_b) : quality === 'C' ? num(p.price_c) : num(p.price);
  return preferred > 0 ? preferred : num(p.price);
};

export interface AuditPeriod { from: string; to: string; cityId: string | null }

interface TokenInfo { alias: string; name: string }

export interface BuiltEvidence {
  pack: EvidencePack;
  /** token ("admin:<id>", "cust:<id>") → alias + real name. */
  tokens: Record<string, TokenInfo>;
}

/** Replace [[type:id]] tokens with aliases (for the AI) or names (for the owner). */
export function renderTokens(text: string, tokens: Record<string, TokenInfo>, mode: 'alias' | 'name'): string {
  return text.replace(/\[\[([a-z]+:[0-9a-f-]+)\]\]/gi, (_m, key: string) => {
    const t = tokens[key];
    if (!t) return mode === 'alias' ? 'someone' : 'unknown';
    return mode === 'alias' ? t.alias : `${t.name}`;
  });
}

export function renderPack(built: BuiltEvidence, mode: 'alias' | 'name'): EvidencePack {
  const { pack, tokens } = built;
  const tx = (s: string) => renderTokens(s, tokens, mode);
  return {
    ...pack,
    subjects: pack.subjects.map((s) => (mode === 'alias' ? { ...s, name: s.alias } : s)),
    signals: pack.signals.map((sig) => ({
      ...sig,
      examples: sig.examples.map(tx),
      facts: Object.fromEntries(Object.entries(sig.facts).map(([k, v]) => [k, typeof v === 'string' ? tx(v) : v])),
    })),
    systemFindings: pack.systemFindings.map((f) => ({ ...f, detail: tx(f.detail) })),
  };
}

export async function buildEvidence(period: AuditPeriod): Promise<BuiltEvidence> {
  const P: unknown[] = [period.from, period.to, period.cityId];
  const days = Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86400000) + 1;
  const dataGaps: string[] = [];
  const systemFindings: SystemFinding[] = [];
  const totals: Record<string, number> = {};
  const baselines: Record<string, number | null> = {};
  const tokens: Record<string, TokenInfo> = {};
  const subjects = new Map<string, Subject>();
  const pending: Omit<Signal, 'id'>[] = [];
  const counters: Record<string, number> = { A: 0, R: 0, O: 0, C: 0 };

  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err: any) {
      logger.warn('corruption audit: section skipped', { label, error: err?.message });
      dataGaps.push(`Could not read "${label}" (${String(err?.message || 'error').slice(0, 120)}) — this part was not judged.`);
      return null;
    }
  };

  const addSubject = (type: SubjectType, id: string, name: string, role: string, isOwner = false): Subject => {
    const key = `${type}:${id}`;
    let s = subjects.get(key);
    if (!s) {
      const letter = type === 'admin' ? 'A' : type === 'rider' ? 'R' : 'O';
      const alias = `${letter}${++counters[letter]}`;
      s = { key, type, id, name: name || 'Unknown', alias, role, isOwner, activity: {} };
      subjects.set(key, s);
      tokens[key] = { alias, name: s.name };
    }
    return s;
  };
  const tok = (type: string, id: string | null | undefined): string => (id ? `[[${type}:${id}]]` : 'unknown');
  const staffUserIds = new Set<string>();
  const cust = (userId: string | null | undefined, name?: string | null): string => {
    if (!userId) return 'unknown customer';
    const key = `cust:${userId}`;
    if (!tokens[key]) tokens[key] = { alias: `C${++counters.C}`, name: name || 'Customer' };
    else if (name && tokens[key].name === 'Customer') tokens[key].name = name;
    return `[[${key}]]`;
  };
  const signal = (s: {
    code: string; title: string; category: SignalCategory; subject: string; strength: Strength | null;
    amount: number; n: number; facts: Signal['facts']; examples: string[]; innocent: string[];
  }): void => {
    if (!s.strength || !subjects.has(s.subject)) return;
    pending.push({ ...s, strength: s.strength, amount: r0(s.amount), examples: s.examples.slice(0, 5) });
  };
  /** Share of a total held by the two largest groups. */
  const top2Share = (byKey: Map<string, number>): number => {
    const vals = Array.from(byKey.values()).sort((a, b) => b - a);
    const total = vals.reduce((a, b) => a + b, 0);
    return total > 0 ? (vals[0] + (vals[1] || 0)) / total : 0;
  };

  // ── Who can be judged ──────────────────────────────────────────────────────
  await safe('admins', async () => {
    const r = await query(
      `SELECT u.id, u.full_name, u.role, ar.name AS role_name
         FROM users u
         LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
        WHERE u.role IN ('admin', 'super_admin') AND u.deleted_at IS NULL
        ORDER BY u.created_at`
    );
    for (const u of r.rows) {
      addSubject('admin', u.id, u.full_name, u.role === 'super_admin' ? 'Super admin (owner)' : `Admin${u.role_name ? ` — ${cleanLabel(u.role_name, 40)}` : ''}`, u.role === 'super_admin');
      staffUserIds.add(u.id);
    }
  });
  const riderUser = new Map<string, string>();
  await safe('riders', async () => {
    const r = await query(
      `SELECT r.id, r.user_id, u.full_name FROM riders r JOIN users u ON u.id = r.user_id
        WHERE r.deleted_at IS NULL AND ($1::uuid IS NULL OR r.city_id = $1) ORDER BY r.created_at`,
      [period.cityId]
    );
    for (const x of r.rows) {
      addSubject('rider', x.id, x.full_name, 'Rider');
      staffUserIds.add(x.user_id);
      riderUser.set(x.id, x.user_id);
    }
  });
  await safe('collection points', async () => {
    const r = await query(
      `SELECT id, name FROM order_collection_points WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR city_id = $1) ORDER BY created_at`,
      [period.cityId]
    );
    for (const x of r.rows) addSubject('ocp', x.id, x.name, 'Collection point (OCP)');
  });
  const isAdmin = (id: string | null): id is string => Boolean(id && subjects.has(`admin:${id}`));
  const isOwner = (id: string | null): boolean => Boolean(id && subjects.get(`admin:${id}`)?.isOwner);
  const act = (key: string, field: string, value: number): void => {
    const s = subjects.get(key);
    if (s) s.activity[field] = r2((s.activity[field] || 0) + value);
  };
  const staffNote = (userId: string | null): boolean => Boolean(userId && staffUserIds.has(userId));

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
    const soldRes = await query(
      `SELECT oi.product_id, COALESCE(SUM(oi.quantity * CASE COALESCE(oi.unit, 'full')
                WHEN 'half_kg' THEN 0.5 WHEN 'quarter_kg' THEN 0.25 WHEN 'half_dozen' THEN 0.5 ELSE 1 END), 0) AS units
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'delivered' AND o.deleted_at IS NULL AND ${win('o.delivered_at')} AND ${city('o.city_id')}
        GROUP BY oi.product_id`,
      P
    );
    const sold = new Map<string, number>(soldRes.rows.map((x: any) => [x.product_id, num(x.units)]));
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

  // ── 3. Refunds ─────────────────────────────────────────────────────────────
  await safe('refunds', async () => {
    const r = await query(
      `SELECT rf.refunded_by, rf.amount, rf.approved_by, ${day('rf.created_at')} AS d, o.order_number, o.user_id, o.rider_id, cu.full_name AS customer
         FROM refunds rf JOIN orders o ON o.id = rf.order_id LEFT JOIN users cu ON cu.id = o.user_id
        WHERE ${win('rf.created_at')} AND ${city('o.city_id')}
        ORDER BY rf.amount DESC`,
      P
    );
    const all = r.rows.reduce((a: number, x: any) => a + num(x.amount), 0);
    totals.refunds_value = r0(all);
    totals.refunds = r.rows.length;
    const noActor = r.rows.filter((x: any) => !x.refunded_by);
    if (noActor.length) {
      systemFindings.push({
        code: 'refunds_due_unassigned', title: 'Refunds recorded with nobody named as paying them',
        detail: `${noActor.length} refund row(s) worth ${rs(noActor.reduce((a: number, x: any) => a + num(x.amount), 0))} were created automatically when a paid order was cancelled. Check each was really paid back, and by whom.`,
        severity: 'low', amount: r0(noActor.reduce((a: number, x: any) => a + num(x.amount), 0)),
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

  // ── 7. Purchases entered by staff ──────────────────────────────────────────
  await safe('stock purchases', async () => {
    const r = await query(
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
    totals.purchases_value = r0(r.rows.reduce((a: number, x: any) => a + num(x.purchase_price), 0));
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
    const handed = await query(
      `SELECT h.admin_id, COALESCE(SUM(h.amount), 0) AS handed, MAX(h.handed_at) AS last_at
         FROM admin_cash_handovers h WHERE h.handed_at < (($1::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}') GROUP BY h.admin_id`,
      [period.to]
    );
    const handedBy = new Map<string, any>(handed.rows.map((x: any) => [x.admin_id, x]));
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
    const r = await query(
      `SELECT t.rider_id, COUNT(*)::int AS tasks,
              COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed,
              COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE t.status = 'completed' AND t.arrived_at IS NULL)::int AS no_arrival
         FROM rider_tasks t JOIN riders rd ON rd.id = t.rider_id
        WHERE t.order_id IS NOT NULL AND ${win('t.assigned_at')} AND ${city('rd.city_id')}
        GROUP BY t.rider_id`,
      P
    );
    const c = await query(
      `SELECT o.rider_id, COUNT(DISTINCT c.id)::int AS complaints, COALESCE(SUM(rf.amount), 0) AS refunded
         FROM complaints c JOIN orders o ON o.id = c.order_id
         LEFT JOIN refunds rf ON rf.complaint_id = c.id
        WHERE o.rider_id IS NOT NULL AND ${win('c.created_at')} AND ${city('o.city_id')}
        GROUP BY o.rider_id`,
      P
    );
    const compl = new Map<string, any>(c.rows.map((x: any) => [x.rider_id, x]));
    const big = r.rows.filter((x: any) => num(x.tasks) >= 15);
    const peerFail = (id: string) => median(big.filter((x: any) => x.rider_id !== id).map((x: any) => num(x.failed) / num(x.tasks)));
    const peerNoArr = (id: string) => median(big.filter((x: any) => x.rider_id !== id && num(x.completed) > 0).map((x: any) => num(x.no_arrival) / num(x.completed)));
    const peerCompl = (id: string) => median(big.filter((x: any) => x.rider_id !== id).map((x: any) => num(compl.get(x.rider_id)?.complaints) / num(x.tasks)));
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
    const pay = await query(
      `SELECT o.rider_id, COUNT(*)::int AS n, AVG(o.rider_delivery_charge) AS avg_pay, SUM(o.rider_delivery_charge) AS total
         FROM orders o
        WHERE o.rider_id IS NOT NULL AND o.status = 'delivered' AND o.rider_delivery_charge > 0 AND o.deleted_at IS NULL
          AND ${win('o.delivered_at')} AND ${city('o.city_id')}
        GROUP BY o.rider_id`,
      P
    );
    const enough = pay.rows.filter((x: any) => num(x.n) >= 10);
    for (const x of enough) {
      const peer = median(enough.filter((y: any) => y.rider_id !== x.rider_id).map((y: any) => num(y.avg_pay)));
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

  if (days < 7) dataGaps.push(`The period is only ${days} day(s). Patterns need time to show — treat every figure here as a first look, not a conclusion.`);
  if ((totals.orders_delivered || 0) < 20) dataGaps.push(`Only ${totals.orders_delivered || 0} order(s) were delivered in this period — too few for comparisons between people to mean much.`);

  // Stable ids: strongest first, then by money.
  const order: Record<Strength, number> = { strong: 0, moderate: 1, weak: 2 };
  pending.sort((a, b) => order[a.strength] - order[b.strength] || b.amount - a.amount);
  const signals: Signal[] = pending.slice(0, 80).map((s, i) => ({ ...s, id: `S${i + 1}` }));
  if (pending.length > 80) dataGaps.push(`${pending.length - 80} weaker signal(s) were left out to keep the audit readable.`);

  let cityName: string | null = null;
  if (period.cityId) {
    const c = await safe('city', () => query(`SELECT name FROM service_cities WHERE id = $1`, [period.cityId]));
    cityName = c?.rows[0]?.name ?? null;
  }

  return {
    pack: {
      period: { from: period.from, to: period.to, days, cityId: period.cityId, cityName },
      generatedAt: new Date().toISOString(),
      totals,
      subjects: Array.from(subjects.values()),
      signals,
      systemFindings,
      dataGaps,
      baselines,
    },
    tokens,
  };
}
