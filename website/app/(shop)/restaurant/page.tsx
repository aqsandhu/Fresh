'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UtensilsCrossed, LogOut, Home } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  getRestaurantInfo,
  clearRestaurantSession,
  type RestaurantInfo,
} from '@/lib/restaurantSession'

export default function RestaurantHomePage() {
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
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <UtensilsCrossed className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{info?.business_name}</h1>
              <p className="text-sm text-gray-500">{info?.phone}</p>
            </div>
          </div>

          <div className="rounded-lg bg-primary-50 border border-primary-100 px-4 py-3 text-sm text-primary-800">
            You are logged in as a restaurant. The restaurant storefront (catalog, quality
            selection, cart & checkout with restaurant rates) is rolling out next.
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/">
              <Button variant="outline"><Home className="w-4 h-4 mr-1.5" /> Home</Button>
            </Link>
            <Button variant="outline" onClick={logout}>
              <LogOut className="w-4 h-4 mr-1.5" /> Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
