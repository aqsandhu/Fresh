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
 * margin of map tiles all around, so dragging/zooming can be done with a pure
 * GPU transform without revealing blank edges.
 */
const OVERSCALE = 2.0
/** After the user stops interacting this long, seamlessly crispen the tiles. */
const SETTLE_DELAY_MS = 480
/** If the settle buffer never fires onLoad, swap anyway. */
const SETTLE_FALLBACK_MS = 2000
/** Visual scale applied per zoom-button press (≈ one zoom level = 2×). */
const ZOOM_BTN_FACTOR = 1.9

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
 * Keyless Google Maps picker — used only when the Maps JavaScript API key can't
 * load (the native JS map is preferred and is truly smooth). The classic
 * `output=embed` iframe can't be panned or zoomed programmatically without
 * reloading, so this decouples the reload from the gesture:
 *
 *  - Dragging pans an over-sized iframe and pinch/zoom scales it — both are pure
 *    CSS transforms, so nothing reloads WHILE you interact.
 *  - ~0.5s after you stop, a hidden second iframe loads the new centre/zoom and
 *    cross-fades in (no blank flash) so the tiles become crisp. This is why
 *    zooming and small back-and-forth moves no longer reload mid-gesture.
 *  - The pin is fixed at the centre and IS the selected location; the embed URL
 *    drops no marker of its own, and the tiles are hybrid satellite.
 */
