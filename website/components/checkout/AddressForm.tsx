'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, Check, Loader2, MapPin, Save, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import api, { addressesApi } from '@/lib/api'
import { getAccuratePosition, REQUIRED_LOCATION_ACCURACY_M } from '@/lib/geolocation'
import { resolveImageUrl } from '@/lib/utils'

export type AddressFormInitial = {
  id?: string
  address_type?: string
  written_address?: string
  area_name?: string
  city?: string
  landmark?: string
  latitude?: number | null
  longitude?: number | null
  location_accuracy?: number | null
  door_picture_url?: string | null
  is_default?: boolean
}

export type SavedAddress = {
  id: string
  address_type: string
  written_address: string
  area_name: string
  city: string
  is_default: boolean
  landmark?: string
  latitude?: number | null
  longitude?: number | null
  door_picture_url?: string | null
}

interface AddressFormProps {
  /** Pre-fill when editing; omit `id` to create a fresh address. */
  initial?: AddressFormInitial
  /** Cities dropdown options. */
  availableCities: { id: string; name: string; province: string }[]
  /** Used when creating to mark the row as the only/default address. */
  defaultOnCreate?: boolean
  onSaved: (address: SavedAddress) => void
  onCancel?: () => void
  submitLabel?: string
  /** Optional CSS for the outer container. */
  className?: string
}

/**
 * Full address editor. Mirrors what the checkout "Add New" form has so the
 * EDIT flow shows the same fields (type, area, city, full address, landmark,
 * door picture, GPS location). Re-used for both create and edit flows.
 */
