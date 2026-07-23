'use client'

// Checkout depends on auth/session + browser-only redirects, so it can't be
// statically prerendered at build time (triggered a "location is not defined"
// error during Next's static export pass).
export const dynamic = 'force-dynamic'

import PinReauthGate from '@/components/auth/PinReauthGate'
import CheckoutAuthPanel from '@/components/checkout/CheckoutAuthPanel'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  MapPin,
  Clock,
  Zap,
  CreditCard,
  Check,
  Plus,
  Loader2,
  CalendarDays,
  CheckCircle2,
  ArrowRight,
  ShoppingBag,
  Ticket,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { useCartStore, useAuthStore } from '@/store/cartStore'
import { formatPriceShort, formatProductUnitSuffix } from '@/lib/utils'
import SlotTimeLabel from '@/components/checkout/SlotTimeLabel'
import { resolveLineUnitPrice, unitPriceCaption, unitLabelShort } from '@/lib/unitPricing'
import { getSlotAvailability } from '@/lib/timeSlots'
import { pktDateString, pktDisplayDate, pktWallClock } from '@/lib/businessDate'
import { addressesApi, settingsApi, cartApi, myCouponsApi, type MyCoupon } from '@/lib/api'
import api from '@/lib/api'
import AddressActions from '@/components/checkout/AddressActions'
import AddressForm, {
  type AddressFormHandle,
  type SavedAddress,
} from '@/components/checkout/AddressForm'
import { getSelectedCityId, addressMatchesSelectedCity } from '@/lib/cityStorage'
import { useCityContext } from '@/context/CityContext'

type RealAddress = SavedAddress

// Public wrapper.
//
// NEW FLOW (inline auth on checkout):
//   Guests are NO LONGER redirected to /login. Instead they stay on this page
//   and see <CheckoutAuthPanel> (login / sign-up in one compact top section).
//   The moment they sign in, isAuthenticated flips and the real checkout below
//   renders completely unchanged. Returning, already-signed-in users still pass
//   through PinReauthGate (PIN re-auth after PIN_STALE_MS of inactivity).
//
// ── OLD WRAPPER (kept commented so the previous behaviour can be restored) ──
// export default function CheckoutPageWrapper() {
//   return (
//     <PinReauthGate>
//       <CheckoutPage />
//     </PinReauthGate>
//   )
// }
export default function CheckoutPageWrapper() {
  const { isAuthenticated, hasHydrated: authHasHydrated } = useAuthStore()

  // Wait for persisted auth to load so we don't flash the auth panel at a user
  // who is actually already logged in (hard refresh sees auth briefly false).
  if (!authHasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <GuestCheckout />
  }

  return (
    <PinReauthGate>
      <CheckoutPage />
    </PinReauthGate>
  )
}

