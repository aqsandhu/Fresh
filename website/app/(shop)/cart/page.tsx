'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Trash2, 
  Minus, 
  Plus, 
  ShoppingBag, 
  ArrowRight,
  Truck,
  AlertCircle,
  Gift
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { useCartStore, useAuthStore } from '@/store/cartStore'
import { formatPriceShort, getDeliveryMessage } from '@/lib/utils'

export default function CartPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { 
    items, 
    updateQuantity, 
    removeItem, 
    getSubtotal, 
    getDeliveryCharge, 
    getFinalTotal,
    hasOnlyChicken,
    clearCart
  } = useCartStore()

  const subtotal = getSubtotal()
  const deliveryCharge = getDeliveryCharge()
  const total = getFinalTotal()
  const onlyChicken = hasOnlyChicken()

  const handleCheckout = () => {
    if (!isAuthenticated) {
      toast.error('Please login to proceed')
      router.push('/login?redirect=/checkout')
      return
    }
    router.push('/checkout')
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4">
          <EmptyState
            type="cart"
            onAction={() => router.push('/category/sabzi')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
          Shopping Cart ({items.length} items)
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  key={item.product.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className="bg-white rounded-xl p-4 shadow-sm"
                >
                  <div className="flex gap-4">
                    {/* Image */}
                    <Link href={`/product/${item.product.id}`}>
                      <div className="relative w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        <Image
                          src={item.product.image || '/placeholder-product.png'}
                          alt={item.product.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    </Link>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <Link href={`/product/${item.product.id}`}>
                        <h3 className="font-semibold text-gray-900 truncate hover:text-primary-600">
                          {item.product.name}
                        </h3>
                      </Link>
                      <p className="text-sm text-gray-500">
                        per {item.product.unit}
                      </p>
                      <p className="font-semibold text-primary-700 mt-1">
                        {formatPriceShort(item.product.price)}
                      </p>

                      <div className="flex items-center justify-between mt-3">
                        {/* Quantity */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-medium">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-primary-100 hover:bg-primary-200"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => {
                            removeItem(item.product.id)
                            toast.success('Item removed from cart')
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Item Total */}
                    <div className="text-right hidden sm:block">
                      <p className="font-semibold text-gray-900">
                        {formatPriceShort(item.product.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Clear Cart */}
            <button
              onClick={() => {
                clearCart()
                toast.success('Cart cleared')
              }}
              className="text-red-500 text-sm hover:underline"
            >
              Clear all items
            </button>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                Order Summary
              </h2>

              {/* Delivery Info */}
              <div className={`p-4 rounded-lg mb-6 ${onlyChicken ? 'bg-yellow-50' : subtotal >= 500 ? 'bg-green-50' : 'bg-blue-50'}`}>
                <div className="flex items-start gap-3">
                  {onlyChicken ? (
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  ) : subtotal >= 500 ? (
                    <Gift className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Truck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${onlyChicken ? 'text-yellow-800' : subtotal >= 500 ? 'text-green-800' : 'text-blue-800'}`}>
                      {getDeliveryMessage(subtotal, onlyChicken)}
                    </p>
                    {!onlyChicken && subtotal < 500 && (
                      <p className="text-xs text-blue-600 mt-1">
                        Add Rs. {500 - subtotal} more for free delivery
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPriceShort(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span className={deliveryCharge === 0 ? 'text-green-600' : ''}>
                    {deliveryCharge === 0 ? 'FREE' : formatPriceShort(deliveryCharge)}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between text-lg font-bold text-gray-900">
                    <span>Total</span>
                    <span>{formatPriceShort(total)}</span>
                  </div>
                </div>
              </div>

              {/* Checkout Button */}
              <Button
                onClick={handleCheckout}
                fullWidth
                size="lg"
              >
                Proceed to Checkout
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              {/* Continue Shopping */}
              <Link
                href="/category/sabzi"
                className="block text-center text-primary-600 mt-4 hover:underline"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
