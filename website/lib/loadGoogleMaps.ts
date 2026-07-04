import { resolveGoogleMapsApiKey, setRuntimeGoogleMapsApiKey } from './googleMaps'
import { getApiBaseUrl } from './apiBase'

let googleMapsLoader: Promise<any> | null = null

const API_BASE = getApiBaseUrl()
const GOOGLE_MAPS_CALLBACK = '__freshBazarGoogleMapsReady'
const GOOGLE_MAPS_LOAD_TIMEOUT_MS = 12000

// Google reports key problems (invalid key, referrer blocked, Maps JavaScript
// API not enabled, billing off) AFTER the script loads, by calling the global
// gm_authFailure hook and blanking the map. Track it so map components can
// fall back to the keyless embed instead of showing Google's error tile.
let mapsAuthFailed = false
const authFailureListeners = new Set<() => void>()

function installAuthFailureHook(): void {
  if (typeof window === 'undefined') return
  const w = window as Window & {
    gm_authFailure?: () => void
    __freshBazarGmAuthHooked?: boolean
  }
  if (w.__freshBazarGmAuthHooked) return
  w.__freshBazarGmAuthHooked = true

  const previous = w.gm_authFailure
  w.gm_authFailure = () => {
    mapsAuthFailed = true
    googleMapsLoader = null
    authFailureListeners.forEach((listener) => {
      try {
        listener()
      } catch {
        /* listener errors must not break the auth hook */
      }
    })
    previous?.()
  }
}

export function hasGoogleMapsAuthFailed(): boolean {
  return mapsAuthFailed
}

/** Subscribe to Maps key auth failures; returns an unsubscribe function. */
export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authFailureListeners.add(listener)
  return () => {
    authFailureListeners.delete(listener)
  }
}

/** Optional server-side key (Render env) — browser Maps keys are public anyway. */
export async function fetchGoogleMapsApiKey(): Promise<string> {
  const existing = resolveGoogleMapsApiKey()
  if (existing) return existing

  try {
    const res = await fetch(`${API_BASE}/site-settings/maps-key`, { cache: 'no-store' })
    if (!res.ok) return ''
    const json = await res.json()
    const key = String(json?.data?.key || json?.key || '').trim()
    if (key) setRuntimeGoogleMapsApiKey(key)
    return key
  } catch {
    return ''
  }
}

/** Load Google Maps JavaScript API when a key exists (optional smoother maps). */
export function loadGoogleMapsJs(): Promise<any | null> {
  const key = resolveGoogleMapsApiKey()
  if (!key || typeof window === 'undefined' || mapsAuthFailed) {
    return Promise.resolve(null)
  }
  installAuthFailureHook()

  const w = window as Window & {
    google?: { maps?: any }
    [GOOGLE_MAPS_CALLBACK]?: () => void
  }

  const ensureLibraries = async (maps: any): Promise<any | null> => {
    if (!maps) return null
    if (typeof maps.importLibrary === 'function') {
      await maps.importLibrary('maps')
      await maps.importLibrary('marker').catch(() => null)
    }
    return w.google?.maps ?? maps
  }

  if (w.google?.maps) {
    return ensureLibraries(w.google.maps)
  }

  if (!googleMapsLoader) {
    googleMapsLoader = new Promise<any | null>((resolve, reject) => {
      let timeout: number

      const finish = async () => {
        clearTimeout(timeout)
        try {
          const maps = await ensureLibraries(w.google?.maps)
          resolve(maps)
        } catch (error) {
          reject(error)
        } finally {
          delete w[GOOGLE_MAPS_CALLBACK]
        }
      }

      timeout = window.setTimeout(() => {
        delete w[GOOGLE_MAPS_CALLBACK]
        googleMapsLoader = null
        reject(new Error('Google Maps load timed out'))
      }, GOOGLE_MAPS_LOAD_TIMEOUT_MS)

      w[GOOGLE_MAPS_CALLBACK] = () => {
        void finish()
      }

      const script = document.createElement('script')
      const params = new URLSearchParams({
        key,
        v: 'weekly',
        loading: 'async',
        libraries: 'marker',
        callback: GOOGLE_MAPS_CALLBACK,
      })
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
      script.async = true
      script.defer = true
      script.onerror = () => {
        clearTimeout(timeout)
        delete w[GOOGLE_MAPS_CALLBACK]
        googleMapsLoader = null
        reject(new Error('Failed to load Google Maps'))
      }
      document.head.appendChild(script)
    })
  }

  return googleMapsLoader
}
