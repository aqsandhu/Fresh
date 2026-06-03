'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchGoogleMapsApiKey, loadGoogleMapsJs } from '@/lib/loadGoogleMaps'
import GoogleEmbedMapPicker from './GoogleEmbedMapPicker'

const MAP_ZOOM = 16

interface DraggableMapPickerProps {
  lat: number
  lng: number
  accuracy?: number | null
  height?: number | string
  zoom?: number
  onChange: (lat: number, lng: number) => void
}

type Engine = 'loading' | 'js' | 'embed'

/**
 * Checkout map — mirrors customer-app CheckoutMapPicker (Expo Go MapView):
 * - Default: Google Maps embed + draggable red pin (no API key required)
 * - Optional: Maps JavaScript API when a key exists (env or Render backend)
 */
export default function DraggableMapPicker(props: DraggableMapPickerProps) {
  const [engine, setEngine] = useState<Engine>('loading')

  useEffect(() => {
    let cancelled = false

    const pickEngine = async () => {
      const key = await fetchGoogleMapsApiKey()
      if (cancelled) return

      if (key) {
        try {
          const maps = await loadGoogleMapsJs()
          if (!cancelled) setEngine(maps ? 'js' : 'embed')
        } catch {
          if (!cancelled) setEngine('embed')
        }
      } else {
        setEngine('embed')
      }
    }

    void pickEngine()
    return () => {
      cancelled = true
    }
  }, [])

  if (engine === 'loading') {
    const boxHeight =
      typeof props.height === 'number' ? `${props.height}px` : props.height || '280px'
    return (
      <div
        className="relative flex w-full items-center justify-center bg-[#e5e7eb]"
        style={{ height: boxHeight }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (engine === 'embed') {
    return <GoogleEmbedMapPicker {...props} zoom={props.zoom ?? MAP_ZOOM} />
  }

  return <GoogleJsDraggableMap {...props} zoom={props.zoom ?? MAP_ZOOM} />
}

function GoogleJsDraggableMap({
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
        const maps = await loadGoogleMapsJs()
        if (cancelled || !maps || !containerRef.current) return

        const center = { lat, lng }
        const map = new maps.Map(containerRef.current, {
          center,
          zoom,
          mapTypeId: 'roadmap',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
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
          }
        }
        setTimeout(invalidate, 100)
        setTimeout(invalidate, 350)

        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          resizeObserver = new ResizeObserver(() => invalidate())
          resizeObserver.observe(containerRef.current)
        }
      } catch {
        /* fall back handled by parent on next render if needed */
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
  }, [accuracy, lat, lng])

  const boxHeight = typeof height === 'number' ? `${height}px` : height

  return (
    <div className="relative w-full bg-[#e5e7eb]" style={{ height: boxHeight }}>
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#e5e7eb]">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
