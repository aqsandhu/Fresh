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

export type GpsProgressCallback = (update: {
  message: string
  lat?: number
  lng?: number
  accuracy?: number
}) => void

const TIGHT_PHASE_MS = 8000
const TOTAL_PHASE_MS = 14000

/**
 * Single GPS watch: try ±5m for 8s, then accept ±8m, then best available by 14s.
 * Calls `onProgress` as the fix improves so the map marker can move live — much
 * smoother than three sequential blocking attempts + toast spam.
 */
export async function getAccuratePosition(
  onProgress?: GpsProgressCallback
): Promise<AccuratePositionWithTier | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let best: GeolocationPosition | null = null
    let finished = false
    let watchId: number | null = null
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null
    let totalTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      if (fallbackTimer) clearTimeout(fallbackTimer)
      if (totalTimer) clearTimeout(totalTimer)
    }

    const finishWithBest = (tier: LocationTier) => {
      if (finished || !best) return
      finished = true
      cleanup()
      resolve({
        lat: best.coords.latitude,
        lng: best.coords.longitude,
        accuracy: best.coords.accuracy ?? 9999,
        tier,
      })
    }

    const fail = () => {
      if (finished) return
      finished = true
      cleanup()
      resolve(null)
    }

    onProgress?.({
      message: `Finding location (±${REQUIRED_LOCATION_ACCURACY_M}m)…`,
    })

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? 9999
        if (!best || acc < (best.coords.accuracy ?? 9999)) {
          best = pos
        }

        onProgress?.({
          message: `GPS ±${Math.round(acc)}m — ${acc <= REQUIRED_LOCATION_ACCURACY_M ? 'locked' : 'refining…'}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: acc,
        })

        if (acc <= REQUIRED_LOCATION_ACCURACY_M) {
          finishWithBest('tight')
        }
      },
      (err) => {
        const msg =
          err.code === 1
            ? 'Allow location permission in browser settings'
            : 'GPS signal weak — drag the pin on the map'
        onProgress?.({ message: msg })
        if (!best) fail()
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: TOTAL_PHASE_MS + 5000 }
    )

    fallbackTimer = setTimeout(() => {
      if (finished || !best) return
      const acc = best.coords.accuracy ?? 9999
      if (acc <= FALLBACK_LOCATION_ACCURACY_M) {
        finishWithBest('fallback')
      } else {
        onProgress?.({
          message: `Using ±${Math.round(acc)}m — drag pin to fine-tune`,
          lat: best.coords.latitude,
          lng: best.coords.longitude,
          accuracy: acc,
        })
      }
    }, TIGHT_PHASE_MS)

    totalTimer = setTimeout(() => {
      if (finished) return
      if (!best) {
        fail()
        return
      }
      const acc = best.coords.accuracy ?? 9999
      finishWithBest(acc <= FALLBACK_LOCATION_ACCURACY_M ? 'fallback' : 'approximate')
    }, TOTAL_PHASE_MS)
  })
}
