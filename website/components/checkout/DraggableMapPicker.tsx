'use client'

import { useEffect, useRef } from 'react'

interface LeafletGlobals {
  L?: any
}

let leafletLoader: Promise<any> | null = null

/**
 * Load Leaflet client-side (it touches `window` so we can't import it during
 * SSR). Memoised so multiple maps on the page share the same module.
 */
async function loadLeaflet() {
  if (typeof window === 'undefined') return null
  const win = window as Window & LeafletGlobals
  if (win.L) return win.L

  if (!leafletLoader) {
    leafletLoader = (async () => {
      // Side-effect import: defines window.L too.
      const mod = await import('leaflet')
      // Inject Leaflet CSS once so markers render correctly.
      if (!document.querySelector('link[data-leaflet-css="true"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        link.integrity =
          'sha512-xwE/Az9zrjBIphAcBb3F6JVqxf46+CDLwfLMHloNu6KEQCAWi6HcDUbeOfBIptF7tcCzusKFjFw2yuvEpDL9wQ=='
        link.crossOrigin = ''
        link.setAttribute('data-leaflet-css', 'true')
        document.head.appendChild(link)
      }
      return mod.default || mod
    })()
  }
  return leafletLoader
}

interface DraggableMapPickerProps {
  lat: number
  lng: number
  /** Optional GPS accuracy in meters; shown as a translucent circle. */
  accuracy?: number | null
  height?: number | string
  zoom?: number
  /** Fires whenever the marker is dragged or the map is tapped. */
  onChange: (lat: number, lng: number) => void
}

/**
 * Tappable / draggable map. Used in the checkout address form so customers
 * can fine-tune the GPS-detected location instead of being stuck with whatever
 * the browser returned. Falls back gracefully if Leaflet fails to load — the
 * surrounding form still has a manual lat/lng input.
 */
export default function DraggableMapPicker({
  lat,
  lng,
  accuracy,
  height = 280,
  zoom = 17,
  onChange,
}: DraggableMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const lastReportedRef = useRef<{ lat: number; lng: number } | null>(null)

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false
    let map: any

    ;(async () => {
      const L = await loadLeaflet()
      if (cancelled || !L || !containerRef.current) return

      map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([lat, lng], zoom)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      const marker = L.marker([lat, lng], { draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const ll = marker.getLatLng()
        lastReportedRef.current = { lat: ll.lat, lng: ll.lng }
        onChange(ll.lat, ll.lng)
      })
      markerRef.current = marker

      // Tap-to-move: useful on touch when dragging the marker is finicky.
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng)
        lastReportedRef.current = { lat: e.latlng.lat, lng: e.latlng.lng }
        onChange(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
      // Tile sizing may be wrong when the map is mounted inside a hidden /
      // animated container — force a recalc once the layout settles.
      setTimeout(() => map.invalidateSize(), 150)
    })()

    return () => {
      cancelled = true
      if (map) {
        map.remove()
      }
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
    // We intentionally don't depend on lat/lng/zoom here — re-init would
    // tear down a marker the user is currently dragging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React to external lat/lng changes (e.g. user typed manually or hit "Get
  // GPS"). We skip the update if the new value is what we just reported via
  // dragend/click — otherwise the marker would jitter.
  useEffect(() => {
    const marker = markerRef.current
    const map = mapRef.current
    if (!marker || !map) return

    const last = lastReportedRef.current
    if (last && Math.abs(last.lat - lat) < 1e-6 && Math.abs(last.lng - lng) < 1e-6) {
      return
    }

    marker.setLatLng([lat, lng])
    map.setView([lat, lng], map.getZoom() || zoom, { animate: true })
  }, [lat, lng, zoom])

  // Render / update accuracy ring.
  useEffect(() => {
    ;(async () => {
      const L = await loadLeaflet()
      const map = mapRef.current
      if (!L || !map) return

      if (accuracy != null && accuracy > 0) {
        if (!circleRef.current) {
          circleRef.current = L.circle([lat, lng], {
            radius: accuracy,
            color: '#10B981',
            fillColor: '#10B981',
            fillOpacity: 0.15,
            weight: 1,
          }).addTo(map)
        } else {
          circleRef.current.setLatLng([lat, lng])
          circleRef.current.setRadius(accuracy)
        }
      } else if (circleRef.current) {
        circleRef.current.remove()
        circleRef.current = null
      }
    })()
  }, [accuracy, lat, lng])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}
