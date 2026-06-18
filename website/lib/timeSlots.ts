/**
 * Delivery slot availability helpers. Slots that have already ended, or whose
 * elapsed fraction (for today) exceeds the admin-set cutoff %, are treated as
 * unavailable in the UI. The cutoff defaults to 60% and is configurable per
 * audience (consumer vs restaurant).
 */

export interface TimeSlotLike {
  id: string
  start_time: string
  end_time: string
}

/** Default % of a today-slot's window allowed to elapse before it locks. */
export const DEFAULT_SLOT_CUTOFF_PERCENT = 60

function parseTimeOnDate(time: string, date: Date): Date {
  const [h, m, s] = time.split(':').map((v) => parseInt(v, 10) || 0)
  const d = new Date(date)
  d.setHours(h, m, s || 0, 0)
  return d
}

export function getSlotAvailability(
  slot: TimeSlotLike,
  day: 'today' | 'tomorrow',
  cutoffPercent: number = DEFAULT_SLOT_CUTOFF_PERCENT,
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
  const cutoffRatio = Math.min(1, Math.max(0, (Number.isFinite(cutoffPercent) ? cutoffPercent : DEFAULT_SLOT_CUTOFF_PERCENT) / 100))

  if (elapsedRatio > cutoffRatio) {
    return { unavailable: true, reason: 'mostly_passed' }
  }

  return { unavailable: false }
}
