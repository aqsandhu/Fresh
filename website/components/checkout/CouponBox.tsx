'use client'

// Checkout coupon box (moved out of the checkout page, W21): the applied
// coupon with Remove, or a code box plus the customer's own coupons. The
// discount shown is a preview — the server recomputes it on Place Order.
import { Ticket, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { type MyCoupon } from '@/lib/api'
import type { AppliedCoupon } from './checkoutTypes'

export default function CouponBox({
  appliedCoupon,
  couponInput,
  setCouponInput,
  couponError,
  setCouponError,
  couponLoading,
  myCoupons,
  handleApplyCoupon,
  applyCouponCode,
  handleRemoveCoupon,
}: {
  appliedCoupon: AppliedCoupon | null
  couponInput: string
  setCouponInput: (code: string) => void
  couponError: string
  setCouponError: (message: string) => void
  couponLoading: boolean
  myCoupons: MyCoupon[]
  handleApplyCoupon: () => void
  applyCouponCode: (code: string) => void
  handleRemoveCoupon: () => void
}) {
  return (
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
          <label htmlFor="checkout-field-1" className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Ticket className="w-4 h-4 text-primary-600 shrink-0" />
            Have a coupon?
          </label>
          <div className="flex gap-2">
            <input id="checkout-field-1"
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
  )
}