// Guest view: the same "Checkout" heading + a slim order-summary preview (from
// the LOCAL cart — no server session needed) alongside the inline auth panel.
// Address / time / payment intentionally appear only AFTER sign-in (they need
// an authenticated session), and the checkout guidance tips are deliberately
// NOT shown here — guests see login/sign-up tips inside the panel instead, so
// the two instruction sets never overlap or contradict.
function GuestCheckout() {
  const router = useRouter()
  const { items, getSubtotal, hasHydrated: cartHasHydrated } = useCartStore()

  // Empty cart → nothing to check out; mirror the authed page and bounce to /cart.
  useEffect(() => {
    if (cartHasHydrated && items.length === 0) {
      router.push('/cart')
    }
  }, [cartHasHydrated, items.length, router])

  if (cartHasHydrated && items.length === 0) {
    return null
  }
  if (!cartHasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const subtotal = getSubtotal()

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Inline login / sign-up (the new top section) */}
          <div className="lg:col-span-2">
            <CheckoutAuthPanel />
          </div>

          {/* Order summary preview (read-only, from local cart) */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {items.map((item) => {
                  const unit = item.unit || 'full'
                  const linePrice = resolveLineUnitPrice(item)
                  return (
                    <div key={`${item.product.id}::${unit}::${item.quality ?? 'A'}`} className="flex items-center gap-3">
                      <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        <Image
                          src={item.product.image || item.product.image_url || '/placeholder-product.svg'}
                          alt={item.product.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.product.name}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantity} x {formatPriceShort(linePrice)}
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {formatPriceShort(linePrice * item.quantity)}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="border-t pt-4 flex justify-between text-gray-700 font-semibold">
                <span>Subtotal</span>
                <span>{formatPriceShort(subtotal)}</span>
              </div>
              <p className="mt-4 text-xs text-gray-500">
                Delivery charge, time slot and saved addresses appear right after you
                sign in above.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckoutPage() {
  const router = useRouter()
  const { selectedCity } = useCityContext()
  const {
    items,
    getSubtotal,
    getDeliveryCharge,
    getFinalTotal,
    clearCart,
    hasHydrated: cartHasHydrated,
  } = useCartStore()
  const { isAuthenticated, hasHydrated: authHasHydrated } = useAuthStore()
  const [addresses, setAddresses] = useState<RealAddress[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [showNewAddress, setShowNewAddress] = useState(false)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  // Friendly inline validation error shown above the Place Order button —
  // avoids a raw 422 from the API when city / slot selection is missing.
  const [placeOrderError, setPlaceOrderError] = useState('')
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [placedOrder, setPlacedOrder] = useState<{
    id: string
    order_number?: string | null
    total_amount?: number | null
  } | null>(null)
  const [loadingAddresses, setLoadingAddresses] = useState(true)
  const [timeSlots, setTimeSlots] = useState<{ id: string; slot_name: string; start_time: string; end_time: string; is_free_delivery_slot: boolean; available_slots: number }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today')

  const serviceCities = selectedCity
    ? [{ id: selectedCity.id, name: selectedCity.name, province: selectedCity.province || '' }]
    : []
  const [serverSubtotal, setServerSubtotal] = useState<number | null>(null)
  const [serverDeliveryCharge, setServerDeliveryCharge] = useState<number | null>(null)
  const [cartSynced, setCartSynced] = useState(false)
  const [deliveryLoading, setDeliveryLoading] = useState(false)

  // Ref + validity flag for the embedded "Add New" address form. We use
  // the ref to save the address automatically when the user presses Place
  // Order without having clicked Save first.
  const newAddressFormRef = useRef<AddressFormHandle>(null)
  const deliveryTimeRef = useRef<HTMLDivElement>(null)
  const [newAddressValid, setNewAddressValid] = useState(false)

  // Coupon state. The discount is a PREVIEW — the server recomputes it
  // authoritatively at order placement, so the displayed total always matches
  // what the backend will charge.
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string
    discount_type: string
    discount_amount: number
    free_delivery: boolean
    summary: string
  } | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([])

  // Urgent (on-demand) delivery — a flat super-admin rate the customer can pick
  // instead of a time slot. It ignores free delivery + coupons (handled below).
  const [urgent, setUrgent] = useState(false)
  const [urgentInfo, setUrgentInfo] = useState<{ charge: number; eta: string; enabled: boolean }>({
    charge: 0, eta: '', enabled: false,
  })
  const [slotCutoffPercent, setSlotCutoffPercent] = useState(60)

  useEffect(() => {
    settingsApi
      .getDeliverySettings()
      .then((s: any) => {
        const charge = Number(s?.urgent_charge) || 0
        setUrgentInfo({ charge, eta: String(s?.urgent_eta || ''), enabled: charge > 0 })
        const cutoff = Number(s?.slot_cutoff_percent)
        if (Number.isFinite(cutoff)) setSlotCutoffPercent(cutoff)
      })
      .catch(() => {})
  }, [])

  const localSubtotal = getSubtotal()
  const selectedSlotObj = timeSlots.find(s => s.id === selectedTimeSlot)
  const isFreeDeliverySlot = selectedSlotObj?.is_free_delivery_slot === true
  const subtotal = serverSubtotal ?? localSubtotal
  // Local calc mirrors the backend rule (veg/fruit OR free-delivery slot) so
  // the UI is correct instantly. When the server confirms via
  // /cart/delivery-charge we use that value as the source of truth.
  const deliveryCharge = serverDeliveryCharge ?? getDeliveryCharge(isFreeDeliverySlot)
  const couponFreeDelivery = appliedCoupon?.free_delivery === true
  // Urgent orders never apply a coupon discount.
  const couponProductDiscount =
    !urgent && appliedCoupon && !couponFreeDelivery
      ? Math.min(Number(appliedCoupon.discount_amount) || 0, subtotal)
      : 0
  const effectiveDelivery = urgent
    ? urgentInfo.charge
    : couponFreeDelivery
    ? 0
    : deliveryCharge
  const total = Math.max(0, subtotal + effectiveDelivery - couponProductDiscount)

  // Sync the local cart to the server exactly ONCE per checkout visit. After
  // that we leave the server cart alone — quantity edits happen on the cart
  // page, this view is just the final checkout step.
  const syncCartToServer = useCallback(async () => {
    if (!isAuthenticated || items.length === 0 || cartSynced) return
    try {
      // ONE atomic request — replaces the old clear + per-item POST loop
      // (slow, and a mid-loop failure left a half-synced server cart).
      const snapshot = await cartApi.sync(
        items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit: item.unit || 'full',
          quality: item.quality || 'A',
        }))
      )
      const cart = snapshot?.cart
      if (cart?.subtotal != null) {
        setServerSubtotal(parseFloat(String(cart.subtotal)))
      }
      setCartSynced(true)
    } catch {
      setCartSynced(true) // don't keep retrying; local fallback takes over
    }
  }, [isAuthenticated, items, cartSynced])

  // Cheap second call: only refetch the delivery charge when the selected
  // time slot changes. No cart mutation, no per-item POST loop.
  const refetchDeliveryCharge = useCallback(async (timeSlotId: string) => {
    if (!isAuthenticated || !timeSlotId) {
      setServerDeliveryCharge(null)
      return
    }
    setDeliveryLoading(true)
    try {
      const delRes = await api.post('/cart/delivery-charge', { time_slot_id: timeSlotId })
      const delData = delRes.data?.data || delRes.data
      if (delData?.delivery_charge != null) {
        setServerDeliveryCharge(parseFloat(String(delData.delivery_charge)))
      } else {
        setServerDeliveryCharge(null)
      }
    } catch {
      setServerDeliveryCharge(null)
    } finally {
      setDeliveryLoading(false)
    }
  }, [isAuthenticated])

  // Latest-value ref: loadTimeSlots reads the cutoff through this so it can stay
  // referentially stable — including slotCutoffPercent in its deps would make
  // the load-effect below re-fetch (and reset the selected slot) the moment the
  // settings call lands.
  const slotCutoffRef = useRef(slotCutoffPercent)
  useEffect(() => {
    slotCutoffRef.current = slotCutoffPercent
  }, [slotCutoffPercent])

  const loadTimeSlots = useCallback(async (day: 'today' | 'tomorrow') => {
    setLoadingSlots(true)
    setSelectedTimeSlot('')
    try {
      const date = pktDateString(day)
      const slots = await settingsApi.getTimeSlots(date)
      setTimeSlots(slots)
      const firstAvailable = slots.find(
        (slot) => !getSlotAvailability(slot, day, slotCutoffRef.current, pktWallClock()).unavailable
      )
      if (firstAvailable) setSelectedTimeSlot(firstAvailable.id)
    } catch {
      setTimeSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  const loadAddresses = useCallback(async () => {
    try {
      const res = await addressesApi.getAll()
      const raw = (res as any).data || res
      const list: RealAddress[] = Array.isArray(raw) ? raw : []
      const filtered = selectedCity?.name
        ? list.filter((a) => addressMatchesSelectedCity(a.city, selectedCity.name))
        : list
      setAddresses(filtered)
      const def = filtered.find((a) => a.is_default) || filtered[0]
      if (def) setSelectedAddress(def.id)
      if (filtered.length === 0) setShowNewAddress(true)
    } catch {
      setShowNewAddress(true)
    } finally {
      setLoadingAddresses(false)
    }
  }, [selectedCity?.name])

  useEffect(() => {
    // Wait for persisted auth state to load from localStorage before loading
    // the authed-only data. Hard refresh sees `isAuthenticated` briefly false.
    if (!authHasHydrated) return
    // NOTE: Guests no longer reach this component — CheckoutPageWrapper renders
    // <GuestCheckout> (inline login / sign-up) for them instead of redirecting.
    // The old redirect is kept here, commented, so the previous behaviour can be
    // restored by reverting this change:
    //   if (!isAuthenticated) {
    //     router.push('/login?redirect=/checkout')
    //     return
    //   }
    if (!isAuthenticated) return
    loadAddresses()
    loadTimeSlots('today')
    // selectedCity?.id keyed on purpose: loadAddresses re-filters per city.
  }, [authHasHydrated, isAuthenticated, selectedCity?.id, loadAddresses, loadTimeSlots])

  // Sync the cart server-side exactly once. After that we only refetch the
  // delivery charge when the slot changes — this makes slot changes feel
  // instant instead of re-uploading the whole cart on every click.
  useEffect(() => {
    if (!isAuthenticated || items.length === 0 || cartSynced) return
    syncCartToServer()
  }, [isAuthenticated, items.length, cartSynced, syncCartToServer])

  // Re-price delivery only when the selected slot changes.
  useEffect(() => {
    if (!cartSynced || !selectedTimeSlot) return
    refetchDeliveryCharge(selectedTimeSlot)
  }, [cartSynced, selectedTimeSlot, refetchDeliveryCharge])

  const handleDayChange = (day: 'today' | 'tomorrow') => {
    setSelectedDay(day)
    loadTimeSlots(day)
    // Scroll back up to where the slots start so the newly loaded slots for the
    // chosen day are in view (the day buttons sit below the slot grid).
    requestAnimationFrame(() => {
      deliveryTimeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // User can place an order if either:
  //   1) A saved address is already selected, OR
  //   2) The inline "Add New" form is open and has the required fields
  //      (we'll auto-save it for them when they press Place Order).
  const canPlaceOrder =
    Boolean(selectedAddress) || (showNewAddress && newAddressValid)

  // Load the customer's auto-granted coupons (welcome-back / milestone) so they
  // can pick one at checkout. Fetching also evaluates fresh eligibility.
  useEffect(() => {
    if (!authHasHydrated || !isAuthenticated) return
    myCouponsApi
      .list()
      .then((res) => setMyCoupons(res.coupons || []))
      .catch(() => setMyCoupons([]))
  }, [authHasHydrated, isAuthenticated, selectedCity?.id])

  const applyCouponCode = async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setCouponLoading(true)
    setCouponError('')
    try {
      // Make sure the server cart reflects the current items before validating
      // the coupon against its subtotal.
      await cartApi.sync(
        items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit: item.unit || 'full',
          quality: item.quality || 'A',
        }))
      )
      const result = await cartApi.applyCoupon(trimmed)
      setAppliedCoupon(result)
      toast.success('Coupon applied')
    } catch (err: any) {
      setAppliedCoupon(null)
      setCouponError(
        err?.response?.data?.message || err?.message || 'Invalid coupon code'
      )
    } finally {
      setCouponLoading(false)
    }
  }

  const handleApplyCoupon = () => applyCouponCode(couponInput)

  const handleRemoveCoupon = async () => {
    try {
      await cartApi.removeCoupon()
    } catch {
      /* best-effort — clear locally regardless */
    }
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError('')
  }

  const handlePlaceOrder = async () => {
    setPlaceOrderError('')
    if (!urgent && !selectedTimeSlot) {
      setPlaceOrderError('Please select a delivery slot before placing your order.')
      return
    }
    if (!getSelectedCityId()) {
      setPlaceOrderError('Please select your city before placing your order.')
      return
    }

    const selectedSlot = timeSlots.find((s) => s.id === selectedTimeSlot)
    if (
      !urgent &&
      selectedSlot &&
      (selectedSlot.available_slots <= 0 ||
        getSlotAvailability(selectedSlot, selectedDay, slotCutoffPercent, pktWallClock()).unavailable)
    ) {
      toast.error('Selected time slot is no longer available. Please pick another.')
      return
    }

    // Auto-save inline new-address form (door photo + map pin — no Done/Save required).
    let addressIdToUse = selectedAddress
    if (showNewAddress && newAddressValid) {
      if (!newAddressFormRef.current) {
        toast.error('Please add a delivery address')
        return
      }
      setIsPlacingOrder(true)
      const saved = await newAddressFormRef.current.submit()
      if (!saved?.id) {
        setIsPlacingOrder(false)
        return
      }
      addressIdToUse = saved.id
      setSelectedAddress(saved.id)
      setAddresses((prev) => {
        const exists = prev.some((a) => a.id === saved.id)
        return exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved]
      })
    }

    if (!addressIdToUse) {
      toast.error('Please select a delivery address')
      return
    }

    setIsPlacingOrder(true)
    try {
      // Make sure the server-side cart still has our items (the user could
      // have changed cart contents on a different tab). One atomic sync,
      // right before placing the order — slot changes never trigger this.
      await cartApi.sync(
        items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit: item.unit || 'full',
          quality: item.quality || 'A',
        }))
      )

      const orderPayload: Record<string, string> = {
        address_id: addressIdToUse,
        payment_method: 'cash_on_delivery',
        customer_notes: '',
      }
      const serviceCityId = getSelectedCityId()
      if (serviceCityId) {
        orderPayload.city_id = serviceCityId
      }
      if (urgent) {
        orderPayload.urgent_delivery = 'true'
      } else {
        if (selectedDay === 'tomorrow') {
          orderPayload.requested_delivery_date = pktDateString('tomorrow')
        }
        if (selectedTimeSlot) {
          orderPayload.time_slot_id = selectedTimeSlot
        }
      }

      const orderRes = await api.post('/orders', orderPayload)
      const orderData = orderRes.data?.data || orderRes.data
      const order = orderData?.order || orderData

      setOrderPlaced(true)
      setPlacedOrder({
        id: order?.id || '',
        order_number: order?.order_number ?? null,
        total_amount:
          order?.total_amount != null ? parseFloat(String(order.total_amount)) : null,
      })
      clearCart()
      // We deliberately DON'T router.push here — we show an inline success
      // modal with two clear CTAs (Continue Shopping / View Order) instead.
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to place order. Please try again.'
      toast.error(msg)
    } finally {
      setIsPlacingOrder(false)
    }
  }

  // Don't redirect to /cart on the very first render while the cart store
  // is still hydrating from localStorage — items[] starts empty and would
  // bounce a refresh straight to /cart even when the user has items saved.
  useEffect(() => {
    if (cartHasHydrated && items.length === 0 && !orderPlaced) {
      router.push('/cart')
    }
  }, [cartHasHydrated, items.length, orderPlaced, router])

  if (cartHasHydrated && items.length === 0 && !orderPlaced) {
    return null
  }
  if (!cartHasHydrated || !authHasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Success modal — shown after Place Order returns. Two clear CTAs so
          the customer can either keep shopping or jump to the order detail. */}
      {orderPlaced && placedOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Order placed successfully!
            </h2>
            <p className="text-sm text-gray-600 mb-1">
              Thank you — your order has been received.
            </p>
            {placedOrder.order_number && (
              <p className="text-sm text-gray-500 mb-4">
                Order #
                <span className="font-semibold text-gray-700">
                  {placedOrder.order_number}
                </span>
                {placedOrder.total_amount != null && (
                  <>
                    {' '}· Total{' '}
                    <span className="font-semibold text-gray-700">
                      {formatPriceShort(placedOrder.total_amount)}
                    </span>
                  </>
                )}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Button
                variant="outline"
                fullWidth
                onClick={() => router.push('/products')}
              >
                <ShoppingBag className="w-4 h-4 mr-2" />
                Continue Shopping
              </Button>
              <Button
                fullWidth
                onClick={() =>
                  router.push(`/track/${placedOrder.id || 'success'}`)
                }
              >
                View Order
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="container mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
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
                        <div
                          key={address.id}
                          className={`p-4 border-2 rounded-xl transition-colors ${
                            selectedAddress === address.id
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <label className="flex items-start gap-3 cursor-pointer">
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
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium capitalize">{address.address_type}</span>
                                {address.is_default && (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                    Default
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-600 text-sm mt-1">
                                {[address.written_address, address.area_name, address.city]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            </div>
                          </label>
                          <AddressActions
                            address={address}
                            availableCities={serviceCities}
                            onUpdated={(updated) => {
                              setAddresses((prev) =>
                                prev.map((a) =>
                                  a.id === updated.id ? { ...a, ...updated } : a
                                )
                              )
                            }}
                            onDeleted={(deletedId) => {
                              setAddresses((prev) => {
                                const next = prev.filter((a) => a.id !== deletedId)
                                if (selectedAddress === deletedId) {
                                  const fallback =
                                    next.find((a) => a.is_default) || next[0]
                                  setSelectedAddress(fallback?.id || '')
                                  if (next.length === 0) setShowNewAddress(true)
                                }
                                return next
                              })
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add New Address */}
                  <button
                    onClick={() => {
                      const next = !showNewAddress
                      setShowNewAddress(next)
                      if (next) setSelectedAddress('')
                    }}
                    className="flex items-center gap-2 text-primary-600 font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    Add New Address
                  </button>

                  {/* New Address Form — uses the same AddressForm component
                      as Edit, so door picture + GPS map are available too.
                      We keep the explicit Save button so users CAN save up
                      front, but Place Order will also auto-save via the
                      ref when the required fields are filled. */}
                  {showNewAddress && (
                    <div className="mt-4 pt-4 border-t">
                      <AddressForm
                        ref={newAddressFormRef}
                        availableCities={serviceCities}
                        defaultOnCreate={addresses.length === 0}
                        onValidityChange={setNewAddressValid}
                        onSaved={(saved) => {
                          setAddresses((prev) => {
                            const exists = prev.some((a) => a.id === saved.id)
                            return exists
                              ? prev.map((a) => (a.id === saved.id ? saved : a))
                              : [...prev, saved]
                          })
                          setSelectedAddress(saved.id)
                          setShowNewAddress(false)
                        }}
                        onCancel={
                          addresses.length > 0
                            ? () => setShowNewAddress(false)
                            : undefined
                        }
                      />
                      <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                        Door photo, map pin, and address text are saved when you press{' '}
                        <strong>Place Order</strong> — no need to tap Done on the map or Save here.
                      </p>
                    </div>
                  )}
                </>
              )}
            </motion.div>

            {/* Delivery Time */}
            <motion.div
              ref={deliveryTimeRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl p-6 shadow-sm scroll-mt-24"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold">Delivery Time</h2>
              </div>

              {urgentInfo.enabled && (
                <div className="mb-5">
                  <button
                    type="button"
                    onClick={() => setUrgent((v) => !v)}
                    className={`w-full flex items-center justify-between rounded-xl border-2 p-4 transition-colors ${
                      urgent ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <span className="flex items-center gap-3 text-left">
                      <Zap className={`w-5 h-5 ${urgent ? 'text-amber-600' : 'text-gray-400'}`} />
                      <span>
                        <span className="block font-semibold text-gray-900">Urgent delivery</span>
                        <span className="block text-xs text-gray-500">
                          {urgentInfo.eta ? `Approx. ${urgentInfo.eta}` : 'Fastest available'} · no time slot needed
                        </span>
                      </span>
                    </span>
                    <span className="font-bold text-amber-600">{formatPriceShort(urgentInfo.charge)}</span>
                  </button>
                  {urgent && (
                    <p className="mt-2 text-xs text-amber-700">
                      Free-delivery offers and coupons don&apos;t apply to urgent delivery.
                    </p>
                  )}
                </div>
              )}

              {!urgent && (
              <>
              <p className="text-sm font-medium text-gray-800 mb-4">
                {selectedDay === 'today'
                  ? 'Today available time slots'
                  : 'Tomorrow time slots'}
              </p>

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
                    const availability = getSlotAvailability(slot, selectedDay, slotCutoffPercent, pktWallClock())
                    const slotDisabled =
                      slot.available_slots <= 0 || availability.unavailable
                    return (
                      <label
                        key={slot.id}
                        className={`flex flex-col items-center p-4 border-2 rounded-xl transition-colors ${
                          slotDisabled
                            ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50'
                            : selectedTimeSlot === slot.id
                            ? 'border-primary-500 bg-primary-50 cursor-pointer'
                            : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                        }`}
                      >
                        <input
                          type="radio"
                          name="timeSlot"
                          value={slot.id}
                          checked={selectedTimeSlot === slot.id}
                          onChange={(e) => setSelectedTimeSlot(e.target.value)}
                          disabled={slotDisabled}
                          className="sr-only"
                        />
                        <Clock className={`w-6 h-6 mb-2 ${slotDisabled ? 'text-gray-400' : 'text-primary-600'}`} />
                        <span className="font-medium text-center text-sm">
                          <SlotTimeLabel startTime={slot.start_time} endTime={slot.end_time} />
                        </span>
                        {slot.is_free_delivery_slot && !slotDisabled && (
                          <span className="text-xs text-green-600 mt-1">FREE DELIVERY</span>
                        )}
                        {slot.available_slots <= 0 && (
                          <span className="text-xs text-red-500 mt-1">FULL</span>
                        )}
                        {availability.unavailable && slot.available_slots > 0 && (
                          <span className="text-xs text-gray-500 mt-1">
                            {availability.reason === 'expired' ? 'Passed' : 'Unavailable'}
                          </span>
                        )}
                      </label>
                    )
                  })
                )}
              </div>

              <div className="flex gap-3 mt-6">
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
                    <span className="text-xs opacity-75">{pktDisplayDate(day)}</span>
                  </button>
                ))}
              </div>
              </>
              )}
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
                {items.map((item) => {
                  const unit = item.unit || 'full'
                  const unitSuffix = unitLabelShort(unit)
                  const linePrice = resolveLineUnitPrice(item)
                  const caption = unitPriceCaption(unit)
                  return (
                    <div
                      key={`${item.product.id}::${unit}::${item.quality ?? 'A'}`}
                      className="flex items-center gap-3"
                    >
                      <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        <Image
                          src={item.product.image || item.product.image_url || '/placeholder-product.svg'}
                          alt={item.product.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.product.name}
                          {unitSuffix && (
                            <span className="ml-1 text-[11px] text-primary-700 font-semibold">
                              ({unitSuffix})
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 inline-flex items-baseline gap-1 flex-wrap">
                          {item.quantity} x {formatPriceShort(linePrice)}
                          {unit === 'full' ? (
                            <span className="text-[10px] text-gray-400">
                              {formatProductUnitSuffix(item.product.unit)}
                            </span>
                          ) : (
                            caption && (
                              <span className="text-[10px] text-primary-700 font-medium">
                                {caption}
                              </span>
                            )
                          )}
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {formatPriceShort(linePrice * item.quantity)}
                      </p>
                    </div>
                  )
                })}
              </div>

              {/* Coupon */}
              <div className="mb-6 border-t pt-4">
                {appliedCoupon ? (
                  <div className="flex items-start justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-green-700 flex items-center gap-1 min-w-0">
                        <Ticket className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{appliedCoupon.code} applied</span>
                      </p>
                      {appliedCoupon.summary && (
                        <p className="text-xs text-green-700/80 mt-0.5 break-words">
                          {appliedCoupon.summary}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="text-green-700 hover:text-green-900 p-1 shrink-0"
                      aria-label="Remove coupon"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                      <Ticket className="w-4 h-4 text-primary-600 shrink-0" />
                      Have a coupon?
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value.toUpperCase())
                          if (couponError) setCouponError('')
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleApplyCoupon()
                          }
                        }}
                        placeholder="Enter code"
                        className="flex-1 min-w-0 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={handleApplyCoupon}
                        isLoading={couponLoading}
                        disabled={!couponInput.trim() || couponLoading}
                      >
                        Apply
                      </Button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-500 mt-1.5 break-words">{couponError}</p>
                    )}

                    {myCoupons.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Your coupons</p>
                        <div className="space-y-2">
                          {myCoupons.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              disabled={couponLoading}
                              onClick={() => {
                                setCouponInput(c.code)
                                applyCouponCode(c.code)
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-2 text-left hover:bg-primary-50 disabled:opacity-60"
                            >
                              <span className="min-w-0">
                                <span className="block font-mono text-sm font-semibold text-primary-700">
                                  {c.code}
                                </span>
                                <span className="block text-xs text-gray-600 break-words">
                                  {c.summary}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs font-semibold text-primary-600">
                                Apply
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-3 mb-6 border-t pt-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPriceShort(subtotal)}</span>
                </div>
                {couponProductDiscount > 0 && (
                  <div className="flex justify-between items-center gap-2 text-green-600 font-medium">
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <Ticket className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Coupon ({appliedCoupon?.code})</span>
                    </span>
                    <span className="shrink-0">-{formatPriceShort(couponProductDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-gray-600">
                  <span>Delivery</span>
                  <span
                    className={`inline-flex items-center gap-1 ${
                      effectiveDelivery === 0 ? 'text-green-600 font-semibold' : ''
                    }`}
                  >
                    {deliveryLoading && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                    )}
                    {effectiveDelivery === 0
                      ? couponFreeDelivery
                        ? 'FREE (coupon)'
                        : 'FREE'
                      : formatPriceShort(effectiveDelivery)}
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
              {placeOrderError && (
                <p className="mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
                  {placeOrderError}
                </p>
              )}
              <Button
                onClick={handlePlaceOrder}
                fullWidth
                size="lg"
                isLoading={isPlacingOrder}
                disabled={!canPlaceOrder || isPlacingOrder}
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
