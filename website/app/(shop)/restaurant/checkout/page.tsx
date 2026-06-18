'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MapPin, CreditCard, Receipt, Loader2, ShoppingCart, UtensilsCrossed, Clock, Zap, Camera, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { formatPriceShort } from '@/lib/utils'
import { getRestaurantInfo, type RestaurantInfo } from '@/lib/restaurantSession'
import { restaurantShopApi } from '@/lib/restaurantApi'
import { useRestaurantCartStore } from '@/store/restaurantCartStore'

function unitShort(unit: string): string {
  if (unit === 'half_kg') return '½ kg'
  if (unit === 'quarter_kg') return '¼ kg'
  if (unit === 'half_dozen') return '½ dozen'
  return String(unit)
}

function fmtTime(t?: string): string {
  if (!t) return ''
  const [h, m] = String(t).split(':')
  let hh = parseInt(h, 10)
  const ampm = hh >= 12 ? 'PM' : 'AM'
  hh = hh % 12 || 12
  return `${hh}:${m || '00'} ${ampm}`
}

export default function RestaurantCheckoutPage() {
  const router = useRouter()
  const [info, setInfo] = useState<RestaurantInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [notes, setNotes] = useState('')
  const [placing, setPlacing] = useState(false)

  // Delivery config + slots.
  const [delivery, setDelivery] = useState({ base_charge: 100, free_delivery_threshold: 2000, urgent_charge: 0, urgent_eta: '' })
  const [slots, setSlots] = useState<any[]>([])
  const [timeSlotId, setTimeSlotId] = useState('')
  const [urgent, setUrgent] = useState(false)

  // Editable profile.
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [frontImageUrl, setFrontImageUrl] = useState<string | null>(null)
  const [uploadingImg, setUploadingImg] = useState(false)

  const { items, getSubtotal, clearCart } = useRestaurantCartStore()
  const subtotal = getSubtotal()

  useEffect(() => {
    const i = getRestaurantInfo()
    if (!i) {
      router.replace('/restaurant/login')
      return
    }
    setInfo(i)
    setAddress(i.address || '')
    setReady(true)
    ;(async () => {
      try {
        const [d, s, me] = await Promise.all([
          restaurantShopApi.getDelivery(),
          restaurantShopApi.getTimeSlots(),
          restaurantShopApi.getMe().catch(() => null),
        ])
        setDelivery(d)
        setSlots(s || [])
        if (me) {
          if (me.address) setAddress((prev) => prev || me.address)
          if (me.latitude != null && me.longitude != null) setCoords({ lat: Number(me.latitude), lng: Number(me.longitude) })
          if (me.front_image_url) setFrontImageUrl(me.front_image_url)
        }
      } catch {
        /* keep defaults */
      }
    })()
  }, [router])

  const urgentEnabled = delivery.urgent_charge > 0

  const deliveryCharge = useMemo(() => {
    if (urgent) return urgentEnabled ? delivery.urgent_charge : 0
    if (!timeSlotId) return subtotal >= delivery.free_delivery_threshold ? 0 : delivery.base_charge
    const slot = slots.find((s) => s.id === timeSlotId)
    if (slot?.is_free_delivery_slot) return 0
    return subtotal >= delivery.free_delivery_threshold ? 0 : delivery.base_charge
  }, [urgent, urgentEnabled, delivery, timeSlotId, slots, subtotal])

  const total = Math.round((subtotal + deliveryCharge + Number.EPSILON) * 100) / 100

  const pinLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Location not supported on this device')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        toast.success('Location pinned')
      },
      () => toast.error('Could not get your location'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      const { front_image_url } = await restaurantShopApi.uploadFrontImage(file)
      setFrontImageUrl(front_image_url)
      toast.success('Storefront photo updated')
    } catch (err: any) {
      toast.error(err?.message || 'Could not upload photo')
    } finally {
      setUploadingImg(false)
      e.target.value = ''
    }
  }

  const placeOrder = async () => {
    if (items.length === 0) return toast.error('Your cart is empty')
    if (!urgent && !timeSlotId) return toast.error('Please select a delivery time slot')
    if (urgent && !urgentEnabled) return toast.error('Urgent delivery is not available right now')
    setPlacing(true)
    try {
      await restaurantShopApi.placeOrder(
        items.map((l) => ({ product_id: l.product.id, quantity: l.quantity, unit: l.unit, quality: l.quality })),
        {
          customer_notes: notes.trim() || undefined,
          time_slot_id: urgent ? null : timeSlotId,
          urgent_delivery: urgent,
          address: address.trim() || undefined,
          ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
          ...(frontImageUrl ? { front_image_url: frontImageUrl } : {}),
        }
      )
      clearCart()
      toast.success('Order placed!')
      router.push('/restaurant/orders')
    } catch (e: any) {
      toast.error(e?.message || 'Could not place the order')
    } finally {
      setPlacing(false)
    }
  }

  if (!ready) return null

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 text-center px-4">
        <ShoppingCart className="w-14 h-14 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 mb-5">Your cart is empty.</p>
        <Link href="/restaurant/shop"><Button>Browse catalog</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8 pb-24">
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery address (editable) */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold">Delivery Address</h2>
              </div>
              <p className="font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
                <UtensilsCrossed className="w-4 h-4 text-primary-600" /> {info?.business_name}
                <span className="text-sm font-normal text-gray-500">· {info?.city}{info?.phone ? ` · ${info.phone}` : ''}</span>
              </p>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Full delivery address"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={pinLocation}>
                  <MapPin className="w-4 h-4 mr-1.5 inline" />
                  {coords ? 'Update pin' : 'Pin location'}
                </Button>
                {coords && (
                  <span className="text-xs text-gray-500">📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
                )}
              </div>

              {/* Front image */}
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-1.5">Storefront photo (helps the rider find you)</p>
                {frontImageUrl ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frontImageUrl} alt="Storefront" className="w-32 h-32 object-cover rounded-lg border" />
                    <button type="button" onClick={() => setFrontImageUrl(null)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer text-sm text-gray-600 hover:bg-gray-50">
                    {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {uploadingImg ? 'Uploading…' : 'Add photo'}
                    <input type="file" accept="image/*" onChange={onPickImage} className="hidden" disabled={uploadingImg} />
                  </label>
                )}
              </div>
            </div>

            {/* Delivery time */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold">Delivery Time</h2>
              </div>

              {urgentEnabled && (
                <label className={`flex items-center justify-between gap-3 rounded-lg border-2 p-3 mb-3 cursor-pointer ${urgent ? 'border-amber-500 bg-amber-50' : 'border-gray-200'}`}>
                  <span className="flex items-center gap-2 font-medium text-gray-900">
                    <Zap className="w-4 h-4 text-amber-500" /> Urgent delivery
                    {delivery.urgent_eta ? <span className="text-xs font-normal text-gray-500">({delivery.urgent_eta})</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatPriceShort(delivery.urgent_charge)}</span>
                    <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="w-4 h-4 rounded text-amber-600" />
                  </span>
                </label>
              )}

              {!urgent && (
                slots.length === 0 ? (
                  <p className="text-sm text-gray-500">No delivery slots available right now. Please contact support.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slots.map((s) => {
                      const active = timeSlotId === s.id
                      const full = (s.available_slots ?? 1) <= 0
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={full}
                          onClick={() => setTimeSlotId(s.id)}
                          className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
                            active ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                              : full ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                              : 'border-gray-200 text-gray-700 hover:border-primary-300'
                          }`}
                        >
                          {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                          {s.is_free_delivery_slot ? <span className="block text-[10px] text-green-600">Free delivery</span> : null}
                          {full ? <span className="block text-[10px]">Full</span> : null}
                        </button>
                      )
                    })}
                  </div>
                )
              )}
            </div>

            {/* Payment */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold">Payment Method</h2>
              </div>
              <div className="rounded-lg border-2 border-primary-500 bg-primary-50 p-4 flex items-center justify-between">
                <span className="font-medium text-gray-900">Cash on Delivery</span>
                <span className="text-xs text-primary-700 font-semibold">Selected</span>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-2">Order notes (optional)</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Anything our team should know about this order…"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm lg:sticky lg:top-24">
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-bold text-gray-900">Order Summary</h2>
              </div>

              <div className="max-h-56 overflow-y-auto divide-y mb-4">
                {items.map((l) => (
                  <div key={`${l.product.id}::${l.quality}::${l.unit}`} className="py-2 flex justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-gray-900">{l.product.name_en}</span>
                      <span className="text-gray-400"> · Q{l.quality} · {unitShort(l.unit)} × {l.quantity}</span>
                    </span>
                    <span className="font-medium text-gray-900 shrink-0">{formatPriceShort(l.unitPrice * l.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-sm border-t pt-3">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatPriceShort(subtotal)}</span></div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span className={deliveryCharge === 0 ? 'text-green-600 font-semibold' : ''}>{deliveryCharge === 0 ? 'FREE' : formatPriceShort(deliveryCharge)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 border-t pt-2"><span>Total</span><span>{formatPriceShort(total)}</span></div>
              </div>

              <Button onClick={placeOrder} disabled={placing} fullWidth size="lg" className="mt-5">
                {placing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Place Order'}
              </Button>
              <Link href="/restaurant/cart" className="block text-center text-primary-600 mt-3 hover:underline text-sm">Back to cart</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
