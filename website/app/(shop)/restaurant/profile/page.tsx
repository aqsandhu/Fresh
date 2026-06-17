'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UtensilsCrossed, LogOut, Store, ClipboardList, Phone, MapPin } from 'lucide-react'
import {
  getRestaurantInfo, clearRestaurantSession, type RestaurantInfo,
} from '@/lib/restaurantSession'
import RestaurantMobileNav from '@/components/restaurant/RestaurantMobileNav'

export default function RestaurantProfilePage() {
  const router = useRouter()
  const [info, setInfo] = useState<RestaurantInfo | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const i = getRestaurantInfo()
    if (!i) {
      router.replace('/restaurant/login')
      return
    }
    setInfo(i)
    setReady(true)
  }, [router])

  const logout = () => {
    clearRestaurantSession()
    router.replace('/restaurant/login')
  }

  if (!ready) return null

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <UtensilsCrossed className="w-7 h-7" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{info?.business_name}</h1>
              {info?.status && (
                <span className="inline-block mt-0.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 capitalize">
                  {info.status}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-700">
            {info?.owner_name && <p>{info.owner_name}</p>}
            <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {info?.phone}</p>
            {info?.city && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> {info.city}</p>}
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <Link href="/restaurant/shop" className="flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm hover:border-primary-300">
            <Store className="w-5 h-5 text-primary-600" />
            <span className="font-medium text-gray-800">Browse catalog</span>
          </Link>
          <Link href="/restaurant/orders" className="flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm hover:border-primary-300">
            <ClipboardList className="w-5 h-5 text-primary-600" />
            <span className="font-medium text-gray-800">My orders</span>
          </Link>
          <button onClick={logout} className="flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm hover:border-red-300 text-left">
            <LogOut className="w-5 h-5 text-red-500" />
            <span className="font-medium text-red-600">Logout</span>
          </button>
        </div>
      </div>

      <RestaurantMobileNav />
    </div>
  )
}
