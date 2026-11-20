'use client'

import { m } from 'framer-motion'
import { Heart, ShoppingCart, Trash2, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { useAuthStore, useCartStore } from '@/store/cartStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { useCityContext } from '@/context/CityContext'
import { productsApi, wishlistApi } from '@/lib/api'
import ProductPrice from '@/components/ui/ProductPrice'
import { Product } from '@/types'

// The wishlist (W22): ids kept with the account when signed in (on this device
// for a guest); the details — price, stock — come live from this city's
// product list, so a product no longer sold here simply does not show.
export default function WishlistPage() {
  const ids = useWishlistStore((s) => s.ids)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { selectedCityId } = useCityContext()
  const { addItem } = useCartStore()

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['wishlist-products', selectedCityId, ids],
    queryFn: () => productsApi.getByIds(ids, selectedCityId as string),
    enabled: !!selectedCityId && ids.length > 0,
  })
  // Keep the customer's order (newest first).
  const shown = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p))

  const remove = async (product: Product) => {
    try {
      await useWishlistStore.getState().toggle(product.id, isAuthenticated)
      toast.success('Removed from wishlist')
    } catch {
      toast.error('Could not update your wishlist — check your connection and try again')
    }
  }

  const addToCart = (product: Product) => {
    addItem(product, 1)
    toast.success(`${product.name} added to cart`)
  }

  const clearWishlist = async () => {
    if (!confirm('Are you sure you want to clear your wishlist?')) return
    const all = useWishlistStore.getState().ids
    try {
      if (isAuthenticated) await Promise.all(all.map((id) => wishlistApi.remove(id)))
      useWishlistStore.getState().replace([])
      toast.success('Wishlist cleared')
    } catch {
      toast.error('Could not clear your wishlist — check your connection and try again')
    }
  }

  const where = isAuthenticated
    ? 'Saved to your account — the same list on every device.'
    : 'Saved on this device. Sign in to keep it on every device.'

  if (ids.length > 0 && isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center py-20" role="status">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-600">Loading wishlist...</span>
          </div>
        </div>
      </div>
    )
  }

  if (shown.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">My Wishlist</h1>
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-12 shadow-sm text-center"
          >
            <Heart className="w-20 h-20 text-gray-300 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Wishlist is Empty</h2>
            <p className="text-gray-600 mb-2 max-w-md mx-auto">
              Save your favorite items to your wishlist and easily find them later.
            </p>
            <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">{where}</p>
            <Link href="/">
              <Button size="lg">
                Start Shopping
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </m.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">My Wishlist ({shown.length})</h1>
            <p className="text-sm text-gray-500 mt-1">{where}</p>
          </div>
          <button onClick={clearWishlist} className="text-red-600 hover:text-red-700 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Clear All
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shown.map((product, index) => (
            <m.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-xl shadow-sm overflow-hidden"
            >
              <div className="relative aspect-square bg-gray-100">
                <Image
                  src={product.image || product.image_url || '/placeholder-product.svg'}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
                <button
                  onClick={() => remove(product)}
                  aria-label={`Remove ${product.name} from wishlist`}
                  className="absolute top-3 right-3 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md hover:bg-red-50"
                >
                  <Trash2 className="w-5 h-5 text-red-500" />
                </button>
              </div>
              <div className="p-4">
                <Link href={`/product/${product.id}`} className="font-semibold text-gray-900 mb-3 block hover:text-primary-600">
                  {product.name}
                </Link>
                <div className="flex items-center justify-between">
                  <ProductPrice price={product.price} unit={product.unit} size="lg" />
                  <Button
                    size="sm"
                    onClick={() => addToCart(product)}
                    disabled={!(product.inStock ?? (product.stock ?? product.stock_quantity ?? 0) > 0)}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>
            </m.div>
          ))}
        </div>
      </div>
    </div>
  )
}
