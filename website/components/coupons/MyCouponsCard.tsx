'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Ticket } from 'lucide-react'
import { myCouponsApi, type MyCoupon } from '@/lib/api'

/** "My Coupons" section for the profile page — the customer's available coupons. */
export default function MyCouponsCard() {
  const [coupons, setCoupons] = useState<MyCoupon[] | null>(null)

  useEffect(() => {
    myCouponsApi
      .list()
      .then((res) => setCoupons(res.coupons || []))
      .catch(() => setCoupons([]))
  }, [])

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Ticket className="h-5 w-5 text-primary-600" />
        <h2 className="text-xl font-semibold">My Coupons</h2>
      </div>

      {coupons === null ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-gray-500">
          You have no coupons right now. Keep ordering — loyalty and welcome-back rewards show up
          here automatically.
        </p>
      ) : (
        <div className="space-y-2">
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
          <Link
            href="/cart"
            className="mt-1 inline-block text-sm font-medium text-primary-600 hover:underline"
          >
            Use at checkout →
          </Link>
        </div>
      )}
    </div>
  )
}
