'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import SmartImage from '@/components/ui/SmartImage'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash2,
  Minus,
  Plus,
  ShoppingCart,
  ArrowRight,
  Truck,
  Gift,
  LogIn,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { useCartStore, useAuthStore } from '@/store/cartStore'
import { formatPriceShort } from '@/lib/utils'
import { getDeliveryHint, getVegFruitSubtotal } from '@/lib/deliveryRules'
import { resolveLineUnitPrice, unitPriceCaption, unitLabelShort } from '@/lib/unitPricing'
import ProductPrice from '@/components/ui/ProductPrice'

export default function CartPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    getSubtotal,
    getDeliveryCharge,
    getFinalTotal,
    deliveryFreeThreshold,
    loadDeliverySettings,
  } = useCartStore()

  useEffect(() => {
    loadDeliverySettings()
  }, [loadDeliverySettings])

  const subtotal = getSubtotal()
  const deliveryCharge = getDeliveryCharge()
  const total = getFinalTotal()
  const vegFruitSubtotal = getVegFruitSubtotal(items)
  const deliveryHint = getDeliveryHint(items, deliveryFreeThreshold)

  const handleCheckout = () => {
    if (!isAuthenticated) {
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
            onAction={() => router.push('/products')}
          />
        </div>
      </div>
    )
  }

  // pb-44 (= 11rem ≈ 176px) reserves space for the mobile sticky cart bar
  // (~70px) PLUS the bottom nav bar (~64px) so neither covers content.
  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8 pb-44 lg:pb-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 sm:mb-8">
          Shopping Cart ({items.length} {items.length === 1 ? 'item' : 'items'})
        </h1>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence mode="popLayout">
              {items.map((item) => {
                const unit = item.unit || 'full'
                const unitSuffix = unitLabelShort(unit)
                const linePrice = resolveLineUnitPrice(item)
                const caption = unitPriceCaption(unit)
                return (
                  <motion.div
                    key={`${item.product.id}::${unit}`}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    className="bg-white rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex gap-4">
                      <Link href={`/product/${item.product.id}`}>
                        <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                          <SmartImage
                            src={item.product?.image}
                            alt={item.product.name}
                            fill
                            className="object-cover"
                            sizes="96px"
                            fallback={
                              <div className="w-full h-full flex items-center justify-center">
                                <ShoppingCart className="w-8 h-8 text-gray-300" />
                              </div>
                            }
                          />
                        </div>
                      </Link>

                      <div className="flex-1 min-w-0">
                        <Link href={`/product/${item.product.id}`}>
                          <h3 className="font-semibold text-gray-900 truncate hover:text-primary-600">
                            {item.product.name}
                            {unitSuffix && (
                              <span className="ml-2 text-xs text-primary-700 font-semibold">
                                ({unitSuffix})
                              </span>
                            )}
                          </h3>
                        </Link>
                        <div className="mt-1">
                          {unit === 'full' ? (
                            <ProductPrice
                              price={linePrice}
                              unit={item.product.unit}
                              size="sm"
                            />
                          ) : (
                            <span className="inline-flex items-baseline gap-1">
                              <ProductPrice price={linePrice} size="sm" />
                              {caption && (
                                <span className="text-[10px] text-primary-700 font-medium">
                                  {caption}
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                updateQuantity(item.product.id, item.quantity - 1, unit)
                              }
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(item.product.id, item.quantity + 1, unit)
                              }
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-primary-100 hover:bg-primary-200"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <button
                            onClick={() => {
                              removeItem(item.product.id, unit)
                              toast.success('Item removed from cart')
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label="Remove item"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-right hidden sm:block">
                        <p className="font-semibold text-gray-900">
                          {formatPriceShort(linePrice * item.quantity)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

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

          {/* Order Summary — desktop sidebar */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>

              <div
                className={`p-4 rounded-lg mb-6 ${
                  deliveryCharge === 0 ? 'bg-green-50' : 'bg-blue-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {deliveryCharge === 0 ? (
                    <Gift className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Truck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  )}
                  <p
                    className={`text-sm font-medium ${
                      deliveryCharge === 0 ? 'text-green-800' : 'text-blue-800'
                    }`}
                  >
                    {deliveryHint || `Vegetables/Fruits subtotal: Rs. ${vegFruitSubtotal}`}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPriceShort(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span className={deliveryCharge === 0 ? 'text-green-600 font-semibold' : ''}>
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

              <Button onClick={handleCheckout} fullWidth size="lg">
                {isAuthenticated ? (
                  <>Proceed to Checkout <ArrowRight className="w-5 h-5 ml-2" /></>
                ) : (
                  <>Login to Checkout <LogIn className="w-5 h-5 ml-2" /></>
                )}
              </Button>

              <Link
                href="/products"
                className="block text-center text-primary-600 mt-4 hover:underline"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>

        {/* Order Summary — mobile inline (also acts as the source of truth) */}
        <div className="lg:hidden mt-6 space-y-4">
          <div
            className={`p-4 rounded-lg ${
              deliveryCharge === 0 ? 'bg-green-50' : 'bg-blue-50'
            }`}
          >
            <div className="flex items-start gap-3">
              {deliveryCharge === 0 ? (
                <Gift className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Truck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              )}
              <p
                className={`text-sm font-medium ${
                  deliveryCharge === 0 ? 'text-green-800' : 'text-blue-800'
                }`}
              >
                {deliveryHint || `Vegetables/Fruits subtotal: Rs. ${vegFruitSubtotal}`}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatPriceShort(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Delivery</span>
              <span className={deliveryCharge === 0 ? 'text-green-600 font-semibold' : ''}>
                {deliveryCharge === 0 ? 'FREE' : formatPriceShort(deliveryCharge)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 border-t pt-2">
              <span>Total</span>
              <span>{formatPriceShort(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/*
        Mobile sticky checkout bar. We sit ABOVE the global MobileNav
        (which is fixed bottom-0 with ~64px height) by using bottom-16
        with matching z-50 so neither covers the other.
      */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 z-50 bg-white border-t border-gray-200 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="container mx-auto flex items-center gap-3">
          <div className="flex-shrink-0">
            <p className="text-[11px] text-gray-500 leading-none">Total</p>
            <p className="text-lg font-bold text-gray-900 leading-tight">
              {formatPriceShort(total)}
            </p>
          </div>
          <Button onClick={handleCheckout} fullWidth size="md">
            {isAuthenticated ? (
              <>Proceed to Checkout <ArrowRight className="w-4 h-4 ml-2" /></>
            ) : (
              <>Login to Checkout <LogIn className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
