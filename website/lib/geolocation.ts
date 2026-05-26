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

function watchForAccuratePosition(
  maxAccuracyM: number,
  timeoutMs: number
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

/** One quick read — used to return an approximate pin when strict watches fail. */
function getCurrentPositionOnce(timeoutMs: number): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    )
  })
}

/**
 * Try ±5m (12s), then ±8m (8s). If both fail, return the best approximate fix
 * so the user can drag/adjust on the map — no live map updates during watch.
 */
export async function getAccuratePosition(): Promise<AccuratePositionWithTier | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null
  }

  const tight = await watchForAccuratePosition(REQUIRED_LOCATION_ACCURACY_M, 12000)
  if (tight) return { ...tight, tier: 'tight' }

  const fallback = await watchForAccuratePosition(FALLBACK_LOCATION_ACCURACY_M, 8000)
  if (fallback) return { ...fallback, tier: 'fallback' }

  const approx = await getCurrentPositionOnce(6000)
  if (!approx) return null

  return {
    lat: approx.coords.latitude,
    lng: approx.coords.longitude,
    accuracy: approx.coords.accuracy ?? 9999,
    tier: 'approximate',
  }
}
