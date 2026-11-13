// Period helpers for the AI Audit page. Dates are Pakistan business days
// (YYYY-MM-DD); weeks run Monday–Sunday; a period never ends after today.

export type AuditPreset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'month' | 'dates';

/** Pakistan calendar date (the business day), as YYYY-MM-DD. */
export const pkDate = (d = new Date()): string => new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);

export const addDays = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function periodFor(preset: AuditPreset, today: string, month: string, from: string, to: string): { from: string; to: string } {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -dow);
  const firstOf = (ym: string) => `${ym}-01`;
  const lastOf = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  };
  const cap = (d: string) => (d > today ? today : d);
  switch (preset) {
    case 'this_week': return { from: monday, to: today };
    case 'last_week': return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case 'this_month': return { from: firstOf(today.slice(0, 7)), to: today };
    case 'last_month': {
      const prev = addDays(firstOf(today.slice(0, 7)), -1).slice(0, 7);
      return { from: firstOf(prev), to: lastOf(prev) };
    }
    case 'month': return { from: firstOf(month), to: cap(lastOf(month)) };
    default: return { from, to: cap(to) };
  }
}

/** True when the server refused an action because a second admin must co-sign it. */
export const needsSecondAdmin = (message: unknown): boolean => /second admin/i.test(String(message || ''));
