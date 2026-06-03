'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface LeafletDraggableMapPickerProps {
  lat: number
  lng: number
  accuracy?: number | null
  height?: number | string
  zoom?: number
  onChange: (lat: number, lng: number) => void
}

/** Red pin icon — visually close to the app MapView default marker. */
function createRedPinIcon(L: any) {
  return L.divIcon({
    className: 'checkout-map-pin',
    html: `<div style="width:26px;height:26px;background:#EA4335;border:2.5px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35);margin-left:2px;"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  })
}

/**
 * Interactive OpenStreetMap picker — no API key required.
 * Drag pin, tap map, GPS accuracy circle (matches customer-app CheckoutMapPicker).
 */
export default function LeafletDraggableMapPicker({
  lat,
  lng,
  accuracy,
  height = 280,
  zoom = 17,
  onChange,
}: LeafletDraggableMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const lastReportedRef = useRef<{ lat: number; lng: number } | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    const reportChange = (nextLat: number, nextLng: number) => {
      lastReportedRef.current = { lat: nextLat, lng: nextLng }
      onChangeRef.current(nextLat, nextLng)
    }

    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (cancelled || !containerRef.current) return

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([lat, lng], zoom)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const marker = L.marker([lat, lng], {
        draggable: true,
        icon: createRedPinIcon(L),
      }).addTo(map)

      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        reportChange(pos.lat, pos.lng)
      })

      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng)
        reportChange(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
      markerRef.current = marker
      setReady(true)

      const invalidate = () => {
        if (map && !cancelled) {
          map.invalidateSize()
          const pos = marker.getLatLng()
          map.setView(pos, map.getZoom(), { animate: false })
        }
      }
      setTimeout(invalidate, 100)
      setTimeout(invalidate, 350)

      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => invalidate())
        resizeObserver.observe(containerRef.current)
      }
    }

    void init()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      circleRef.current?.remove()
      circleRef.current = null
      markerRef.current?.remove()
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
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

    marker.setLatLng([lat, lng])
    map.panTo([lat, lng])
  }, [lat, lng])

  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return

    const applyCircle = async () => {
      const L = (await import('leaflet')).default
      const center = marker.getLatLng()

      if (accuracy != null && accuracy > 0) {
        const radius = Math.min(accuracy, 80)
        if (!circleRef.current) {
          circleRef.current = L.circle(center, {
            radius,
            color: '#10B981',
            weight: 1,
            opacity: 0.85,
            fillColor: '#10B981',
            fillOpacity: 0.15,
          }).addTo(map)
        } else {
          circleRef.current.setLatLng(center)
          circleRef.current.setRadius(radius)
          if (!map.hasLayer(circleRef.current)) {
            circleRef.current.addTo(map)
          }
        }
      } else if (circleRef.current) {
        circleRef.current.remove()
        circleRef.current = null
      }
    }

    void applyCircle()
  }, [accuracy, lat, lng])

  const boxHeight = typeof height === 'number' ? `${height}px` : height

  return (
    <div className="relative w-full bg-gray-200" style={{ height: boxHeight }}>
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-200">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
