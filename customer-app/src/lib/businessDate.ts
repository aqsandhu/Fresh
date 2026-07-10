/**
 * Business-timezone (Pakistan, PKT = UTC+5, no DST) date helpers.
 * Mirrors website/lib/businessDate.ts — keep the two in sync.
 *
 * WHY: slot dates must be computed in PKT, never the device timezone and never
 * UTC. `toISOString()` gave the UTC date — between midnight and 5am PKT that is
 * YESTERDAY, so "today" slots got rejected by the backend ("slot has already
 * passed") and "tomorrow" actually booked today's date. Overseas devices were
 * wrong around their own midnight too.
 */

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * A Date whose LOCAL fields carry PKT wall-clock values, so existing
 * local-time logic (setHours/getHours in getSlotAvailability) reads Pakistan
 * time regardless of the device timezone. Do NOT serialize this Date — it is
 * only for wall-clock comparisons.
 */
export function pktWallClock(): Date {
  const shifted = new Date(Date.now() + PKT_OFFSET_MS);
  return new Date(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
    shifted.getUTCSeconds()
  );
}

/** YYYY-MM-DD for today/tomorrow in PKT. */
export function pktDateString(day: 'today' | 'tomorrow' = 'today'): string {
  const shifted = new Date(Date.now() + PKT_OFFSET_MS);
  if (day === 'tomorrow') shifted.setUTCDate(shifted.getUTCDate() + 1);
  return shifted.toISOString().split('T')[0];
}

/** Human label ("Sat, 11 Jul") for today/tomorrow in PKT. */
export function pktDisplayDate(day: 'today' | 'tomorrow'): string {
  const shifted = new Date(Date.now() + PKT_OFFSET_MS);
  if (day === 'tomorrow') shifted.setUTCDate(shifted.getUTCDate() + 1);
  const weekday = shifted.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const dayNum = shifted.getUTCDate();
  const month = shifted.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${weekday}, ${dayNum} ${month}`;
}
