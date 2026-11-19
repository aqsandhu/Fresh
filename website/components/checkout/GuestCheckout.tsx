'use client'

import CheckoutAuthPanel from '@/components/checkout/CheckoutAuthPanel'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'
import { formatPriceShort } from '@/lib/utils'
import { resolveLineUnitPrice } from '@/lib/unitPricing'

// Guest view: the same "Checkout" heading + a slim order-summary preview (from
// the LOCAL cart — no server session needed) alongside the inline auth panel.
// Address / time / payment intentionally appear only AFTER sign-in (they need
// an authenticated session), and the checkout guidance tips are deliberately
// NOT shown here — guests see login/sign-up tips inside the panel instead, so
// the two instruction sets never overlap or contradict.
export default function GuestCheckout() {
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
