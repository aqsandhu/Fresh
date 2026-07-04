'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { googleMapsEmbedUrl, metersPerPixel, offsetLatLngFromPixels } from '@/lib/mapCoordinates'

const DEFAULT_ZOOM = 16
const MIN_ZOOM = 5
const MAX_ZOOM = 20
const EPS = 1e-6

/**
 * The iframe is rendered larger than its visible frame and centred, leaving a
 * margin of map tiles all around. Dragging translates the iframe within that
 * margin with a GPU transform (no reload), so normal pin adjustments are
 * completely smooth. We only reload the iframe when the drag would run past the
 * margin, or on zoom / an external jump (Get My Location).
 */
const OVERSCALE = 1.8
/** Reload to re-centre once a drag uses this fraction of the available margin. */
const MARGIN_USE_BEFORE_RELOAD = 0.82

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
 * Keyless Google Maps picker — used when there is no Maps JavaScript API key (or
 * the key failed auth). The classic `output=embed` iframe cannot be panned or
 * zoomed programmatically without reloading, which is why a naive "reload on
 * every drag" picker stutters. This makes it feel like a real slippy map:
 *
 *  - The pin is fixed at the centre and IS the selected location (Uber-style);
 *    the embed URL drops no marker of its own, so there is only one pin.
 *  - Dragging pans an over-sized iframe via CSS transform — no reload mid-drag.
 *  - Two-finger pinch scales the iframe live, then settles on the nearest real
 *    zoom level; the +/- buttons do the same in one step.
 *  - Tiles are hybrid satellite (imagery + labels), set in `googleMapsEmbedUrl`.
 */
