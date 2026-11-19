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

import { asCaughtError } from '../../utils/caughtError';
import { query } from '../../config/database';
import logger from '../../utils/logger';
import type { EvidencePack, Signal, Strength, Subject, SubjectType, SystemFinding } from './types';
import { type AuditCtx, type AuditPeriod, type SignalInput, type TokenInfo, r0, r2, cleanLabel } from './evidenceKit';
import { periodTotals, weightEdits, wasteAndDowngrades, refunds, packedOrdersCancelled, coupons } from './signals/orderSignals';
import { expensesAndPayroll, staffPurchases, priceDips, cashHolding } from './signals/moneySignals';
import { secondAdminApprovals, riders, collectionPoints, unownedFindings } from './signals/peopleSignals';

// Kept here for the callers that import them from this file.
export { cleanLabel } from './evidenceKit';
export type { AuditPeriod } from './evidenceKit';

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
    } catch (errCaught: unknown) {
      const err = asCaughtError(errCaught);
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
  const signal = (s: SignalInput): void => {
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

  // ── The sections, in order (signals/*.ts) ────────────────────────────────
  const ctx: AuditCtx = {
    period, P, days, dataGaps, systemFindings, totals, baselines, subjects,
    safe, tok, cust, signal, top2Share, isAdmin, isOwner, act, staffNote,
  };
  await periodTotals(ctx);
  await weightEdits(ctx);
  await wasteAndDowngrades(ctx);
  await refunds(ctx);
  await packedOrdersCancelled(ctx);
  await coupons(ctx);
  await expensesAndPayroll(ctx);
  await staffPurchases(ctx);
  await priceDips(ctx);
  await cashHolding(ctx);
  await secondAdminApprovals(ctx);
  await riders(ctx);
  await collectionPoints(ctx);
  await unownedFindings(ctx);

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
