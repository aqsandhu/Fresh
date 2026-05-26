'use client'

import { useEffect, useRef } from 'react'
import { loadGoogleMapsJs } from '@/lib/loadGoogleMaps'

interface LeafletGlobals {
  L?: any
}

let leafletLoader: Promise<any> | null = null

async function loadLeaflet() {
  if (typeof window === 'undefined') return null
  const win = window as Window & LeafletGlobals
  if (win.L) return win.L

  if (!leafletLoader) {
    leafletLoader = (async () => {
      const mod = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      return mod.default || mod
    })()
  }
  return leafletLoader
}

function createLeafletRedPin(L: any) {
  return L.divIcon({
    className: 'freshbazar-map-pin',
    html: `<div style="width:28px;height:28px;margin-left:-14px;margin-top:-28px;">
      <svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="#EA4335" stroke="#B31412" stroke-width="1"
          d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"/>
        <circle cx="12" cy="12" r="5" fill="#fff"/>
      </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })
}

interface DraggableMapPickerProps {
  lat: number
  lng: number
  accuracy?: number | null
  height?: number | string
  zoom?: number
  onChange: (lat: number, lng: number) => void
}

/**
 * Interactive map with a draggable red pin. Uses Google Maps JS when an API key
 * is configured; otherwise OpenStreetMap tiles via Leaflet.
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
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    const reportChange = (nextLat: number, nextLng: number) => {
      lastReportedRef.current = { lat: nextLat, lng: nextLng }
      onChangeRef.current(nextLat, nextLng)
    }

    const initLeaflet = async () => {
      const L = await loadLeaflet()
      if (cancelled || !L || !containerRef.current) return

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([lat, lng], zoom)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      const marker = L.marker([lat, lng], {
        draggable: true,
        icon: createLeafletRedPin(L),
      }).addTo(map)

      marker.on('dragend', () => {
        const ll = marker.getLatLng()
        reportChange(ll.lat, ll.lng)
      })

      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng)
        reportChange(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
      markerRef.current = marker

      const invalidate = () => {
        if (map && !cancelled) map.invalidateSize()
      }
      setTimeout(invalidate, 100)
      setTimeout(invalidate, 350)

      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => invalidate())
        resizeObserver.observe(containerRef.current)
      }
    }

    const initGoogle = async () => {
      const maps = await loadGoogleMapsJs()
      if (cancelled || !maps || !containerRef.current) {
        await initLeaflet()
        return
      }

      const center = { lat, lng }
      const map = new maps.Map(containerRef.current, {
        center,
        zoom,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      })

      const marker = new maps.Marker({
        position: center,
        map,
        draggable: true,
      })

      marker.addListener('dragend', () => {
        const pos = marker.getPosition()
        if (pos) reportChange(pos.lat(), pos.lng())
      })

      map.addListener('click', (e: any) => {
        const pos = e.latLng
        if (!pos) return
        marker.setPosition(pos)
        reportChange(pos.lat(), pos.lng())
      })

      mapRef.current = map
      markerRef.current = marker
    }

    ;(async () => {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
      if (key) {
        try {
          await initGoogle()
        } catch {
          await initLeaflet()
        }
      } else {
        await initLeaflet()
      }
    })()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      const map = mapRef.current
      if (map?.remove) {
        map.remove()
      } else if (map?.setMap) {
        markerRef.current?.setMap(null)
      }
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const marker = markerRef.current
    const map = mapRef.current
    if (!marker || !map) return

    const last = lastReportedRef.current
    if (last && Math.abs(last.lat - lat) < 1e-6 && Math.abs(last.lng - lng) < 1e-6) {
      return
    }

    if (marker.setLatLng) {
      marker.setLatLng([lat, lng])
      map.setView([lat, lng], map.getZoom() || zoom, { animate: true })
    } else if (marker.setPosition) {
      marker.setPosition({ lat, lng })
      map.panTo({ lat, lng })
    }
  }, [lat, lng, zoom])

  useEffect(() => {
    ;(async () => {
      const L = await loadLeaflet()
      const map = mapRef.current
      if (!L || !map?.addLayer) return

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
      className="w-full bg-gray-100"
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}
