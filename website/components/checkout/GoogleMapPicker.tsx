'use client'

import { MapPin } from 'lucide-react'
import { DEFAULT_MAP_LAT, DEFAULT_MAP_LNG } from '@/lib/googleMaps'
import DraggableMapPicker from './DraggableMapPicker'

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
 * Google Maps picker with draggable red pin (Maps JavaScript API).
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
  return (
    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
      <DraggableMapPicker
        lat={lat}
        lng={lng}
        accuracy={accuracy}
        onChange={onLatLngChange}
      />
      <div className="p-3 bg-gray-50 space-y-3">
        <p className="text-xs text-gray-500">
          Drag the red pin on the map, tap to move it, or use &quot;Get My Location&quot;.
          Fine-tune with the lat/lng fields if needed.
        </p>
        {accuracy != null && accuracy > 0 && (
          <p className="text-xs text-green-700">GPS accuracy: ±{Math.round(accuracy)}m</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Latitude</label>
            <input
              type="number"
              step="any"
              placeholder={String(DEFAULT_MAP_LAT)}
              value={Number.isFinite(lat) ? lat : ''}
              onChange={(e) =>
                onLatLngChange(parseFloat(e.target.value) || DEFAULT_MAP_LAT, lng)
              }
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Longitude</label>
            <input
              type="number"
              step="any"
              placeholder={String(DEFAULT_MAP_LNG)}
              value={Number.isFinite(lng) ? lng : ''}
              onChange={(e) =>
                onLatLngChange(lat, parseFloat(e.target.value) || DEFAULT_MAP_LNG)
              }
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={isLocating}
            onClick={onGetLocation}
            className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-primary-700 transition-colors disabled:opacity-60"
          >
            <MapPin className="w-4 h-4" />
            {isLocating ? 'Getting location…' : 'Get My Location'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {hasLocation ? 'Done' : 'Cancel'}
          </button>
          {hasLocation && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
