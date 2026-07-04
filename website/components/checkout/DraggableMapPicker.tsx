'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import {
  fetchGoogleMapsApiKey,
  hasGoogleMapsAuthFailed,
  loadGoogleMapsJs,
  onGoogleMapsAuthFailure,
} from '@/lib/loadGoogleMaps'

const MAP_ZOOM = 18
const MIN_AUTO_ZOOM = 16
const MAX_AUTO_ZOOM = 19

function zoomForAccuracy(accuracy?: number | null): number {
  if (typeof accuracy !== 'number' || accuracy <= 0) return MAP_ZOOM
  if (accuracy <= 8) return MAX_AUTO_ZOOM
  if (accuracy <= 20) return 18
  if (accuracy <= 50) return 17
  return MIN_AUTO_ZOOM
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
 * Checkout map — native Google Maps JavaScript API only (same as the customer
 * app). Marker drag, tap-to-move, pinch/scroll zoom and panning are all handled
 * natively by Google, so there is nothing to reload and no fallback iframe. If
 * the key can't load we show a small placeholder — the lat/lng inputs and
 * "Get My Location" in the parent still work.
 */
export default function DraggableMapPicker({
  lat,
  lng,
  accuracy,
  height = 280,
  zoom = MAP_ZOOM,
  onChange,
}: DraggableMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const lastReportedRef = useRef<{ lat: number; lng: number } | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // A key auth error can arrive after the map renders (gm_authFailure) — show
  // our own placeholder rather than Google's grey error tiles.
  useEffect(() => {
    if (hasGoogleMapsAuthFailed()) {
      setFailed(true)
      return
    }
    return onGoogleMapsAuthFailure(() => setFailed(true))
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    const reportChange = (nextLat: number, nextLng: number) => {
      lastReportedRef.current = { lat: nextLat, lng: nextLng }
      onChangeRef.current(nextLat, nextLng)
    }

    const init = async () => {
      try {
        // Populate the runtime key (served by the backend) before loading the SDK.
        await fetchGoogleMapsApiKey()
        const maps = await loadGoogleMapsJs()
        if (cancelled) return
        if (
          !maps ||
          typeof maps.Map !== 'function' ||
          typeof maps.Marker !== 'function' ||
          !containerRef.current
        ) {
          setFailed(true)
          return
        }

        const center = { lat, lng }
        const map = new maps.Map(containerRef.current, {
          center,
          zoom,
          // Roadmap is clearer for delivery pins than satellite/hybrid tiles,
          // especially on dense mobile screens.
          mapTypeId: 'roadmap',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          scaleControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          maxZoom: 20,
          minZoom: 12,
        })

        const marker = new maps.Marker({
          position: center,
          map,
          draggable: true,
          animation: maps.Animation?.DROP,
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
        setReady(true)

        const invalidate = () => {
          if (map && !cancelled) {
            maps.event.trigger(map, 'resize')
            map.setCenter(marker.getPosition() || center)
            map.setZoom(Math.max(zoom, zoomForAccuracy(accuracy)))
          }
        }
        setTimeout(invalidate, 100)
        setTimeout(invalidate, 350)

        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          resizeObserver = new ResizeObserver(() => invalidate())
          resizeObserver.observe(containerRef.current)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    void init()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      circleRef.current?.setMap(null)
      circleRef.current = null
      markerRef.current?.setMap(null)
      markerRef.current = null
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Move the marker/camera only for EXTERNAL location changes (Get My Location,
  // lat/lng inputs); the guard skips changes the user made on the map itself.
  useEffect(() => {
    const marker = markerRef.current
    const map = mapRef.current
    if (!marker || !map) return

    const last = lastReportedRef.current
    if (last && Math.abs(last.lat - lat) < 1e-6 && Math.abs(last.lng - lng) < 1e-6) {
      return
    }

    const next = { lat, lng }
    marker.setPosition(next)
    map.panTo(next)
  }, [lat, lng])

  useEffect(() => {
    const map = mapRef.current
    if (!map || typeof window === 'undefined') return

    const w = window as Window & { google?: { maps?: any } }
    const maps = w.google?.maps
    if (!maps) return

    if (accuracy != null && accuracy > 0) {
      const radius = Math.min(accuracy, 80)
      if (!circleRef.current) {
        circleRef.current = new maps.Circle({
          strokeColor: '#10B981',
          strokeOpacity: 0.85,
          strokeWeight: 1,
          fillColor: '#10B981',
          fillOpacity: 0.15,
          map,
          center: { lat, lng },
          radius,
        })
      } else {
        circleRef.current.setCenter({ lat, lng })
        circleRef.current.setRadius(radius)
        circleRef.current.setMap(map)
      }
    } else if (circleRef.current) {
      circleRef.current.setMap(null)
      circleRef.current = null
    }

    const targetZoom = zoomForAccuracy(accuracy)
    const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : null
    if (typeof currentZoom !== 'number' || currentZoom < targetZoom) {
      map.setZoom(targetZoom)
    }
  }, [accuracy, lat, lng])

  const boxHeight = typeof height === 'number' ? `${height}px` : height

  if (failed) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-xl bg-[#1d2b3a]"
        style={{ height: boxHeight }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-white/85">
          <AlertCircle className="h-6 w-6" />
          <span>Map could not load. Use “Get My Location” or type the latitude / longitude below.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full bg-[#1d2b3a]" style={{ height: boxHeight }}>
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/80" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
