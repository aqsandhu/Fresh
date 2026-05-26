'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { loadGoogleMapsJs } from '@/lib/loadGoogleMaps'
import { hasGoogleMapsApiKey } from '@/lib/googleMaps'

interface DraggableMapPickerProps {
  lat: number
  lng: number
  accuracy?: number | null
  height?: number | string
  zoom?: number
  onChange: (lat: number, lng: number) => void
}

/**
 * Interactive Google Maps picker with a draggable red pin.
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Maps JavaScript API enabled).
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

  const [status, setStatus] = useState<'loading' | 'ready' | 'missing-key' | 'error'>(
    hasGoogleMapsApiKey() ? 'loading' : 'missing-key'
  )

  useEffect(() => {
    if (!hasGoogleMapsApiKey() || !containerRef.current) return

    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    const reportChange = (nextLat: number, nextLng: number) => {
      lastReportedRef.current = { lat: nextLat, lng: nextLng }
      onChangeRef.current(nextLat, nextLng)
    }

    const init = async () => {
      try {
        const maps = await loadGoogleMapsJs()
        if (cancelled || !maps || !containerRef.current) {
          if (!cancelled) setStatus('error')
          return
        }

        const center = { lat, lng }
        const map = new maps.Map(containerRef.current, {
          center,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: 'greedy',
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
        setStatus('ready')

        const invalidate = () => {
          if (map && !cancelled) {
            maps.event.trigger(map, 'resize')
            map.setCenter(marker.getPosition() || center)
          }
        }
        setTimeout(invalidate, 100)
        setTimeout(invalidate, 350)

        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          resizeObserver = new ResizeObserver(() => invalidate())
          resizeObserver.observe(containerRef.current)
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    init()

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
      if (!circleRef.current) {
        circleRef.current = new maps.Circle({
          strokeColor: '#10B981',
          strokeOpacity: 0.85,
          strokeWeight: 1,
          fillColor: '#10B981',
          fillOpacity: 0.15,
          map,
          center: { lat, lng },
          radius: accuracy,
        })
      } else {
        circleRef.current.setCenter({ lat, lng })
        circleRef.current.setRadius(accuracy)
        circleRef.current.setMap(map)
      }
    } else if (circleRef.current) {
      circleRef.current.setMap(null)
      circleRef.current = null
    }
  }, [accuracy, lat, lng])

  const boxHeight = typeof height === 'number' ? `${height}px` : height

  if (status === 'missing-key') {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 bg-amber-50 px-4 text-center"
        style={{ height: boxHeight }}
      >
        <AlertCircle className="h-8 w-8 text-amber-600" />
        <p className="text-sm font-medium text-amber-900">Google Maps API key required</p>
        <p className="text-xs text-amber-800 max-w-sm">
          Set <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{' '}
          on Vercel and enable Maps JavaScript API in Google Cloud.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 bg-red-50 px-4 text-center"
        style={{ height: boxHeight }}
      >
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm font-medium text-red-800">Could not load Google Maps</p>
        <p className="text-xs text-red-700">Check your API key and billing in Google Cloud Console.</p>
      </div>
    )
  }

  return (
    <div className="relative w-full bg-gray-100" style={{ height: boxHeight }}>
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
