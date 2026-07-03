'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, Loader2, MapPin, Save, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { addressesApi } from '@/lib/api'
import { DEFAULT_MAP_LAT, DEFAULT_MAP_LNG } from '@/lib/googleMaps'
import {
  getAccuratePosition,
  FALLBACK_LOCATION_ACCURACY_M,
  REQUIRED_LOCATION_ACCURACY_M,
} from '@/lib/geolocation'
import GoogleMapPicker from './GoogleMapPicker'
import DoorPhotoField from './DoorPhotoField'
import ServiceAreaPopup from '@/components/city/ServiceAreaPopup'
import { useServiceArea } from '@/lib/useServiceArea'
import { isWithinServiceArea } from '@/lib/serviceArea'

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
  /**
   * Fired whenever the required fields cross the validity threshold. Lets
   * the parent enable a "Place Order" button while keeping the form
   * embedded — the parent can then call `ref.current.submit()` to save
   * the address automatically before placing the order.
   */
  onValidityChange?: (isValid: boolean) => void
  /** Hide the internal Save button (parent triggers save via ref instead). */
  hideSubmitButton?: boolean
}

/** Imperative handle exposed via ref so parents can save the form too. */
export interface AddressFormHandle {
  submit: () => Promise<SavedAddress | null>
}

/**
 * Full address editor. Mirrors what the checkout "Add New" form has so the
 * EDIT flow shows the same fields (type, area, city, full address, landmark,
 * door picture, GPS location). Re-used for both create and edit flows.
 *
 * Wrapped in `forwardRef` so callers can programmatically trigger save via
 * `ref.current.submit()` — e.g., the checkout page calls this when the user
 * clicks "Place Order" with an unsaved new-address form open.
 */
