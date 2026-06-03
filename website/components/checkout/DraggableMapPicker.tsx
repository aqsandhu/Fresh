'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { loadGoogleMapsJs } from '@/lib/loadGoogleMaps'
import { hasGoogleMapsApiKey } from '@/lib/googleMaps'
import LeafletDraggableMapPicker from './LeafletDraggableMapPicker'

interface DraggableMapPickerProps {
  lat: number
  lng: number
  accuracy?: number | null
  height?: number | string
  zoom?: number
  onChange: (lat: number, lng: number) => void
}

type MapEngine = 'loading' | 'google' | 'leaflet'

/**
 * Interactive map picker — Google Maps when API key is set (same key as app),
 * otherwise OpenStreetMap/Leaflet so the UI always works like the customer app.
 */
export default function DraggableMapPicker(props: DraggableMapPickerProps) {
  const [engine, setEngine] = useState<MapEngine>(
    hasGoogleMapsApiKey() ? 'loading' : 'leaflet'
  )

  useEffect(() => {
    if (!hasGoogleMapsApiKey()) {
      setEngine('leaflet')
      return
    }

    let cancelled = false
    loadGoogleMapsJs()
      .then((maps) => {
        if (cancelled) return
        setEngine(maps ? 'google' : 'leaflet')
      })
      .catch(() => {
        if (!cancelled) setEngine('leaflet')
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (engine === 'leaflet') {
    return <LeafletDraggableMapPicker {...props} />
  }

  if (engine === 'loading') {
    const boxHeight =
      typeof props.height === 'number' ? `${props.height}px` : props.height || '280px'
    return (
      <div
        className="relative flex w-full items-center justify-center bg-gray-200"
        style={{ height: boxHeight }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return <GoogleDraggableMapPicker {...props} onEngineFail={() => setEngine('leaflet')} />
}

interface GoogleDraggableMapPickerProps extends DraggableMapPickerProps {
  onEngineFail: () => void
}

function GoogleDraggableMapPicker({
  lat,
  lng,
  accuracy,
  height = 280,
  zoom = 17,
  onChange,
  onEngineFail,
}: GoogleDraggableMapPickerProps) {
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
        if (cancelled || !maps || !containerRef.current) {
          if (!cancelled) onEngineFail()
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
        if (!cancelled) onEngineFail()
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
