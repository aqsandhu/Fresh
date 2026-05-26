/**
 * Delivery slot availability helpers. Slots that have already ended, or are
 * more than 40% elapsed for today, are treated as unavailable in the UI.
 */

export interface TimeSlotLike {
  id: string
  start_time: string
  end_time: string
}

function parseTimeOnDate(time: string, date: Date): Date {
  const [h, m, s] = time.split(':').map((v) => parseInt(v, 10) || 0)
  const d = new Date(date)
  d.setHours(h, m, s || 0, 0)
  return d
}

export function getSlotAvailability(
  slot: TimeSlotLike,
  day: 'today' | 'tomorrow',
  now: Date = new Date()
): { unavailable: boolean; reason?: 'expired' | 'mostly_passed' } {
  if (day === 'tomorrow') {
    return { unavailable: false }
  }

  const start = parseTimeOnDate(slot.start_time, now)
  const end = parseTimeOnDate(slot.end_time, now)

  if (now >= end) {
    return { unavailable: true, reason: 'expired' }
  }

  if (now <= start) {
    return { unavailable: false }
  }

  const durationMs = Math.max(end.getTime() - start.getTime(), 1)
  const elapsedMs = now.getTime() - start.getTime()
  const elapsedRatio = elapsedMs / durationMs

  if (elapsedRatio > 0.4) {
    return { unavailable: true, reason: 'mostly_passed' }
  }

  return { unavailable: false }
}
