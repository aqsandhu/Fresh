'use client'

// The "order placed" box shown after Place Order (moved out of the checkout
// page, W21): two clear next steps — keep shopping or open the order.
import type { Ref } from 'react'
import { useRouter } from 'next/navigation'
import { m } from 'framer-motion'
import { CheckCircle2, ArrowRight, ShoppingBag } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatPriceShort } from '@/lib/utils'
import type { PlacedOrder } from './checkoutTypes'

export default function OrderPlacedDialog({
  placedOrder,
  successRef,
}: {
  placedOrder: PlacedOrder
  /** From useDialog — focus moves in, Escape opens the order (G31). */
  successRef: Ref<HTMLDivElement>
}) {
  const router = useRouter()
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
      <m.div
        ref={successRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-placed-title"
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 id="order-placed-title" className="text-2xl font-bold text-gray-900 mb-2">
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
      </m.div>
    </div>
  )
}