const AddressForm = forwardRef<AddressFormHandle, AddressFormProps>(function AddressForm(
  {
    initial,
    availableCities,
    defaultOnCreate = false,
    onSaved,
    onCancel,
    submitLabel,
    className = '',
    onValidityChange,
    hideSubmitButton = false,
  },
  ref
) {
  const editingId = initial?.id || ''
  const isEdit = Boolean(editingId)
  const isCityLocked = availableCities.length <= 1

  const [addressType, setAddressType] = useState(initial?.address_type || 'home')
  const [areaName, setAreaName] = useState(initial?.area_name || '')
  const [city, setCity] = useState(initial?.city || availableCities[0]?.name || 'Gujrat')
  const [writtenAddress, setWrittenAddress] = useState(initial?.written_address || '')
  const [landmark, setLandmark] = useState(initial?.landmark || '')
  const [cityChangeHint, setCityChangeHint] = useState(false)

  useEffect(() => {
    if (availableCities.length === 1) {
      setCity(availableCities[0].name)
    }
  }, [availableCities])

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
  const [gpsStatus, setGpsStatus] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)

  // Map-based service area: block saving a delivery pin outside the city boundary.
  const { data: serviceArea } = useServiceArea()
  const [outOfAreaOpen, setOutOfAreaOpen] = useState(false)

  const handleGetGps = async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('GPS is not supported on this device')
      toast.error('GPS is not supported on this device')
      return
    }

    setShowMapPicker(true)
    setIsLocating(true)
    setMapAccuracy(null)
    setGpsStatus(`Finding accurate location (need +/-${REQUIRED_LOCATION_ACCURACY_M}m)...`)
    toast.loading(`Locking GPS (need +/-${REQUIRED_LOCATION_ACCURACY_M}m)...`, { id: 'gps' })

    try {
      const pos = await getAccuratePosition({
        onProgress: (best) => {
          setMapLocation({ lat: best.lat, lng: best.lng })
          setGpsStatus(
            `Searching... best +/-${Math.round(best.accuracy)}m, need +/-${REQUIRED_LOCATION_ACCURACY_M}m`
          )
        },
      })
      toast.dismiss('gps')

      if (pos) {
        setMapLocation({ lat: pos.lat, lng: pos.lng })
        setMapAccuracy(pos.accuracy)
        if (pos.tier === 'tight') {
          setGpsStatus(`Location locked (±${Math.round(pos.accuracy)}m)`)
          toast.success(`Location detected (±${Math.round(pos.accuracy)}m)`)
        } else if (pos.tier === 'fallback') {
          setGpsStatus(`Located ±${Math.round(pos.accuracy)}m — adjust on map if needed`)
          toast.success(`Located ±${Math.round(pos.accuracy)}m`, { duration: 5000 })
        } else {
          setGpsStatus(`Approximate ±${Math.round(pos.accuracy)}m — fine-tune on map`)
          toast.success(`Approximate location — adjust pin on map`, { duration: 6000 })
        }
      } else {
        setMapAccuracy(null)
        setGpsStatus(
          `GPS is not accurate enough yet. Need +/-${REQUIRED_LOCATION_ACCURACY_M}m - try near a window/outdoors or pin manually.`
        )
        toast.error(
          `Could not lock GPS within +/-${FALLBACK_LOCATION_ACCURACY_M}m. Try again or pin manually.`,
          { duration: 6000 }
        )
      }
    } catch {
      toast.dismiss('gps')
      setMapAccuracy(null)
      setGpsStatus('GPS failed - pin manually on the map')
      toast.error('GPS failed. Enter lat/lng or try again.')
    } finally {
      setIsLocating(false)
    }
  }

  const isValid = writtenAddress.trim().length >= 5

  useEffect(() => {
    onValidityChange?.(isValid)
  }, [isValid, onValidityChange])

  const handleSubmit = useCallback(async (): Promise<SavedAddress | null> => {
    const trimmed = writtenAddress.trim()
    if (!trimmed || trimmed.length < 5) {
      toast.error('Full address must be at least 5 characters')
      return null
    }

    // If the city has an active delivery boundary and the pin sits outside it,
    // stop and show the "not in your area yet" popup (cities without a polygon
    // are unrestricted, so this never blocks existing customers).
    if (
      mapLocation &&
      serviceArea?.enabled &&
      !isWithinServiceArea(mapLocation.lat, mapLocation.lng, serviceArea)
    ) {
      setOutOfAreaOpen(true)
      return null
    }

    setShowMapPicker(false)
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
        const res = isEdit
          ? await addressesApi.updateWithDoorPicture(editingId, baseFields, doorPicture)
          : await addressesApi.createWithDoorPicture(baseFields, doorPicture)
        saved = res as unknown as SavedAddress
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
      return saved
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        (isEdit ? 'Could not update address' : 'Could not save address')
      toast.error(msg)
      return null
    } finally {
      setSaving(false)
    }
  }, [
    addressType,
    areaName,
    city,
    defaultOnCreate,
    doorPicture,
    editingId,
    isEdit,
    landmark,
    mapAccuracy,
    mapLocation,
    onSaved,
    serviceArea,
    writtenAddress,
  ])

  useImperativeHandle(
    ref,
    () => ({
      submit: handleSubmit,
    }),
    [handleSubmit]
  )

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
        {isCityLocked ? (
          <div>
            <button
              type="button"
              onClick={() => setCityChangeHint(true)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-800 text-left hover:bg-gray-100 transition-colors"
            >
              {city}
            </button>
            {cityChangeHint && (
              <p className="mt-2 text-sm text-amber-800">
                To change City please go to{' '}
                <Link href="/" className="text-primary-600 underline font-medium">
                  HomePage
                </Link>
              </p>
            )}
          </div>
        ) : (
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
        )}
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

      {/* Door picture — same flow as customer app (pick → crop modal) */}
      <div className="mt-4">
        <DoorPhotoField
          value={doorPicture}
          onChange={setDoorPicture}
          existingUrl={existingDoorUrl}
        />
      </div>

      {/* Map location */}
      <div className="mt-4">
        <label className="mb-2 block text-sm font-semibold text-gray-700">
          📍 Pin Map Location (Optional)
        </label>

        {!showMapPicker && !mapLocation && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowMapPicker(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
            >
              <MapPin className="h-4 w-4" />
              Add Google Map Location
            </button>
            <button
              type="button"
              disabled={isLocating}
              onClick={handleGetGps}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              <MapPin className="h-4 w-4" />
              {isLocating ? 'Getting location…' : 'Get My Location'}
            </button>
          </div>
        )}

        {gpsStatus && (
          <p
            className={`mt-2 text-xs ${isLocating ? 'text-primary-600' : 'text-gray-600'}`}
          >
            {gpsStatus}
          </p>
        )}

        {mapLocation && !showMapPicker && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <Check className="h-5 w-5 shrink-0 text-green-600" />
            <span className="min-w-0 flex-1 text-sm text-green-700">
              Location pinned ({mapLocation.lat.toFixed(4)}, {mapLocation.lng.toFixed(4)})
              {mapAccuracy != null && (
                <span className="text-green-600"> · ±{Math.round(mapAccuracy)}m</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setShowMapPicker(true)}
              className="text-sm font-medium text-primary-600 hover:underline"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => {
                setMapLocation(null)
                setMapAccuracy(null)
                setGpsStatus(null)
              }}
              className="text-sm font-medium text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
        )}

        {showMapPicker && (
          <GoogleMapPicker
            lat={mapLocation?.lat ?? DEFAULT_MAP_LAT}
            lng={mapLocation?.lng ?? DEFAULT_MAP_LNG}
            accuracy={mapAccuracy}
            isLocating={isLocating}
            hasLocation={mapLocation != null}
            onLatLngChange={(lat, lng) => {
              setMapLocation({ lat, lng })
              setMapAccuracy(null)
            }}
            onGetLocation={handleGetGps}
            onDone={() => setShowMapPicker(false)}
            onCancel={() => {
              setMapLocation(null)
              setMapAccuracy(null)
              setGpsStatus(null)
              setShowMapPicker(false)
            }}
          />
        )}

        <p className="text-xs text-gray-400 mt-1">
          {isEdit
            ? 'Update or clear the pinned location.'
            : 'If you skip this, our rider will pin the location on first delivery.'}
        </p>
      </div>

      {!hideSubmitButton && (
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
      )}

      {serviceArea && (
        <ServiceAreaPopup
          open={outOfAreaOpen}
          onClose={() => setOutOfAreaOpen(false)}
          message={serviceArea.message}
        />
      )}
    </motion.div>
  )
})

export default AddressForm