export default function GoogleEmbedMapPicker({
  lat,
  lng,
  accuracy,
  height = 280,
  zoom = DEFAULT_ZOOM,
  onChange,
}: GoogleEmbedMapPickerProps) {
  // `view` is the centre/zoom the iframe currently renders; `pan` is how far it
  // is dragged away from that centre. The pin (container centre) therefore points
  // to `view` shifted by -pan. `zoomHint` is a live scale during pinch/button zoom.
  const [view, setView] = useState<View>({ lat, lng, zoom })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoomHint, setZoomHint] = useState(1)
  const [interacting, setInteracting] = useState(false)
  const [size, setSize] = useState({ w: 320, h: typeof height === 'number' ? height : 280 })

  const viewRef = useRef(view)
  viewRef.current = view
  const panRef = useRef(pan)
  panRef.current = pan
  const sizeRef = useRef(size)
  sizeRef.current = size

  const wrapRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, baseX: 0, baseY: 0, active: false })
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef({ startDist: 0, lastRatio: 1, active: false })
  const zoomResetRef = useRef(false)

  // Track the real container size so the drag margin is accurate.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth || 320, h: el.clientHeight || 280 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Geographic point the centre pin currently sits on. */
  const pinLocation = useCallback((): { lat: number; lng: number } => {
    const v = viewRef.current
    const p = panRef.current
    return offsetLatLngFromPixels(v.lat, v.lng, v.zoom, -p.x, -p.y)
  }, [])

  /** How far (px) the iframe can be dragged before blank edges would show. */
  const margin = () => ({
    x: ((OVERSCALE - 1) / 2) * sizeRef.current.w * MARGIN_USE_BEFORE_RELOAD,
    y: ((OVERSCALE - 1) / 2) * sizeRef.current.h * MARGIN_USE_BEFORE_RELOAD,
  })

  const twoPointerDist = (): number => {
    const pts = Array.from(pointersRef.current.values())
    if (pts.length < 2) return 0
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  }

  const commitZoom = (nextZoom: number) => {
    const v = viewRef.current
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
    if (clamped === v.zoom) {
      setZoomHint(1)
      return
    }
    const pin = pinLocation()
    zoomResetRef.current = true
    setView({ lat: pin.lat, lng: pin.lng, zoom: clamped })
    setPan({ x: 0, y: 0 })
  }

  // Follow external location changes (Get My Location, manual lat/lng). If the
  // new point is within the drag margin we just slide via transform (smooth);
  // otherwise we re-centre the iframe on it.
  useEffect(() => {
    if (dragRef.current.active || pinchRef.current.active) return
    const pin = pinLocation()
    if (Math.abs(pin.lat - lat) < EPS && Math.abs(pin.lng - lng) < EPS) return

    const v = viewRef.current
    const scale = 256 * Math.pow(2, v.zoom)
    const latRad = (v.lat * Math.PI) / 180
    const dxPx = (lng - v.lng) / (360 / scale / Math.cos(latRad))
    const dyPx = -(lat - v.lat) / (360 / scale)
    const m = margin()

    if (Math.abs(dxPx) <= m.x && Math.abs(dyPx) <= m.y) {
      setPan({ x: dxPx, y: dyPx })
    } else {
      setView({ lat, lng, zoom: v.zoom })
      setPan({ x: 0, y: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])

  const onPointerDown = (e: React.PointerEvent) => {
    overlayRef.current?.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setInteracting(true)

    if (pointersRef.current.size >= 2) {
      // Second finger down → pinch; stop panning.
      dragRef.current.active = false
      pinchRef.current = { startDist: twoPointerDist() || 1, lastRatio: 1, active: true }
      return
    }
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: panRef.current.x,
      baseY: panRef.current.y,
      active: true,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    if (pinchRef.current.active && pointersRef.current.size >= 2) {
      const d = twoPointerDist()
      if (d > 0) {
        const ratio = Math.min(2.6, Math.max(0.38, d / pinchRef.current.startDist))
        pinchRef.current.lastRatio = ratio
        setZoomHint(ratio) // live scale; settles onto a real zoom level on release
      }
      return
    }

    const dd = dragRef.current
    if (!dd.active) return
    setPan({ x: dd.baseX + (e.clientX - dd.startX), y: dd.baseY + (e.clientY - dd.startY) })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    overlayRef.current?.releasePointerCapture(e.pointerId)
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size === 0) setInteracting(false)

    if (pinchRef.current.active) {
      if (pointersRef.current.size < 2) {
        const ratio = pinchRef.current.lastRatio
        pinchRef.current = { startDist: 0, lastRatio: 1, active: false }
        dragRef.current.active = false
        commitZoom(viewRef.current.zoom + Math.round(Math.log2(ratio)))
      }
      return
    }

    const d = dragRef.current
    if (!d.active) return
    d.active = false

    const moved =
      Math.abs(panRef.current.x - d.baseX) >= 1 || Math.abs(panRef.current.y - d.baseY) >= 1
    if (!moved) return

    const pin = pinLocation()
    onChange(pin.lat, pin.lng)

    // Re-centre the iframe on the pin once the drag has eaten most of the margin,
    // so the next drag has fresh room. Small adjustments skip this entirely.
    const p = panRef.current
    const m = margin()
    if (Math.abs(p.x) >= m.x || Math.abs(p.y) >= m.y) {
      setView({ lat: pin.lat, lng: pin.lng, zoom: viewRef.current.zoom })
      setPan({ x: 0, y: 0 })
    }
  }

  const handleLoaded = () => {
    if (zoomResetRef.current) {
      zoomResetRef.current = false
      setZoomHint(1)
    }
  }

  const boxHeight = typeof height === 'number' ? `${height}px` : height
  const inset = `${-((OVERSCALE - 1) / 2) * 100}%`
  const oversizePct = `${OVERSCALE * 100}%`
  const accuracyDiameterPx =
    accuracy != null && accuracy > 0
      ? (Math.min(accuracy, 80) * 2) / metersPerPixel(view.lat, view.zoom)
      : 0

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden bg-[#e5e7eb]"
      style={{ height: boxHeight }}
    >
      <iframe
        title="Google Maps"
        src={googleMapsEmbedUrl(view.lat, view.lng, view.zoom)}
        onLoad={handleLoaded}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="pointer-events-none absolute border-0"
        style={{
          width: oversizePct,
          height: oversizePct,
          left: inset,
          top: inset,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomHint})`,
          // No easing while fingers are down (1:1 tracking); ease only when settling.
          transition: interacting ? 'none' : 'transform 140ms ease-out',
          willChange: 'transform',
        }}
      />

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
          className="pointer-events-none absolute left-1/2 top-1/2 z-[11] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/90 bg-emerald-400/20"
          style={{
            width: accuracyDiameterPx,
            height: accuracyDiameterPx,
          }}
        />
      )}

      {/* Red pin — the only marker; fixed at centre = the selected location */}
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

      {/* Zoom controls — pinch works too; buttons are the discrete equivalent */}
      <div className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => commitZoom(viewRef.current.zoom + 1)}
          className="flex h-9 w-9 items-center justify-center text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="h-px bg-gray-200" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => commitZoom(viewRef.current.zoom - 1)}
          className="flex h-9 w-9 items-center justify-center text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
