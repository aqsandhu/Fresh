/**
 * Today's date in Pakistan (YYYY-MM-DD), whatever time zone the admin's
 * computer is set to. Pakistan is UTC+5 all year (no daylight saving).
 *
 * The pages used the browser's own date: right on a computer set to Pakistan
 * time, but a day behind from 00:00 to 05:00 PKT on one set to UTC (G24 — the
 * CI test machine runs in UTC and caught it).
 */
export function pktToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
