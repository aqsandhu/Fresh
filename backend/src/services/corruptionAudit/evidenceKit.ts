// Shared pieces of the corruption-audit evidence builder (W21 split of
// evidence.ts): number / SQL-window helpers and the context every section of
// the audit works with.
import { BUSINESS_TZ } from '../../utils/businessTime';
import type { Signal, SignalCategory, Strength, Subject, SystemFinding } from './types';

export const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
export const r0 = (n: number): number => Math.round(n);
export const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const pct = (part: number, whole: number): number => (whole > 0 ? r2((part / whole) * 100) : 0);
export const rs = (n: number): string => `Rs ${r0(n).toLocaleString('en-PK')}`;
export const median = (xs: number[]): number | null => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
/** Admin-typed text (product names, expense types) is DATA for the AI: strip it to plain words. */
export const cleanLabel = (v: unknown, max = 30): string =>
  String(v ?? '').replace(/[^\p{L}\p{N} .&/-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || 'item';

export const win = (col: string): string =>
  `${col} >= ($1::date::timestamp AT TIME ZONE '${BUSINESS_TZ}') AND ${col} < (($2::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}')`;
export const upTo = (col: string): string => `${col} < (($2::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}')`;
export const day = (col: string): string => `to_char(${col} AT TIME ZONE '${BUSINESS_TZ}', 'YYYY-MM-DD')`;
export const city = (col: string): string => `($3::uuid IS NULL OR ${col} = $3)`;
export const priceOf = (quality: string, p: any): number => {
  const preferred = quality === 'B' ? num(p.price_b) : quality === 'C' ? num(p.price_c) : num(p.price);
  return preferred > 0 ? preferred : num(p.price);
};

export interface AuditPeriod { from: string; to: string; cityId: string | null }

export interface TokenInfo { alias: string; name: string }

/** One possible signal; dropped when strength is null or the subject is unknown. */
export interface SignalInput {
  code: string; title: string; category: SignalCategory; subject: string; strength: Strength | null;
  amount: number; n: number; facts: Signal['facts']; examples: string[]; innocent: string[];
}

/** What every audit section reads and adds to (built once by buildEvidence). */
export interface AuditCtx {
  period: AuditPeriod;
  /** [from, to, cityId] — the $1 / $2 / $3 of win() / upTo() / city(). */
  P: unknown[];
  days: number;
  dataGaps: string[];
  systemFindings: SystemFinding[];
  totals: Record<string, number>;
  baselines: Record<string, number | null>;
  subjects: Map<string, Subject>;
  /** Runs one read; a failure is written to dataGaps and that part is not judged. */
  safe: <T>(label: string, fn: () => Promise<T>) => Promise<T | null>;
  tok: (type: string, id: string | null | undefined) => string;
  cust: (userId: string | null | undefined, name?: string | null) => string;
  signal: (s: SignalInput) => void;
  top2Share: (byKey: Map<string, number>) => number;
  isAdmin: (id: string | null) => id is string;
  isOwner: (id: string | null) => boolean;
  act: (key: string, field: string, value: number) => void;
  staffNote: (userId: string | null) => boolean;
}
