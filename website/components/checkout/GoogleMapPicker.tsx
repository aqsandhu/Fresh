'use client'

import { Loader2, MapPin } from 'lucide-react'
import { REQUIRED_LOCATION_ACCURACY_M } from '@/lib/geolocation'
import { DEFAULT_MAP_LAT, DEFAULT_MAP_LNG } from '@/lib/googleMaps'
import DraggableMapPicker from './DraggableMapPicker'

const MAP_HEIGHT = 280

interface GoogleMapPickerProps {
  lat: number
  lng: number
  accuracy?: number | null
  isLocating?: boolean
  onLatLngChange: (lat: number, lng: number) => void
  onGetLocation: () => void
  onDone: () => void
  onCancel: () => void
  hasLocation: boolean
}

/**
 * Checkout map picker - layout and copy match customer-app CheckoutMapPicker.
 */
export default function GoogleMapPicker({
  lat,
  lng,
  accuracy,
  isLocating = false,
  onLatLngChange,
  onGetLocation,
  onDone,
  onCancel,
  hasLocation,
}: GoogleMapPickerProps) {
  const accuracyOk =
    typeof accuracy === 'number' && accuracy > 0 && accuracy <= REQUIRED_LOCATION_ACCURACY_M

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <DraggableMapPicker
        lat={lat}
        lng={lng}
        accuracy={accuracy}
        height={MAP_HEIGHT}
        onChange={onLatLngChange}
      />

      <div className="space-y-2 bg-gray-50 p-4">
        <p className="text-xs leading-relaxed text-gray-500">
          Drag the map to position the pin, zoom with +/-, or use Get My Location. Fine-tune with
          lat/lng if needed.
        </p>

        {isLocating && (
          <p className="text-xs text-primary-600">
            Getting GPS... searching until +/-{REQUIRED_LOCATION_ACCURACY_M}m accuracy is reached.
            Tap Stop to pin manually.
          </p>
        )}

        {!isLocating && accuracy != null && accuracy > 0 && (
          <p className={`text-xs font-medium ${accuracyOk ? 'text-green-700' : 'text-amber-700'}`}>
            GPS accuracy: +/-{Math.round(accuracy)}m
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Latitude</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={String(DEFAULT_MAP_LAT)}
              value={Number.isFinite(lat) ? String(lat) : ''}
              onChange={(e) => {
                const next = parseFloat(e.target.value)
                if (Number.isFinite(next)) onLatLngChange(next, lng)
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Longitude</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={String(DEFAULT_MAP_LNG)}
              value={Number.isFinite(lng) ? String(lng) : ''}
              onChange={(e) => {
                const next = parseFloat(e.target.value)
                if (Number.isFinite(next)) onLatLngChange(lat, next)
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGetLocation}
            className={`flex min-w-[140px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white ${
              isLocating
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {isLocating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            {isLocating ? 'Stop GPS search' : 'Get My Location'}
          </button>

          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-100"
          >
            {hasLocation ? 'Done' : 'Cancel'}
          </button>

          {hasLocation && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
