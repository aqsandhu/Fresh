'use client'

import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Trash2, Leaf } from 'lucide-react'
import { Product } from '@/types'
import { formatPriceShort } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import Badge from './Badge'
import SmartImage from './SmartImage'
import toast from 'react-hot-toast'

interface ProductCardProps {
  product: Product
  showAddToCart?: boolean
}

// Inline visual fallback when no image is set or the image fails to load.
// Defined as a constant so SmartImage's `fallback` prop is referentially
// stable across renders (no per-card object churn).
function ImageFallback() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
      <ShoppingCart className="w-10 h-10 mb-1" />
      <span className="text-xs text-gray-400">No Image</span>
    </div>
  )
}

export default function ProductCard({ product, showAddToCart = true }: ProductCardProps) {
  const { addItem, updateQuantity, items } = useCartStore()
  const cartItem = items.find((item) => item.product.id === product.id)
  const quantity = cartItem?.quantity || 0

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addItem(product, 1)
    toast.success(`${product.name} added to cart`, { duration: 2000, icon: '🛒' })
  }

  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    updateQuantity(product.id, quantity + 1)
  }

  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    updateQuantity(product.id, quantity - 1)
  }

  const discountPercent = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      {/* Equal-height card so a full grid stays aligned regardless of name /
          urdu / discount badge presence. flex-col + h-full + grow on the body
          pins the price + CTA row to the bottom of every card. */}
      <Link href={`/product/${product.id}`} className="block h-full">
        <div className="group h-full flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
          {/* Image Container */}
          <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
            <SmartImage
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover group-hover:scale-110 transition-transform duration-500"
              fallback={<ImageFallback />}
            />

            {/* Top-left: Fresh badge always shows when in stock; "Out of Stock"
                takes the same slot when stock is zero. The discount % moves
                to the opposite corner so both can coexist. */}
            <div className="absolute top-2 left-2">
              {product.isFresh ? (
                <span className="bg-green-500/90 backdrop-blur-sm text-white text-xs font-medium px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                  <Leaf className="w-3 h-3" />
                  Fresh
                </span>
              ) : (
                <Badge variant="danger">Out of Stock</Badge>
              )}
            </div>

            {/* Top-right: discount %, when compareAtPrice > price. */}
            {discountPercent > 0 && (
              <div className="absolute top-2 right-2">
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-sm">
                  -{discountPercent}% OFF
                </span>
              </div>
            )}

            {/* Hover-revealed Add to Cart — desktop only. Mobile gets the
                same action via the always-visible button at the bottom of the
                card so users don't depend on hover (which doesn't exist on
                touch). */}
            {showAddToCart && product.isFresh && quantity === 0 && (
              <div className="hidden md:block absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button
                  onClick={handleAddToCart}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-2.5 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add to Cart
                </button>
              </div>
            )}
          </div>

          {/* Content — grows to fill so price+CTA sit at the bottom edge. */}
          <div className="p-3.5 flex flex-col flex-grow">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
              per {product.unit}
            </span>

            <h3 className="font-semibold text-gray-900 mt-0.5 mb-0.5 line-clamp-1 text-[15px]">
              {product.name}
            </h3>
            {product.nameUrdu && (
              <p className="text-xs text-gray-400 mb-2 font-urdu line-clamp-1" dir="rtl">
                {product.nameUrdu}
              </p>
            )}

            {/* Price row pinned to the bottom regardless of name length. */}
            <div className="flex items-end justify-between gap-2 mt-auto pt-2">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-lg font-bold text-primary-700">
                  {formatPriceShort(product.price)}
                </span>
                {discountPercent > 0 && product.compareAtPrice && (
                  <span className="text-sm text-gray-400 line-through">
                    {formatPriceShort(product.compareAtPrice)}
                  </span>
                )}
              </div>

              {/* Inline quantity stepper when the item is already in the cart. */}
              {showAddToCart && product.isFresh && quantity > 0 && (
                <AnimatePresence>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-1 bg-primary-50 rounded-xl p-0.5"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                  >
                    <button
                      onClick={handleDecrement}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-sm hover:bg-red-50 transition-colors border border-gray-100"
                    >
                      {quantity === 1 ? (
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-gray-600" />
                      )}
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-primary-700">
                      {quantity}
                    </span>
                    <button
                      onClick={handleIncrement}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-600 hover:bg-primary-700 shadow-sm transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-white" />
                    </button>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Mobile: full-width Add to Cart button below the price row when
                the item isn't in the cart yet. Hover doesn't exist on touch,
                so we don't rely on the over-image hover button on small
                screens. Hidden on md+ where the hover overlay handles it. */}
            {showAddToCart && product.isFresh && quantity === 0 && (
              <button
                onClick={handleAddToCart}
                className="md:hidden mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add to Cart
              </button>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
