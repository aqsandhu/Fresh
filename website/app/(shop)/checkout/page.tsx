'use client'

// Checkout depends on auth/session + browser-only redirects, so it can't be
// statically prerendered at build time (triggered a "location is not defined"
// error during Next's static export pass).
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  MapPin,
  Clock,
  CreditCard,
  Check,
  Plus,
  Camera,
  Loader2,
  CalendarDays,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useCartStore, useAuthStore } from '@/store/cartStore'
import { formatPriceShort } from '@/lib/utils'
import { addressesApi, settingsApi } from '@/lib/api'
import api from '@/lib/api'

interface RealAddress {
  id: string
  address_type: string
  written_address: string
  area_name: string
  city: string
  is_default: boolean
  landmark?: string
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, getSubtotal, getDeliveryCharge, getFinalTotal, clearCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const [addresses, setAddresses] = useState<RealAddress[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [showNewAddress, setShowNewAddress] = useState(false)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [loadingAddresses, setLoadingAddresses] = useState(true)
  const [savingAddress, setSavingAddress] = useState(false)
  const [timeSlots, setTimeSlots] = useState<{ id: string; slot_name: string; start_time: string; end_time: string; is_free_delivery_slot: boolean; available_slots: number }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today')

  // New address form fields
  const [newAddressType, setNewAddressType] = useState('home')
  const [newWrittenAddress, setNewWrittenAddress] = useState('')
  const [newAreaName, setNewAreaName] = useState('')
  const [newCity, setNewCity] = useState('Gujrat')
  const [newLandmark, setNewLandmark] = useState('')
  const [doorPicture, setDoorPicture] = useState<File | null>(null)
  const [availableCities, setAvailableCities] = useState<{id: string, name: string, province: string}[]>([])
  const [mapLocation, setMapLocation] = useState<{lat: number, lng: number} | null>(null)
  const [showMapPicker, setShowMapPicker] = useState(false)

  const subtotal = getSubtotal()
  const selectedSlotObj = timeSlots.find(s => s.id === selectedTimeSlot)
  const isFreeDeliverySlot = selectedSlotObj?.is_free_delivery_slot === true
  const deliveryCharge = isFreeDeliverySlot ? 0 : getDeliveryCharge()
  const total = subtotal + deliveryCharge

  const getDateString = (day: 'today' | 'tomorrow') => {
    const d = new Date()
    if (day === 'tomorrow') d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  }

  const getDisplayDate = (day: 'today' | 'tomorrow') => {
    const d = new Date()
    if (day === 'tomorrow') d.setDate(d.getDate() + 1)
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  }

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/checkout')
      return
    }
    loadAddresses()
    loadCities()
    loadTimeSlots('today')
  }, [isAuthenticated])

  const loadTimeSlots = async (day: 'today' | 'tomorrow') => {
    setLoadingSlots(true)
    setSelectedTimeSlot('')
    try {
      const date = getDateString(day)
      const slots = await settingsApi.getTimeSlots(date)
      setTimeSlots(slots)
      if (slots.length > 0) setSelectedTimeSlot(slots[0].id)
    } catch {
      setTimeSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  const handleDayChange = (day: 'today' | 'tomorrow') => {
    setSelectedDay(day)
    loadTimeSlots(day)
  }

  const loadCities = async () => {
    try {
      const res = await api.get('/site-settings/cities')
      const data = res.data?.data || res.data || []
      setAvailableCities(Array.isArray(data) ? data : [])
    } catch {
      // fallback
      setAvailableCities([{ id: 'default', name: 'Gujrat', province: 'Punjab' }])
    }
  }

  const loadAddresses = async () => {
    try {
      const res = await addressesApi.getAll()
      const raw = res.data || res
      const list: RealAddress[] = Array.isArray(raw) ? raw : []
      setAddresses(list)
      const def = list.find(a => a.is_default) || list[0]
      if (def) setSelectedAddress(def.id)
      if (list.length === 0) setShowNewAddress(true)
    } catch {
      // If no addresses, show form
      setShowNewAddress(true)
    } finally {
      setLoadingAddresses(false)
    }
  }

  const handleSaveAddress = async () => {
    if (!newWrittenAddress.trim()) {
      toast.error('Please enter your address')
      return
    }

    setSavingAddress(true)
    try {
      const formData = new FormData()
      formData.append('address_type', newAddressType)
      formData.append('written_address', newWrittenAddress)
      formData.append('area_name', newAreaName || 'N/A')
      formData.append('city', newCity)
      formData.append('landmark', newLandmark)
      if (mapLocation) {
        formData.append('latitude', mapLocation.lat.toString())
        formData.append('longitude', mapLocation.lng.toString())
      }
      formData.append('is_default', addresses.length === 0 ? 'true' : 'false')

      if (doorPicture) {
        formData.append('door_picture', doorPicture)
      }

      const res = await api.post('/addresses', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const created = res.data?.data || res.data
      setAddresses(prev => [...prev, created])
      setSelectedAddress(created.id)
      setShowNewAddress(false)
      setNewWrittenAddress('')
      setNewAreaName('')
      setNewLandmark('')
      setDoorPicture(null)
      setMapLocation(null)
      setShowMapPicker(false)
      toast.success('Address saved!')
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to save address'
      toast.error(msg)
    } finally {
      setSavingAddress(false)
    }
  }

  const handlePlaceOrder = async () => {
    if (!selectedAddress) {
      toast.error('Please select a delivery address')
      return
    }

    setIsPlacingOrder(true)
    try {
      // Step 1: Clear server cart
      try { await api.delete('/cart/clear') } catch { /* ok if empty */ }

      // Step 2: Add all client cart items to server cart
      for (const item of items) {
        await api.post('/cart/add', {
          product_id: item.product.id,
          quantity: item.quantity,
        })
      }

      // Step 3: Place order
      const orderPayload: any = {
        address_id: selectedAddress,
        payment_method: 'cash_on_delivery',
        customer_notes: '',
      }
      // Only send requested_delivery_date for tomorrow orders
      if (selectedDay === 'tomorrow') {
        orderPayload.requested_delivery_date = getDateString('tomorrow')
      }
      if (selectedTimeSlot) {
        orderPayload.time_slot_id = selectedTimeSlot
      }
      const orderRes = await api.post('/orders', orderPayload)

      const orderData = orderRes.data?.data || orderRes.data
      const order = orderData?.order || orderData
      
      setOrderPlaced(true)
      clearCart()
      toast.success('Order placed successfully!')
      router.push(`/track/${order?.id || 'success'}`)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to place order. Please try again.'
      toast.error(msg)
    } finally {
      setIsPlacingOrder(false)
    }
  }

  if (items.length === 0 && !orderPlaced) {
    // Defer the redirect until we're on the client — calling router.push
    // during render on the server hits `location is not defined` in Next's
    // static export pass.
    if (typeof window !== 'undefined') {
      router.push('/cart')
    }
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
          Checkout
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold">Delivery Address</h2>
              </div>

              {loadingAddresses ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : (
                <>
                  {/* Saved Addresses */}
                  {addresses.length > 0 && (
                    <div className="space-y-3 mb-4">
                      {addresses.map((address) => (
                        <label
                          key={address.id}
                          className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                            selectedAddress === address.id
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="address"
                            value={address.id}
                            checked={selectedAddress === address.id}
                            onChange={(e) => {
                              setSelectedAddress(e.target.value)
                              setShowNewAddress(false)
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">{address.address_type}</span>
                              {address.is_default && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 text-sm mt-1">
                              {[address.written_address, address.area_name, address.city].filter(Boolean).join(', ')}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Add New Address */}
                  <button
                    onClick={() => setShowNewAddress(!showNewAddress)}
                    className="flex items-center gap-2 text-primary-600 font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    Add New Address
                  </button>

                  {/* New Address Form */}
                  {showNewAddress && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="mt-4 pt-4 border-t"
                    >
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Address Type</label>
                          <select
                            value={newAddressType}
                            onChange={(e) => setNewAddressType(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="home">Home</option>
                            <option value="office">Office</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <Input
                          label="Area Name"
                          placeholder="e.g., Gulberg, DHA"
                          value={newAreaName}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAreaName(e.target.value)}
                        />
                      </div>
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                        <select
                          value={newCity}
                          onChange={(e) => setNewCity(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          {availableCities.map((c) => (
                            <option key={c.id} value={c.name}>{c.name}</option>
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
                          value={newWrittenAddress}
                          onChange={(e) => setNewWrittenAddress(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="mt-4">
                        <Input
                          label="Landmark (Optional)"
                          placeholder="Near mosque, school, etc."
                          value={newLandmark}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLandmark(e.target.value)}
                        />
                      </div>
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Door Picture (Optional)
                        </label>
                        <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors cursor-pointer block">
                          <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">
                            {doorPicture ? doorPicture.name : 'Click to upload a picture of your door'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            This helps our delivery partner find your location
                          </p>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => setDoorPicture(e.target.files?.[0] || null)}
                          />
                        </label>
                      </div>

                      {/* Optional Map Location */}
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
                          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                            <Check className="w-5 h-5 text-green-600" />
                            <span className="text-sm text-green-700 flex-1">
                              Location pinned ({mapLocation.lat.toFixed(4)}, {mapLocation.lng.toFixed(4)})
                            </span>
                            <button
                              type="button"
                              onClick={() => { setMapLocation(null); setShowMapPicker(true) }}
                              className="text-sm text-primary-600 hover:underline"
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapLocation(null)}
                              className="text-sm text-red-500 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                        {showMapPicker && (
                          <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                            <iframe
                              width="100%"
                              height="300"
                              style={{ border: 0 }}
                              loading="lazy"
                              src={`https://maps.google.com/maps?q=${mapLocation?.lat || 32.5742},${mapLocation?.lng || 74.0789}&z=15&output=embed`}
                            />
                            <div className="p-3 bg-gray-50 space-y-3">
                              <p className="text-xs text-gray-500">
                                Enter your exact coordinates or use the &quot;Get My Current Location&quot; button
                              </p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="32.5742"
                                    value={mapLocation?.lat || ''}
                                    onChange={(e) => setMapLocation(prev => ({ lat: parseFloat(e.target.value) || 0, lng: prev?.lng || 74.0789 }))}
                                    className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="74.0789"
                                    value={mapLocation?.lng || ''}
                                    onChange={(e) => setMapLocation(prev => ({ lat: prev?.lat || 32.5742, lng: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (navigator.geolocation) {
                                      navigator.geolocation.getCurrentPosition(
                                        (pos) => {
                                          setMapLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                                          toast.success('Location detected!')
                                        },
                                        () => toast.error('Could not get your location. Please enter manually.')
                                      )
                                    } else {
                                      toast.error('Geolocation not supported by your browser')
                                    }
                                  }}
                                  className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-primary-700 transition-colors"
                                >
                                  <MapPin className="w-4 h-4" />
                                  Get My Current Location
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
                          If you skip this, our rider will pin the location on first delivery
                        </p>
                      </div>

                      <div className="mt-4 flex gap-3">
                        <Button variant="outline" onClick={() => setShowNewAddress(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSaveAddress} disabled={savingAddress}>
                          {savingAddress ? 'Saving...' : 'Save Address'}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>

            {/* Delivery Time */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold">Delivery Time</h2>
              </div>

              {/* Today / Tomorrow Tabs */}
              <div className="flex gap-3 mb-6">
                {(['today', 'tomorrow'] as const).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayChange(day)}
                    className={`flex-1 flex flex-col items-center py-3 px-4 rounded-xl border-2 transition-colors ${
                      selectedDay === day
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <CalendarDays className="w-5 h-5 mb-1" />
                    <span className="font-semibold text-sm capitalize">{day}</span>
                    <span className="text-xs opacity-75">{getDisplayDate(day)}</span>
                  </button>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {loadingSlots ? (
                  <div className="col-span-full flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : timeSlots.length === 0 ? (
                  <p className="col-span-full text-gray-500 text-sm">
                    No time slots available for {selectedDay === 'today' ? 'today' : 'tomorrow'}
                  </p>
                ) : (
                  timeSlots.map((slot) => {
                    const formatTime = (time: string) => {
                      const [h, m] = time.split(':').map(Number)
                      const d = new Date()
                      d.setHours(h, m || 0, 0, 0)
                      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                    }
                    const label = `${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`
                    return (
                      <label
                        key={slot.id}
                        className={`flex flex-col items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                          selectedTimeSlot === slot.id
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        } ${slot.available_slots <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="radio"
                          name="timeSlot"
                          value={slot.id}
                          checked={selectedTimeSlot === slot.id}
                          onChange={(e) => setSelectedTimeSlot(e.target.value)}
                          disabled={slot.available_slots <= 0}
                          className="sr-only"
                        />
                        <Clock className="w-6 h-6 text-primary-600 mb-2" />
                        <span className="font-medium text-center text-sm">{label}</span>
                        {slot.is_free_delivery_slot && (
                          <span className="text-xs text-green-600 mt-1">FREE DELIVERY</span>
                        )}
                        {slot.available_slots <= 0 && (
                          <span className="text-xs text-red-500 mt-1">FULL</span>
                        )}
                      </label>
                    )
                  })
                )}
              </div>
            </motion.div>

            {/* Payment Method */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold">Payment Method</h2>
              </div>

              <label className="flex items-center gap-3 p-4 border-2 border-primary-500 bg-primary-50 rounded-xl cursor-pointer">
                <input type="radio" name="payment" checked readOnly className="sr-only" />
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 font-bold text-sm">COD</span>
                </div>
                <div className="flex-1">
                  <p className="font-medium">Cash on Delivery</p>
                  <p className="text-sm text-gray-600">Pay when you receive your order</p>
                </div>
                <Check className="w-5 h-5 text-primary-600" />
              </label>
            </motion.div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-xl p-6 shadow-sm sticky top-24"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                Order Summary
              </h2>

              {/* Items */}
              <div className="space-y-3 mb-6 max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-3">
                    <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      <Image
                        src={item.product.image || item.product.image_url || '/placeholder-product.png'}
                        alt={item.product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-gray-500">{item.quantity} x {formatPriceShort(item.product.price)}</p>
                    </div>
                    <p className="text-sm font-medium">
                      {formatPriceShort(item.product.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-3 mb-6 border-t pt-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPriceShort(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span className={deliveryCharge === 0 ? 'text-green-600' : ''}>
                    {deliveryCharge === 0 ? 'FREE' : formatPriceShort(deliveryCharge)}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between text-lg font-bold text-gray-900">
                    <span>Total</span>
                    <span>{formatPriceShort(total)}</span>
                  </div>
                </div>
              </div>

              {/* Place Order Button */}
              <Button
                onClick={handlePlaceOrder}
                fullWidth
                size="lg"
                isLoading={isPlacingOrder}
                disabled={!selectedAddress || isPlacingOrder}
              >
                {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
              </Button>

              <p className="text-xs text-center text-gray-500 mt-4">
                By placing this order, you agree to our Terms of Service
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
