'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardList, Loader2, ArrowLeft } from 'lucide-react'
import { getRestaurantInfo } from '@/lib/restaurantSession'
import { restaurantShopApi } from '@/lib/restaurantApi'
import { money } from '@/lib/restaurantPricing'

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-indigo-100 text-indigo-800',
  ready_for_pickup: 'bg-purple-100 text-purple-800',
  out_for_delivery: 'bg-cyan-100 text-cyan-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function RestaurantOrdersPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])

  useEffect(() => {
    if (!getRestaurantInfo()) {
      router.replace('/restaurant/login')
      return
    }
    setReady(true)
    ;(async () => {
      try {
        setOrders(await restaurantShopApi.getOrders())
      } catch (e: any) {
        if (e?.status === 401) router.replace('/restaurant/login')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  if (!ready) return null

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <Link href="/restaurant/shop" className="text-gray-500 hover:text-primary-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary-600" /> My Orders
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            No orders yet.{' '}
            <Link href="/restaurant/shop" className="text-primary-600 font-medium">Start ordering</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900">#{o.order_number}</p>
                    <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleString('en-PK')}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[o.status] || 'bg-gray-100 text-gray-700'}`}>
                    {String(o.status || '').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  {(o.items || []).map((it: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span>
                        {it.product_name}{' '}
                        <span className="text-gray-400">· Q{it.quality} · {it.unit?.replace('_', ' ')} × {it.quantity}</span>
                      </span>
                      <span>{money(Number(it.total_price) || 0)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                  <span className="text-gray-500">Delivery {money(Number(o.delivery_charge) || 0)}</span>
                  <span className="font-bold text-gray-900">Total {money(Number(o.total_amount) || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
