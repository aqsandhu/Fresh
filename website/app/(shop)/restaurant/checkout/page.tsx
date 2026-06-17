'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MapPin, CreditCard, Receipt, Loader2, ShoppingCart, UtensilsCrossed } from 'lucide-react'
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

export default function RestaurantCheckoutPage() {
  const router = useRouter()
  const [info, setInfo] = useState<RestaurantInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [notes, setNotes] = useState('')
  const [placing, setPlacing] = useState(false)

  const {
    items, getSubtotal, getDeliveryCharge, getFinalTotal, clearCart, loadDeliverySettings,
  } = useRestaurantCartStore()

  useEffect(() => {
    const i = getRestaurantInfo()
    if (!i) {
      router.replace('/restaurant/login')
      return
    }
    setInfo(i)
    setReady(true)
    loadDeliverySettings()
  }, [router, loadDeliverySettings])

  const subtotal = getSubtotal()
  const deliveryCharge = getDeliveryCharge()
  const total = getFinalTotal()

  const placeOrder = async () => {
    if (items.length === 0) return toast.error('Your cart is empty')
    setPlacing(true)
    try {
      await restaurantShopApi.placeOrder(
        items.map((l) => ({ product_id: l.product.id, quantity: l.quantity, unit: l.unit, quality: l.quality })),
        notes.trim() || undefined
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
            {/* Delivery address (restaurant's own) */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold">Delivery Address</h2>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-4 h-4 text-primary-600" /> {info?.business_name}
                </p>
                {info?.address && <p className="text-sm text-gray-600 mt-1">{info.address}</p>}
                <p className="text-sm text-gray-500 mt-1">{info?.city}{info?.phone ? ` · ${info.phone}` : ''}</p>
              </div>
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
