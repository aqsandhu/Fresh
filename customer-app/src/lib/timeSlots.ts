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

export function getSlotAvailability(
  slot: TimeSlotLike,
  day: 'today' | 'tomorrow',
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

  if (elapsedRatio > 0.4) {
    return { unavailable: true, reason: 'mostly_passed' };
  }

  return { unavailable: false };
}

export function slotStatusLabel(
  slot: TimeSlotLike & { available?: boolean; available_slots?: number },
  day: 'today' | 'tomorrow'
): string | null {
  if (slot.available === false || (slot.available_slots !== undefined && slot.available_slots <= 0)) {
    return 'FULL';
  }
  const avail = getSlotAvailability(slot, day);
  if (avail.unavailable) {
    return avail.reason === 'mostly_passed' ? 'Passed' : 'Unavailable';
  }
  return null;
}
