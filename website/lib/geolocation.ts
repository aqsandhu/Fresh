/** Delivery pins should only auto-lock when the browser reports this accuracy or better. */
export const REQUIRED_LOCATION_ACCURACY_M = 20
/** Kept for existing UI messages; same cap as the required delivery accuracy. */
export const FALLBACK_LOCATION_ACCURACY_M = REQUIRED_LOCATION_ACCURACY_M
export const LOCATION_SEARCH_TIMEOUT_MS = 60000

export interface AccuratePosition {
  lat: number
  lng: number
  accuracy: number
}

export type LocationTier = 'tight' | 'fallback' | 'approximate'

export interface AccuratePositionWithTier extends AccuratePosition {
  tier: LocationTier
}

interface AccuratePositionOptions {
  timeoutMs?: number
  onProgress?: (best: AccuratePosition) => void
}

function watchForAccuratePosition(
  maxAccuracyM: number,
  timeoutMs: number,
  onProgress?: (best: AccuratePosition) => void
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
          onProgress?.({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: acc,
          })
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
 * Keep the GPS watch open until the browser reports a delivery-grade fix.
 * Positions worse than the required accuracy are surfaced only as progress,
 * never as a locked location.
 */
export async function getAccuratePosition(
  options: AccuratePositionOptions = {}
): Promise<AccuratePositionWithTier | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null
  }

  const locked = await watchForAccuratePosition(
    REQUIRED_LOCATION_ACCURACY_M,
    options.timeoutMs ?? LOCATION_SEARCH_TIMEOUT_MS,
    options.onProgress
  )
  if (!locked) return null

  return { ...locked, tier: 'tight' }
}
