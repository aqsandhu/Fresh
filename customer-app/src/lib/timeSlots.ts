/** Port of website/lib/timeSlots.ts — slot availability for checkout UI */

export interface TimeSlotLike {
  id: string;
  start_time?: string;
  end_time?: string;
  startTime?: string;
  endTime?: string;
}

function parseTimeOnDate(time: string, date: Date): Date {
  const [h, m, s] = time.split(':').map((v) => parseInt(v, 10) || 0);
  const d = new Date(date);
  d.setHours(h, m, s || 0, 0);
  return d;
}

/** Default % of a today-slot's window allowed to elapse before it locks. */
export const DEFAULT_SLOT_CUTOFF_PERCENT = 60;

export function getSlotAvailability(
  slot: TimeSlotLike,
  day: 'today' | 'tomorrow',
  cutoffPercent: number = DEFAULT_SLOT_CUTOFF_PERCENT,
  now: Date = new Date()
): { unavailable: boolean; reason?: 'expired' | 'mostly_passed' | 'full' } {
  if (day === 'tomorrow') {
    return { unavailable: false };
  }

  const startTime = slot.start_time || slot.startTime || '';
  const endTime = slot.end_time || slot.endTime || '';
  if (!startTime || !endTime) return { unavailable: false };

  const start = parseTimeOnDate(startTime, now);
  const end = parseTimeOnDate(endTime, now);

  if (now >= end) {
    return { unavailable: true, reason: 'expired' };
  }

  if (now <= start) {
    return { unavailable: false };
  }

  const durationMs = Math.max(end.getTime() - start.getTime(), 1);
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedRatio = elapsedMs / durationMs;
  const cutoffRatio = Math.min(1, Math.max(0, (Number.isFinite(cutoffPercent) ? cutoffPercent : DEFAULT_SLOT_CUTOFF_PERCENT) / 100));

  if (elapsedRatio > cutoffRatio) {
    return { unavailable: true, reason: 'mostly_passed' };
  }

  return { unavailable: false };
}

export function slotStatusLabel(
  slot: TimeSlotLike & { available?: boolean; available_slots?: number },
  day: 'today' | 'tomorrow',
  cutoffPercent: number = DEFAULT_SLOT_CUTOFF_PERCENT
): string | null {
  if (slot.available === false || (slot.available_slots !== undefined && slot.available_slots <= 0)) {
    return 'FULL';
  }
  const avail = getSlotAvailability(slot, day, cutoffPercent);
  if (avail.unavailable) {
    return avail.reason === 'mostly_passed' ? 'Passed' : 'Unavailable';
  }
  return null;
}
