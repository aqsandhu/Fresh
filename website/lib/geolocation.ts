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

export type GpsProgressCallback = (update: { message: string }) => void

const TIGHT_TIMEOUT_MS = 8000
const FALLBACK_TIMEOUT_MS = 6000

function getCurrentPositionOnce(options: PositionOptions): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      options
    )
  })
}

function pickBest(
  a: GeolocationPosition | null,
  b: GeolocationPosition | null
): GeolocationPosition | null {
  if (!a) return b
  if (!b) return a
  const accA = a.coords.accuracy ?? 9999
  const accB = b.coords.accuracy ?? 9999
  return accA <= accB ? a : b
}

function toResult(pos: GeolocationPosition, tier: LocationTier): AccuratePositionWithTier {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? 9999,
    tier,
  }
}

/**
 * Two quick GPS reads (no watchPosition): ±5m first, then ±8m fallback.
 * Status-only progress callbacks — callers should set map coords once at the end
 * so Leaflet is not re-rendered on every GPS tick.
 */
export async function getAccuratePosition(
  onProgress?: GpsProgressCallback
): Promise<AccuratePositionWithTier | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null
  }

  onProgress?.({ message: `Finding location (±${REQUIRED_LOCATION_ACCURACY_M}m)…` })

  const tight = await getCurrentPositionOnce({
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: TIGHT_TIMEOUT_MS,
  })

  if (tight && (tight.coords.accuracy ?? 9999) <= REQUIRED_LOCATION_ACCURACY_M) {
    return toResult(tight, 'tight')
  }

  onProgress?.({ message: `Refining (±${FALLBACK_LOCATION_ACCURACY_M}m)…` })

  const fallback = await getCurrentPositionOnce({
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: FALLBACK_TIMEOUT_MS,
  })

  const best = pickBest(tight, fallback)
  if (!best) return null

  const acc = best.coords.accuracy ?? 9999
  if (acc <= FALLBACK_LOCATION_ACCURACY_M) {
    return toResult(best, 'fallback')
  }
  return toResult(best, 'approximate')
}
