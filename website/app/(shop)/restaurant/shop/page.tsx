'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UtensilsCrossed, ShoppingCart, Loader2, ClipboardList, User, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { getRestaurantInfo } from '@/lib/restaurantSession'
import { restaurantShopApi } from '@/lib/restaurantApi'
import { money, type RestaurantProduct } from '@/lib/restaurantPricing'
import { useRestaurantCartStore } from '@/store/restaurantCartStore'
import RestaurantProductCard from '@/components/restaurant/RestaurantProductCard'
import RestaurantMobileNav from '@/components/restaurant/RestaurantMobileNav'

export default function RestaurantShopPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<any[]>([])
  const [products, setProducts] = useState<RestaurantProduct[]>([])
  const [activeCat, setActiveCat] = useState<string>('')

  const { getTotalItems, getFinalTotal, loadDeliverySettings } = useRestaurantCartStore()
  const cartCount = getTotalItems()
  const cartTotal = getFinalTotal()

  useEffect(() => {
    if (!getRestaurantInfo()) {
      router.replace('/restaurant/login')
      return
    }
    setReady(true)
    loadDeliverySettings()
    ;(async () => {
      try {
        const [cats, prods] = await Promise.all([
          restaurantShopApi.getCategories(),
          restaurantShopApi.getProducts(),
        ])
        setCategories(cats || [])
        setProducts(prods || [])
      } catch (e: any) {
        if (e?.status === 401) router.replace('/restaurant/login')
        else toast.error(e?.message || 'Could not load the restaurant catalog')
      } finally {
        setLoading(false)
      }
    })()
  }, [router, loadDeliverySettings])

  const loadCategory = async (catId: string) => {
    setActiveCat(catId)
    setLoading(true)
    try {
      setProducts((await restaurantShopApi.getProducts(catId || undefined)) || [])
    } catch (e: any) {
      toast.error(e?.message || 'Could not load products')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) return null
  const info = getRestaurantInfo()

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <UtensilsCrossed className="w-5 h-5 text-primary-600 shrink-0" />
            <span className="font-bold text-gray-900 truncate">{info?.business_name}</span>
            <span className="text-xs text-gray-400 hidden sm:inline">Restaurant store</span>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <Link href="/restaurant/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600">
              <ClipboardList className="w-4 h-4" /> Orders
            </Link>
            <Link href="/restaurant/profile" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600">
              <User className="w-4 h-4" /> Profile
            </Link>
            <Link href="/restaurant/cart" className="relative inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600">
              <ShoppingCart className="w-4 h-4" /> Cart
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-3 w-4 h-4 bg-primary-600 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">
        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
          <CatChip label="All" active={activeCat === ''} onClick={() => loadCategory('')} />
          {categories.map((c) => (
            <CatChip key={c.id} label={c.name_en} active={activeCat === c.id} onClick={() => loadCategory(c.id)} />
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No products in this catalog yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((p) => (
              <RestaurantProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>

      {/* Floating View Cart bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-16 lg:bottom-4 left-0 right-0 z-40 px-4">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/restaurant/cart"
              className="flex items-center justify-between gap-3 rounded-xl bg-primary-600 text-white px-5 py-3.5 shadow-lg hover:bg-primary-700"
            >
              <span className="flex items-center gap-2 font-semibold">
                <ShoppingCart className="w-5 h-5" />
                {cartCount} item{cartCount > 1 ? 's' : ''} · {money(cartTotal)}
              </span>
              <span className="flex items-center gap-1 font-bold">
                View Cart <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </div>
      )}

      <RestaurantMobileNav />
    </div>
  )
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold border transition-colors shadow-sm ${
        active
          ? 'bg-primary-600 text-white border-primary-600'
          : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
      }`}
    >
      {label}
    </button>
  )
}
