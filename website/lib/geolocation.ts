/** Delivery pins should only auto-lock when the browser reports this accuracy or better. */
export const REQUIRED_LOCATION_ACCURACY_M = 20
/** Kept for existing UI messages; same cap as the required delivery accuracy. */
export const FALLBACK_LOCATION_ACCURACY_M = REQUIRED_LOCATION_ACCURACY_M
/** Restart the GPS watch this often so a plateaued fix is re-acquired fresh. */
const WATCH_RESTART_MS = 20000
/** Wait this long after a transient GPS error before re-opening the watch. */
const ERROR_RETRY_DELAY_MS = 1000

export interface AccuratePosition {
  lat: number
  lng: number
  accuracy: number
}

export type GpsSearchResult =
  | { status: 'locked'; position: AccuratePosition }
  | { status: 'cancelled'; best: AccuratePosition | null }
  | { status: 'denied' }
  | { status: 'unsupported' }

interface AccuratePositionOptions {
  /** Abort to stop the search; resolves with the best fix seen so far. */
  signal?: AbortSignal
  onProgress?: (best: AccuratePosition) => void
}

/**
 * Keep the GPS watch open until the browser reports a delivery-grade fix
 * (±REQUIRED_LOCATION_ACCURACY_M or better). The search never gives up on its
 * own — the watch is restarted periodically to force a fresh acquisition — so
 * it only ends when the fix locks, the caller aborts, or permission is denied.
 * Positions worse than the required accuracy are surfaced only as progress,
 * never as a locked location.
 */
export function getAccuratePosition(
  options: AccuratePositionOptions = {}
): Promise<GpsSearchResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ status: 'unsupported' })
  }

  const { signal, onProgress } = options

  return new Promise((resolve) => {
    let best: AccuratePosition | null = null
    let watchId: number | null = null
    let restartTimer: number | null = null
    let finished = false

    const stopWatch = () => {
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId)
        watchId = null
      }
      if (restartTimer != null) {
        clearTimeout(restartTimer)
        restartTimer = null
      }
    }

    const finish = (result: GpsSearchResult) => {
      if (finished) return
      finished = true
      stopWatch()
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }

    const onAbort = () => finish({ status: 'cancelled', best })

    const scheduleRestart = (delayMs: number) => {
      if (finished) return
      if (restartTimer != null) clearTimeout(restartTimer)
      restartTimer = window.setTimeout(() => {
        restartTimer = null
        stopWatch()
        startWatch()
      }, delayMs)
    }

    const startWatch = () => {
      if (finished) return
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const accuracy = pos.coords.accuracy ?? 9999
          if (!best || accuracy < best.accuracy) {
            best = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy,
            }
            onProgress?.(best)
          }
          if (accuracy <= REQUIRED_LOCATION_ACCURACY_M) {
            finish({
              status: 'locked',
              position: {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy,
              },
            })
          }
        },
        (err) => {
          // Permission refusals cannot be retried away; everything else
          // (no signal yet, per-attempt timeout) just re-opens the watch.
          if (err.code === err.PERMISSION_DENIED) {
            finish({ status: 'denied' })
          } else {
            scheduleRestart(ERROR_RETRY_DELAY_MS)
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: WATCH_RESTART_MS }
      )
      // A plateaued watch keeps repeating the same mediocre fix; re-opening it
      // forces the browser to acquire fresh instead of serving cached readings.
      scheduleRestart(WATCH_RESTART_MS)
    }

    if (signal?.aborted) {
      finish({ status: 'cancelled', best: null })
      return
    }
    signal?.addEventListener('abort', onAbort)
    startWatch()
  })
}
