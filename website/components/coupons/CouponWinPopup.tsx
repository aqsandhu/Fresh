'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Ticket, X, Gift } from 'lucide-react'
import { myCouponsApi, type MyCoupon } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'

/**
 * One-time "you earned a coupon" popup. Shows the customer's unseen
 * auto-granted coupons (welcome-back / milestone) after they log in, then
 * marks them seen so it doesn't repeat.
 */
export default function CouponWinPopup() {
  const { isAuthenticated, hasHydrated } = useAuthStore()
  const [coupons, setCoupons] = useState<MyCoupon[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return
    let cancelled = false
    myCouponsApi
      .list()
      .then((res) => {
        if (cancelled) return
        if (res.unseen && res.unseen.length > 0) {
          setCoupons(res.unseen)
          setOpen(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hasHydrated, isAuthenticated])

  const close = () => {
    setOpen(false)
    myCouponsApi.markSeen().catch(() => {})
  }

  if (!open || coupons.length === 0) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
          <Gift className="h-7 w-7 text-primary-600" />
        </div>
        <h2 className="text-center text-xl font-bold text-gray-900">
          {coupons.length > 1 ? "You've earned coupons!" : "You've earned a coupon!"}
        </h2>
        <p className="mt-1 text-center text-sm text-gray-500">
          Use {coupons.length > 1 ? 'them' : 'it'} at checkout to save on your next order.
        </p>

        <div className="mt-4 space-y-2">
          {coupons.map((c) => (
            <div
              key={c.code}
              className="rounded-xl border border-dashed border-primary-300 bg-primary-50/60 px-4 py-3"
            >
              <p className="flex items-center gap-1.5 font-mono text-base font-bold text-primary-700">
                <Ticket className="h-4 w-4 shrink-0" />
                {c.code}
              </p>
              <p className="mt-0.5 text-xs text-gray-600 break-words">{c.summary}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Maybe later
          </button>
          <Link
            href="/cart"
            onClick={close}
            className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-700"
          >
            Shop now
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