export default function AddressForm({
  initial,
  availableCities,
  defaultOnCreate = false,
  onSaved,
  onCancel,
  submitLabel,
  className = '',
}: AddressFormProps) {
  const editingId = initial?.id || ''
  const isEdit = Boolean(editingId)

  const [addressType, setAddressType] = useState(initial?.address_type || 'home')
  const [areaName, setAreaName] = useState(initial?.area_name || '')
  const [city, setCity] = useState(initial?.city || 'Gujrat')
  const [writtenAddress, setWrittenAddress] = useState(initial?.written_address || '')
  const [landmark, setLandmark] = useState(initial?.landmark || '')

  const [doorPicture, setDoorPicture] = useState<File | null>(null)
  const existingDoorUrl = initial?.door_picture_url || null

  const initialLat = typeof initial?.latitude === 'number' ? initial.latitude : null
  const initialLng = typeof initial?.longitude === 'number' ? initial.longitude : null
  const [mapLocation, setMapLocation] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  )
  const [mapAccuracy, setMapAccuracy] = useState<number | null>(
    typeof initial?.location_accuracy === 'number' ? initial.location_accuracy : null
  )
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [isLocating, setIsLocating] = useState(false)

  const [saving, setSaving] = useState(false)

  const handleGetGps = async () => {
    setIsLocating(true)
    toast.loading('Getting precise GPS location...', { id: 'gps' })
    try {
      const pos = await getAccuratePosition()
      if (pos) {
        setMapLocation({ lat: pos.lat, lng: pos.lng })
        setMapAccuracy(pos.accuracy)
        toast.success(`Location detected (±${Math.round(pos.accuracy)}m)`)
      } else {
        toast.error(
          `Could not get GPS within ${REQUIRED_LOCATION_ACCURACY_M}m. Move to an open area and try again.`
        )
      }
    } finally {
      setIsLocating(false)
      toast.dismiss('gps')
    }
  }

  const handleSubmit = async () => {
    const trimmed = writtenAddress.trim()
    if (!trimmed || trimmed.length < 5) {
      toast.error('Full address must be at least 5 characters')
      return
    }

    setSaving(true)
    try {
      const baseFields: Record<string, string | number | boolean> = {
        address_type: addressType,
        written_address: trimmed,
        area_name: areaName.trim() || 'N/A',
        city,
        landmark: landmark.trim(),
      }
      if (!isEdit) {
        baseFields.is_default = defaultOnCreate
      }
      if (mapLocation) {
        baseFields.latitude = mapLocation.lat
        baseFields.longitude = mapLocation.lng
        if (mapAccuracy != null) baseFields.location_accuracy = mapAccuracy
      }

      let saved: SavedAddress

      // Always send multipart when a new door picture file is present.
      // FormData + multer on the backend already accepts the same JSON
      // fields, so this path supports both update and create with picture.
      if (doorPicture) {
        const formData = new FormData()
        Object.entries(baseFields).forEach(([k, v]) => formData.append(k, String(v)))
        formData.append('door_picture', doorPicture)
        const res = isEdit
          ? await api.put(`/addresses/${editingId}`, formData)
          : await api.post('/addresses', formData)
        saved = res.data?.data || res.data
      } else if (isEdit) {
        const res = await addressesApi.update(editingId, baseFields as any)
        saved = res as unknown as SavedAddress
      } else {
        const res = await addressesApi.create(baseFields)
        saved = res as unknown as SavedAddress
      }

      if (!saved?.id) throw new Error('Save did not return a valid address')

      toast.success(isEdit ? 'Address updated' : 'Address saved')
      onSaved(saved)
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        (isEdit ? 'Could not update address' : 'Could not save address')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      className={`pt-4 ${className}`}
    >
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Address Type
          </label>
          <select
            value={addressType}
            onChange={(e) => setAddressType(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="home">Home</option>
            <option value="work">Work</option>
            <option value="office">Office</option>
            <option value="other">Other</option>
          </select>
        </div>
        <Input
          label="Area Name"
          placeholder="e.g., Gulberg, DHA"
          value={areaName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAreaName(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {availableCities.length === 0 && <option value={city}>{city}</option>}
          {availableCities.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Full Address *
        </label>
        <textarea
          rows={3}
          placeholder="Enter your complete address"
          value={writtenAddress}
          onChange={(e) => setWrittenAddress(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="mt-4">
        <Input
          label="Landmark (Optional)"
          placeholder="Near mosque, school, etc."
          value={landmark}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLandmark(e.target.value)}
        />
      </div>

      {/* Door picture */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Door Picture (Optional)
        </label>

        {existingDoorUrl && !doorPicture && (
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveImageUrl(existingDoorUrl) || existingDoorUrl}
              alt="Current door"
              className="w-14 h-14 rounded-md object-cover"
            />
            <span className="text-xs text-gray-600 flex-1">
              Current door picture. Upload a new one below to replace it.
            </span>
          </div>
        )}

        <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors cursor-pointer block">
          <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {doorPicture
              ? doorPicture.name
              : existingDoorUrl
              ? 'Tap to replace door picture'
              : 'Click to upload a picture of your door'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Helps our delivery partner find your location
          </p>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setDoorPicture(e.target.files?.[0] || null)}
          />
        </label>
      </div>

      {/* Map location */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          📍 Pin Map Location (Optional)
        </label>

        {!showMapPicker && !mapLocation && (
          <button
            type="button"
            onClick={() => setShowMapPicker(true)}
            className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm border border-primary-200 rounded-lg px-4 py-2.5 hover:bg-primary-50 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            Add Google Map Location
          </button>
        )}

        {mapLocation && !showMapPicker && (
          <div className="flex flex-wrap items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Check className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-700 flex-1 min-w-0">
              Location pinned ({mapLocation.lat.toFixed(4)}, {mapLocation.lng.toFixed(4)})
              {mapAccuracy != null && (
                <span className="text-green-600"> · ±{Math.round(mapAccuracy)}m</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setShowMapPicker(true)
              }}
              className="text-sm text-primary-600 hover:underline"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => {
                setMapLocation(null)
                setMapAccuracy(null)
              }}
              className="text-sm text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
        )}

        {showMapPicker && (
          <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
            <iframe
              title="Map preview"
              width="100%"
              height="280"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://maps.google.com/maps?q=${
                mapLocation?.lat || 32.5742
              },${mapLocation?.lng || 74.0789}&z=15&output=embed`}
            />
            <div className="p-3 bg-gray-50 space-y-3">
              <p className="text-xs text-gray-500">
                Enter your exact coordinates or use &quot;Get My Current Location&quot;.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="32.5742"
                    value={mapLocation?.lat ?? ''}
                    onChange={(e) =>
                      setMapLocation((prev) => ({
                        lat: parseFloat(e.target.value) || 0,
                        lng: prev?.lng ?? 74.0789,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="74.0789"
                    value={mapLocation?.lng ?? ''}
                    onChange={(e) =>
                      setMapLocation((prev) => ({
                        lat: prev?.lat ?? 32.5742,
                        lng: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isLocating}
                  onClick={handleGetGps}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-primary-700 transition-colors disabled:opacity-60"
                >
                  <MapPin className="w-4 h-4" />
                  {isLocating ? 'Getting GPS...' : 'Get My Current Location'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(false)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {mapLocation ? 'Done' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-1">
          {isEdit
            ? 'Update or clear the pinned location.'
            : 'If you skip this, our rider will pin the location on first delivery.'}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            <X className="w-4 h-4 mr-2" /> Cancel
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {submitLabel || (isEdit ? 'Update Address' : 'Save Address')}
        </Button>
      </div>
    </motion.div>
  )
}
