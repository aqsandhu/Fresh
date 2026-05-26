/** GPS must be better than this (meters) before we accept a pinned location. */
export const REQUIRED_LOCATION_ACCURACY_M = 5

export interface AccuratePosition {
  lat: number
  lng: number
  accuracy: number
}

/**
 * Watch GPS until accuracy is ≤ maxAccuracyM or timeout.
 * Returns null if the best fix is still worse than the threshold.
 */
export function getAccuratePosition(
  maxAccuracyM = REQUIRED_LOCATION_ACCURACY_M,
  timeoutMs = 15000
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
