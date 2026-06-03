import { resolveGoogleMapsApiKey } from './googleMaps'

let googleMapsLoader: Promise<any> | null = null

/** Load Google Maps JavaScript API once (uses same key as customer-app). */
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
