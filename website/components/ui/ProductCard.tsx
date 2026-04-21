'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Trash2, Leaf } from 'lucide-react'
import { Product } from '@/types'
import { formatPriceShort } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import Badge from './Badge'
import toast from 'react-hot-toast'

interface ProductCardProps {
  product: Product
  showAddToCart?: boolean
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
    >
      <Link href={`/product/${product.id}`}>
        <div className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
          {/* Image Container */}
          <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
            {product.image && product.image.startsWith('http') ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover group-hover:scale-110 transition-transform duration-500"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                <ShoppingCart className="w-10 h-10 mb-1" />
                <span className="text-xs text-gray-400">No Image</span>
              </div>
            )}

            {/* Discount Badge */}
            {discountPercent > 0 && (
              <div className="absolute top-2 left-2">
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-sm">
                  -{discountPercent}%
                </span>
              </div>
            )}

            {/* Fresh / Out of Stock Badge */}
            {!product.isFresh ? (
              <div className="absolute top-2 left-2">
                <Badge variant="danger">Out of Stock</Badge>
              </div>
            ) : !discountPercent && (
              <div className="absolute top-2 left-2">
                <span className="bg-green-500/90 backdrop-blur-sm text-white text-xs font-medium px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                  <Leaf className="w-3 h-3" />
                  Fresh
                </span>
              </div>
            )}

            {/* Quick Add Button (shown on hover when not in cart) */}
            {showAddToCart && product.isFresh && quantity === 0 && (
              <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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

          {/* Content */}
          <div className="p-3.5">
            {/* Unit label */}
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
              per {product.unit}
            </span>

            <h3 className="font-semibold text-gray-900 mt-0.5 mb-0.5 line-clamp-1 text-[15px]">
              {product.name}
            </h3>
            {product.nameUrdu && (
              <p className="text-xs text-gray-400 mb-2 font-urdu" dir="rtl">
                {product.nameUrdu}
              </p>
            )}

            <div className="flex items-end justify-between mt-auto">
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-primary-700">
                  {formatPriceShort(product.price)}
                </span>
                {discountPercent > 0 && product.compareAtPrice && (
                  <span className="text-sm text-gray-400 line-through">
                    {formatPriceShort(product.compareAtPrice)}
                  </span>
                )}
              </div>

              {/* Quantity Controls (when in cart) */}
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

              {/* Add button (when not in cart, mobile) */}
              {showAddToCart && product.isFresh && quantity === 0 && (
                <button
                  onClick={handleAddToCart}
                  className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
