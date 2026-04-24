'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Heart, 
  ShoppingCart, 
  Trash2, 
  ArrowRight,
  Loader2,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { useCartStore } from '@/store/cartStore'
import { formatPriceShort } from '@/lib/utils'
import { productsApi } from '@/lib/api'
import { Product } from '@/types'

interface WishlistItem {
  id: string
  product: Product
  addedAt: string
}

export default function WishlistPage() {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const { addItem } = useCartStore()

  useEffect(() => {
    loadWishlist()
  }, [])

  const loadWishlist = async () => {
    try {
      // Try to fetch from API first
      const response = await productsApi.getAll({})
      // For now, use localStorage as fallback
      const savedWishlist = localStorage.getItem('freshbazar-wishlist')
      if (savedWishlist) {
        const parsed = JSON.parse(savedWishlist)
        setWishlistItems(parsed)
      }
    } catch (error) {
      // Fallback to localStorage
      const savedWishlist = localStorage.getItem('freshbazar-wishlist')
      if (savedWishlist) {
        setWishlistItems(JSON.parse(savedWishlist))
      }
    } finally {
      setLoading(false)
    }
  }

  const saveWishlist = (items: WishlistItem[]) => {
    localStorage.setItem('freshbazar-wishlist', JSON.stringify(items))
    setWishlistItems(items)
  }

  const removeFromWishlist = (itemId: string) => {
    const updated = wishlistItems.filter(item => item.id !== itemId)
    saveWishlist(updated)
    toast.success('Removed from wishlist')
  }

  const addToCart = (product: Product) => {
    addItem(product, 1)
    toast.success(`${product.name} added to cart`)
  }

  const clearWishlist = () => {
    if (confirm('Are you sure you want to clear your wishlist?')) {
      saveWishlist([])
      toast.success('Wishlist cleared')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-600">Loading wishlist...</span>
          </div>
        </div>
      </div>
    )
  }

  if (wishlistItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            My Wishlist
          </h1>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-12 shadow-sm text-center"
          >
            <Heart className="w-20 h-20 text-gray-300 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Your Wishlist is Empty
            </h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Save your favorite items to your wishlist and easily find them later.
            </p>
            <Link href="/">
              <Button size="lg">
                Start Shopping
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            My Wishlist ({wishlistItems.length})
          </h1>
          <button
            onClick={clearWishlist}
            className="text-red-600 hover:text-red-700 flex items-center gap-2"
          >
            <Trash2 className="w-5 h-5" />
            Clear All
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {wishlistItems.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-xl shadow-sm overflow-hidden group"
            >
              <div className="relative aspect-square bg-gray-100">
                <Image
                  src={item.product.image || item.product.image_url || '/placeholder-product.png'}
                  alt={item.product.name}
                  fill
                  className="object-cover"
                />
                <button
                  onClick={() => removeFromWishlist(item.id)}
                  className="absolute top-3 right-3 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                >
                  <Trash2 className="w-5 h-5 text-red-500" />
                </button>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1">
                  {item.product.name}
                </h3>
                <p className="text-gray-500 text-sm mb-3">
                  {item.product.unit}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-primary-600">
                    {formatPriceShort(item.product.price)}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => addToCart(item.product)}
                    disabled={item.product.stock === 0}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
