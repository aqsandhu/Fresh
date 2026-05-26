/** Tighter target — we try this first. */
export const REQUIRED_LOCATION_ACCURACY_M = 5
/** Looser fallback — accepted after the tighter target fails. */
export const FALLBACK_LOCATION_ACCURACY_M = 8

export interface AccuratePosition {
  lat: number
  lng: number
  accuracy: number
}

/**
 * Watch GPS until accuracy is ≤ maxAccuracyM or timeout. Returns null if the
 * best fix is still worse than the threshold.
 */
export function watchForAccuratePosition(
  maxAccuracyM = REQUIRED_LOCATION_ACCURACY_M,
  timeoutMs = 12000
): Promise<AccuratePosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let best: GeolocationPosition | null = null
    let watchId: number | null = null
    let finished = false

    const cleanup = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      clearTimeout(timer)
    }

    const finish = (result: GeolocationPosition | null) => {
      if (finished) return
      finished = true
      cleanup()

      const pick = result ?? best
      if (!pick) {
        resolve(null)
        return
      }

      const accuracy = pick.coords.accuracy ?? 9999
      if (accuracy <= maxAccuracyM) {
        resolve({
          lat: pick.coords.latitude,
          lng: pick.coords.longitude,
          accuracy,
        })
      } else {
        resolve(null)
      }
    }

    const timer = setTimeout(() => finish(best), timeoutMs)

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? 9999
        if (!best || acc < (best.coords.accuracy ?? 9999)) {
          best = pos
        }
        if (acc <= maxAccuracyM) {
          finish(pos)
        }
      },
      () => finish(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    )
  })
}

/**
 * Try to lock GPS at the tighter accuracy threshold first; if that fails
 * within `tightTimeoutMs`, fall back to a looser threshold. Returns the
 * best fix along with which tier produced it (so the UI can warn the user
 * when we relaxed the requirement).
 */
export async function getAccuratePosition(
  tightAccuracyM: number = REQUIRED_LOCATION_ACCURACY_M,
  fallbackAccuracyM: number = FALLBACK_LOCATION_ACCURACY_M,
  tightTimeoutMs: number = 12000,
  fallbackTimeoutMs: number = 8000
): Promise<(AccuratePosition & { tier: 'tight' | 'fallback' }) | null> {
  const tight = await watchForAccuratePosition(tightAccuracyM, tightTimeoutMs)
  if (tight) return { ...tight, tier: 'tight' }
  const fallback = await watchForAccuratePosition(fallbackAccuracyM, fallbackTimeoutMs)
  if (fallback) return { ...fallback, tier: 'fallback' }
  return null
}
