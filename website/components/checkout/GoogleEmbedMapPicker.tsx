'use client'

import { useMemo, useRef } from 'react'
import { googleMapsEmbedUrl, metersPerPixel, offsetLatLngFromPixels } from '@/lib/mapCoordinates'

const DEFAULT_ZOOM = 16

interface GoogleEmbedMapPickerProps {
  lat: number
  lng: number
  accuracy?: number | null
  height?: number | string
  zoom?: number
  onChange: (lat: number, lng: number) => void
}

/**
 * Google Maps embed (no API key) + interactive overlay — same UX as Expo Go MapView:
 * real Google map tiles, red pin, drag or tap to move location.
 * Expo Go uses native MapView without a project API key; this is the web equivalent.
 */
export default function GoogleEmbedMapPicker({
  lat,
  lng,
  accuracy,
  height = 280,
  zoom = DEFAULT_ZOOM,
  onChange,
}: GoogleEmbedMapPickerProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const posRef = useRef({ lat, lng })

  posRef.current = { lat, lng }

  const embedSrc = useMemo(() => googleMapsEmbedUrl(lat, lng, zoom), [lat, lng, zoom])

  const applyPixelDelta = (dx: number, dy: number) => {
    const next = offsetLatLngFromPixels(posRef.current.lat, posRef.current.lng, zoom, dx, dy)
    posRef.current = next
    onChange(next.lat, next.lng)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    overlayRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true
    if (!drag.moved) return
    drag.x = e.clientX
    drag.y = e.clientY
    applyPixelDelta(dx, dy)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    overlayRef.current?.releasePointerCapture(e.pointerId)
    if (drag && !drag.moved && overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      applyPixelDelta(e.clientX - cx, e.clientY - cy)
    }
  }

  const accuracyDiameterPx =
    accuracy != null && accuracy > 0
      ? (Math.min(accuracy, 80) * 2) / metersPerPixel(lat, zoom)
      : 0

  const boxHeight = typeof height === 'number' ? `${height}px` : height

  return (
    <div className="relative w-full overflow-hidden bg-[#e5e7eb]" style={{ height: boxHeight }}>
      <iframe
        key={embedSrc}
        title="Google Maps"
        src={embedSrc}
        className="pointer-events-none absolute inset-0 h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
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
          className="pointer-events-none absolute left-1/2 top-1/2 z-[11] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/85 bg-emerald-500/15"
          style={{
            width: accuracyDiameterPx,
            height: accuracyDiameterPx,
          }}
        />
      )}

      {/* Red pin — same role as app MapView Marker pinColor="red" */}
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
    </div>
  )
}
