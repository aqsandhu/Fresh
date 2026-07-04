'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { googleMapsEmbedUrl, metersPerPixel, offsetLatLngFromPixels } from '@/lib/mapCoordinates'

const DEFAULT_ZOOM = 16
const MIN_ZOOM = 5
const MAX_ZOOM = 20
const EPS = 1e-6
/** Give Google's embed a beat to paint tiles before we cross-fade to it. */
const TILE_SETTLE_MS = 180
/** If a buffer's onLoad never fires (blocked iframe), swap anyway. */
const LOAD_FALLBACK_MS = 2000

interface View {
  lat: number
  lng: number
  zoom: number
}

interface GoogleEmbedMapPickerProps {
  lat: number
  lng: number
  accuracy?: number | null
  height?: number | string
  zoom?: number
  onChange: (lat: number, lng: number) => void
}

/**
 * Keyless Google Maps picker — used when no Maps JavaScript API key is available
 * (or the key failed auth). The classic `output=embed` iframe cannot be panned or
 * zoomed programmatically without reloading, so a naive "reload on every drag"
 * approach flashes and stutters badly.
 *
 * This makes it smooth two ways:
 *  1. Dragging moves the map with a GPU CSS transform (60fps) and commits the new
 *     centre only on release — the iframe is never reloaded mid-drag.
 *  2. Committing a new centre/zoom loads it into a hidden second iframe and
 *     cross-fades once it has painted, so there is no grey flash.
 *
 * UX model matches Uber/foodpanda: the red pin is fixed at the centre and is the
 * selected location; you drag the map underneath it and tap +/- to zoom.
 */
export default function GoogleEmbedMapPicker({
  lat,
  lng,
  accuracy,
  height = 280,
  zoom = DEFAULT_ZOOM,
  onChange,
}: GoogleEmbedMapPickerProps) {
  // Double buffer: `front` is visible/committed, the other preloads the next view.
  const [views, setViews] = useState<[View, View]>(() => {
    const v: View = { lat, lng, zoom }
    return [v, { ...v }]
  })
  const [front, setFront] = useState(0)
  const [transform, setTransform] = useState({ x: 0, y: 0 })

  const frontView = views[front]
  const frontViewRef = useRef(frontView)
  frontViewRef.current = frontView

  const pendingRef = useRef(false)
  const swapTimerRef = useRef<number | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, x: 0, y: 0, active: false })

  const clearSwapTimer = () => {
    if (swapTimerRef.current != null) {
      clearTimeout(swapTimerRef.current)
      swapTimerRef.current = null
    }
  }

  const doSwap = useCallback((back: number) => {
    clearSwapTimer()
    pendingRef.current = false
    setFront(back)
    setTransform({ x: 0, y: 0 })
    dragRef.current.x = 0
    dragRef.current.y = 0
  }, [])

  // Load `next` into the hidden buffer; cross-fade once it has painted.
  const commit = useCallback(
    (next: View) => {
      if (pendingRef.current) return // a cross-fade is already in flight
      const back = front ^ 1
      pendingRef.current = true
      setViews((cur) => {
        const copy: [View, View] = [cur[0], cur[1]]
        copy[back] = next
        return copy
      })
      clearSwapTimer()
      swapTimerRef.current = window.setTimeout(() => doSwap(back), LOAD_FALLBACK_MS)
    },
    [front, doSwap]
  )

  const handleLoaded = (idx: number) => {
    if (!pendingRef.current) return
    const back = front ^ 1
    if (idx !== back) return
    clearSwapTimer()
    swapTimerRef.current = window.setTimeout(() => doSwap(back), TILE_SETTLE_MS)
  }

  // Reconcile with the committed props after every swap and whenever the parent
  // moves the pin externally (GPS result, manual lat/lng inputs). Skipped while a
  // cross-fade is in flight or the user is actively dragging; the `front` dep
  // re-runs this right after a swap so a value dropped mid-fade still lands.
  useEffect(() => {
    if (pendingRef.current || dragRef.current.active) return
    const fv = frontViewRef.current
    if (Math.abs(fv.lat - lat) < EPS && Math.abs(fv.lng - lng) < EPS) return
    commit({ lat, lng, zoom: fv.zoom })
  }, [front, lat, lng, commit])

  useEffect(() => () => clearSwapTimer(), [])

  const changeZoom = (delta: number) => {
    if (pendingRef.current) return
    const fv = frontViewRef.current
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fv.zoom + delta))
    if (nextZoom === fv.zoom) return
    commit({ lat: fv.lat, lng: fv.lng, zoom: nextZoom })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (pendingRef.current) return
    overlayRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, x: 0, y: 0, active: true }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragRef.current
    if (!s.active) return
    s.x = e.clientX - s.startX
    s.y = e.clientY - s.startY
    setTransform({ x: s.x, y: s.y })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const s = dragRef.current
    overlayRef.current?.releasePointerCapture(e.pointerId)
    if (!s.active) return
    s.active = false

    const { x, y } = s
    if (Math.abs(x) < 1 && Math.abs(y) < 1) {
      setTransform({ x: 0, y: 0 })
      return
    }

    // Pin stays at centre, so the new centre is the old centre shifted opposite
    // to the drag. Committing flows back through props → the effect cross-fades.
    const fv = frontViewRef.current
    const next = offsetLatLngFromPixels(fv.lat, fv.lng, fv.zoom, -x, -y)
    onChange(next.lat, next.lng)
  }

  const boxHeight = typeof height === 'number' ? `${height}px` : height
  const accuracyDiameterPx =
    accuracy != null && accuracy > 0
      ? (Math.min(accuracy, 80) * 2) / metersPerPixel(frontView.lat, frontView.zoom)
      : 0

  return (
    <div className="relative w-full overflow-hidden bg-[#e5e7eb]" style={{ height: boxHeight }}>
      {[0, 1].map((i) => (
        <iframe
          key={i}
          title="Google Maps"
          src={googleMapsEmbedUrl(views[i].lat, views[i].lng, views[i].zoom)}
          onLoad={() => handleLoaded(i)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="pointer-events-none absolute inset-0 h-full w-full border-0"
          style={{
            transform: i === front ? `translate(${transform.x}px, ${transform.y}px)` : 'none',
            opacity: i === front ? 1 : 0,
            transition: 'opacity 160ms ease-out',
            willChange: 'transform',
          }}
        />
      ))}

      <div
        ref={overlayRef}
        className="absolute inset-0 z-10 touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {accuracyDiameterPx > 4 && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[11] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/85 bg-emerald-500/15"
          style={{
            width: accuracyDiameterPx,
            height: accuracyDiameterPx,
          }}
        />
      )}

      {/* Red pin — fixed at centre; represents the selected location */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[12] -translate-x-1/2 -translate-y-full">
        <svg width="28" height="36" viewBox="0 0 28 36" aria-hidden>
          <path
            d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z"
            fill="#EA4335"
            stroke="#fff"
            strokeWidth="2"
          />
          <circle cx="14" cy="14" r="5" fill="#B31412" />
        </svg>
      </div>

      {/* Zoom controls — the keyless embed can't pinch-zoom, so drive it with buttons */}
      <div className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => changeZoom(1)}
          className="flex h-9 w-9 items-center justify-center text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="h-px bg-gray-200" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => changeZoom(-1)}
          className="flex h-9 w-9 items-center justify-center text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
