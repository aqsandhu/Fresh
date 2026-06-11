import { resolveGoogleMapsApiKey, setRuntimeGoogleMapsApiKey } from './googleMaps'
import { getApiBaseUrl } from './apiBase'

let googleMapsLoader: Promise<any> | null = null

const API_BASE = getApiBaseUrl()

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
  if (!key || typeof window === 'undefined') {
    return Promise.resolve(null)
  }

  const w = window as Window & { google?: { maps?: any } }
  if (w.google?.maps) {
    return Promise.resolve(w.google.maps)
  }

  if (!googleMapsLoader) {
    googleMapsLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`
      script.async = true
      script.defer = true
      script.onload = () => resolve(w.google?.maps ?? null)
      script.onerror = () => reject(new Error('Failed to load Google Maps'))
      document.head.appendChild(script)
    })
  }

  return googleMapsLoader
}
