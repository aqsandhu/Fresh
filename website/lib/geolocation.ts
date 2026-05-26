/** Tighter target — we try this first. */
export const REQUIRED_LOCATION_ACCURACY_M = 5
/** Looser fallback — accepted after the tighter target fails. */
export const FALLBACK_LOCATION_ACCURACY_M = 8

export interface AccuratePosition {
  lat: number
  lng: number
  accuracy: number
}

export type LocationTier = 'tight' | 'fallback' | 'approximate'

export interface AccuratePositionWithTier extends AccuratePosition {
  tier: LocationTier
}

interface WatchOptions {
  /** Accept the best fix we saw when the timer fires, even if accuracy is loose. */
  acceptBestOnTimeout?: boolean
}

/**
 * Watch GPS until accuracy is ≤ maxAccuracyM or timeout.
 * When `acceptBestOnTimeout` is true we still return the best fix we saw
 * instead of null — the caller can warn the user to drag the marker.
 */
export function watchForAccuratePosition(
  maxAccuracyM = REQUIRED_LOCATION_ACCURACY_M,
  timeoutMs = 12000,
  options: WatchOptions = {}
): Promise<(AccuratePosition & { tier: LocationTier }) | null> {
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

    const finish = (result: GeolocationPosition | null, timedOut = false) => {
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
          tier: maxAccuracyM <= REQUIRED_LOCATION_ACCURACY_M ? 'tight' : 'fallback',
        })
        return
      }

      if (options.acceptBestOnTimeout && timedOut) {
        resolve({
          lat: pick.coords.latitude,
          lng: pick.coords.longitude,
          accuracy,
          tier: 'approximate',
        })
        return
      }

      resolve(null)
    }

    const timer = setTimeout(() => finish(best, true), timeoutMs)

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
      (err) => {
        void err
        finish(null)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs + 2000 }
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
): Promise<AccuratePositionWithTier | null> {
  const tight = await watchForAccuratePosition(tightAccuracyM, tightTimeoutMs, {
    acceptBestOnTimeout: false,
  })
  if (tight) return { ...tight, tier: 'tight' }

  const fallback = await watchForAccuratePosition(fallbackAccuracyM, fallbackTimeoutMs, {
    acceptBestOnTimeout: false,
  })
  if (fallback) return { ...fallback, tier: 'fallback' }

  // Last resort: return whatever the device gave us so the map + marker still
  // appear and the user can drag to the correct spot.
  const approximate = await watchForAccuratePosition(
    Number.MAX_SAFE_INTEGER,
    6000,
    { acceptBestOnTimeout: true }
  )
  if (approximate) return { ...approximate, tier: 'approximate' }

  return null
}