export default function GoogleEmbedMapPicker({
  lat,
  lng,
  accuracy,
  height = 280,
  zoom = DEFAULT_ZOOM,
  onChange,
}: GoogleEmbedMapPickerProps) {
  // Double buffer: `front` is visible; the other preloads the settled view.
  const [views, setViews] = useState<[View, View]>(() => {
    const v: View = { lat, lng, zoom }
    return [v, { ...v }]
  })
  const [front, setFront] = useState(0)
  const [pan, setPan] = useState({ x: 0, y: 0 }) // live pan of the front iframe
  const [scale, setScale] = useState(1) // live zoom scale of the front iframe
  const [size, setSize] = useState({ w: 320, h: typeof height === 'number' ? height : 280 })

  const frontView = views[front]
  const frontViewRef = useRef(frontView)
  frontViewRef.current = frontView
  const panRef = useRef(pan)
  panRef.current = pan
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const sizeRef = useRef(size)
  sizeRef.current = size

  const wrapRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, baseX: 0, baseY: 0, active: false })
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef({ startDist: 0, baseScale: 1, active: false })
  const settleTimerRef = useRef<number | null>(null)
  const swapTimerRef = useRef<number | null>(null)
  const pendingRef = useRef(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth || 320, h: el.clientHeight || 280 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Geographic point the centre pin currently sits on (accounts for pan + scale). */
  const pinLocation = useCallback((): { lat: number; lng: number } => {
    const v = frontViewRef.current
    const p = panRef.current
    const s = scaleRef.current || 1
    return offsetLatLngFromPixels(v.lat, v.lng, v.zoom, -p.x / s, -p.y / s)
  }, [])

  const clearSettleTimer = () => {
    if (settleTimerRef.current != null) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }
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
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [])

  /** Load the given view into the hidden buffer and cross-fade once it paints. */
  const loadSettled = useCallback(
    (target: View) => {
      if (pendingRef.current) return
      const back = front ^ 1
      pendingRef.current = true
      setViews((cur) => {
        const copy: [View, View] = [cur[0], cur[1]]
        copy[back] = target
        return copy
      })
      clearSwapTimer()
      swapTimerRef.current = window.setTimeout(() => doSwap(back), SETTLE_FALLBACK_MS)
    },
    [front, doSwap]
  )

  // `scheduleSettle` fires the latest `settle` via a ref, so the two can
  // reference each other without a definition cycle.
  const settleRef = useRef<() => void>(() => {})
  const scheduleSettle = useCallback(() => {
    clearSettleTimer()
    settleTimerRef.current = window.setTimeout(() => settleRef.current(), SETTLE_DELAY_MS)
  }, [])

  // Crispen tiles a moment after the user stops interacting: bake the live
  // pan/scale into a real centre + zoom level, load it, cross-fade in.
  const settle = useCallback(() => {
    settleTimerRef.current = null
    if (pendingRef.current || pointersRef.current.size > 0) {
      scheduleSettle()
      return
    }
    const p = panRef.current
    const s = scaleRef.current
    if (Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(s - 1) < 0.02) return
    const v = frontViewRef.current
    const pin = pinLocation()
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(v.zoom + Math.log2(s || 1))))
    loadSettled({ lat: pin.lat, lng: pin.lng, zoom: nextZoom })
  }, [pinLocation, loadSettled, scheduleSettle])
  settleRef.current = settle

  const handleLoaded = (idx: number) => {
    if (!pendingRef.current) return
    if (idx !== (front ^ 1)) return
    doSwap(idx)
  }

  // Follow external location changes (Get My Location, manual lat/lng inputs).
  useEffect(() => {
    if (dragRef.current.active || pinchRef.current.active || pointersRef.current.size > 0) return
    const pin = pinLocation()
    if (Math.abs(pin.lat - lat) < EPS && Math.abs(pin.lng - lng) < EPS) return
    loadSettled({ lat, lng, zoom: frontViewRef.current.zoom })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])

  useEffect(() => {
    return () => {
      clearSettleTimer()
      clearSwapTimer()
    }
  }, [])

  const twoPointerDist = (): number => {
    const pts = Array.from(pointersRef.current.values())
    if (pts.length < 2) return 0
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    overlayRef.current?.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    clearSettleTimer()

    if (pointersRef.current.size >= 2) {
      dragRef.current.active = false
      pinchRef.current = { startDist: twoPointerDist() || 1, baseScale: scaleRef.current, active: true }
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
        const raw = pinchRef.current.baseScale * (d / pinchRef.current.startDist)
        setScale(Math.min(4, Math.max(0.25, raw)))
      }
      return
    }

    const dd = dragRef.current
    if (!dd.active) return
    setPan({ x: dd.baseX + (e.clientX - dd.startX), y: dd.baseY + (e.clientY - dd.startY) })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    overlayRef.current?.releasePointerCapture(e.pointerId)
    const wasPanning = dragRef.current.active && !pinchRef.current.active
    const baseX = dragRef.current.baseX
    const baseY = dragRef.current.baseY
    pointersRef.current.delete(e.pointerId)

    if (pinchRef.current.active) {
      if (pointersRef.current.size < 2) {
        pinchRef.current.active = false
        dragRef.current.active = false
        scheduleSettle()
      }
      return
    }

    if (wasPanning) {
      dragRef.current.active = false
      const moved =
        Math.abs(panRef.current.x - baseX) >= 1 || Math.abs(panRef.current.y - baseY) >= 1
      if (moved) {
        const pin = pinLocation()
        onChange(pin.lat, pin.lng) // commit the location immediately
        scheduleSettle() // crispen tiles once idle (no reload during the drag)
      }
    }
  }

  const zoomByButton = (dir: 1 | -1) => {
    const factor = dir > 0 ? ZOOM_BTN_FACTOR : 1 / ZOOM_BTN_FACTOR
    const v = frontViewRef.current
    const effective = v.zoom + Math.log2(scaleRef.current * factor)
    if (effective < MIN_ZOOM - 0.05 || effective > MAX_ZOOM + 0.05) return
    setScale((s) => s * factor) // instant visual zoom
    scheduleSettle() // settle onto the real level once idle
  }

  const boxHeight = typeof height === 'number' ? `${height}px` : height
  const inset = `${-((OVERSCALE - 1) / 2) * 100}%`
  const oversizePct = `${OVERSCALE * 100}%`
  const accuracyDiameterPx =
    accuracy != null && accuracy > 0
      ? ((Math.min(accuracy, 80) * 2) / metersPerPixel(frontView.lat, frontView.zoom)) * scale
      : 0

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden bg-[#1d2b3a]"
      style={{ height: boxHeight }}
    >
      {[0, 1].map((i) => (
        <iframe
          key={i}
          title="Google Maps"
          src={googleMapsEmbedUrl(views[i].lat, views[i].lng, views[i].zoom)}
          onLoad={() => handleLoaded(i)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="pointer-events-none absolute border-0"
          style={{
            width: oversizePct,
            height: oversizePct,
            left: inset,
            top: inset,
            transform:
              i === front ? `translate(${pan.x}px, ${pan.y}px) scale(${scale})` : 'none',
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
          onClick={() => zoomByButton(1)}
          className="flex h-9 w-9 items-center justify-center text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="h-px bg-gray-200" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomByButton(-1)}
          className="flex h-9 w-9 items-center justify-center text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
