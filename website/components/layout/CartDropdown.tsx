'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Minus, Plus, Trash2, X, ShoppingBag } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'
import { formatPriceShort } from '@/lib/utils'
import { settingsApi } from '@/lib/api'
import Button from '@/components/ui/Button'

interface CartDropdownProps {
  isOpen: boolean
  onClose: () => void
}

export default function CartDropdown({ isOpen, onClose }: CartDropdownProps) {
  const { items, updateQuantity, removeItem, getSubtotal, getTotalItems, getDeliveryCharge } = useCartStore()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [freeThreshold, setFreeThreshold] = useState(500)
  const [baseCharge, setBaseCharge] = useState(100)

  // Load delivery settings from backend
  useEffect(() => {
    settingsApi.getDeliverySettings().then((s) => {
      if (s?.free_delivery_threshold) setFreeThreshold(s.free_delivery_threshold)
      if (s?.base_charge) setBaseCharge(s.base_charge)
    }).catch(() => {})
  }, [])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
    }
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const subtotal = getSubtotal()
  const totalItems = getTotalItems()

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute right-0 top-full mt-2 w-[380px] max-h-[480px] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-primary-50 to-white">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary-600" />
              <h3 className="font-semibold text-gray-900">
                Cart ({totalItems} {totalItems === 1 ? 'item' : 'items'})
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {items.length === 0 ? (
            /* Empty State */
            <div className="py-12 px-5 text-center">
              <ShoppingCart className="w-14 h-14 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Your cart is empty</p>
              <p className="text-sm text-gray-400 mt-1">Add fresh items to get started!</p>
            </div>
          ) : (
            <>
              {/* Items List */}
              <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-50">
                {items.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    {/* Image */}
                    <div className="relative w-14 h-14 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.product.image && item.product.image.startsWith('http') ? (
                        <Image
                          src={item.product.image}
                          alt={item.product.name}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingCart className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatPriceShort(item.product.price)} / {item.product.unit}
                      </p>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.preventDefault(); updateQuantity(item.product.id, item.quantity - 1) }}
                        className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-3 h-3 text-red-500" />
                        ) : (
                          <Minus className="w-3 h-3 text-gray-600" />
                        )}
                      </button>
                      <span className="w-7 text-center text-sm font-semibold text-gray-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={(e) => { e.preventDefault(); updateQuantity(item.product.id, item.quantity + 1) }}
                        className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        <Plus className="w-3 h-3 text-gray-600" />
                      </button>
                    </div>

                    {/* Item Total */}
                    <span className="text-sm font-bold text-primary-700 w-16 text-right">
                      {formatPriceShort(item.product.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">Subtotal</span>
                  <span className="text-lg font-bold text-gray-900">{formatPriceShort(subtotal)}</span>
                </div>
                {(() => {
                  const delivery = getDeliveryCharge()
                  const hasOnlyChickenOrMeat = items.length > 0 && items.every(i => i.product.category === 'chicken' || i.product.category === 'meat')
                  if (hasOnlyChickenOrMeat) {
                    return (
                      <p className="text-xs text-amber-600 mb-3 bg-amber-50 rounded-lg px-3 py-1.5">
                        Delivery charge: Rs. {baseCharge} (add vegetables/fruits for free delivery!)
                      </p>
                    )
                  }
                  if (subtotal > 0 && subtotal < freeThreshold) {
                    return (
                      <p className="text-xs text-amber-600 mb-3 bg-amber-50 rounded-lg px-3 py-1.5">
                        Add Rs. {freeThreshold - subtotal} more for free delivery!
                      </p>
                    )
                  }
                  if (delivery === 0 && subtotal > 0) {
                    return (
                      <p className="text-xs text-green-600 mb-3 bg-green-50 rounded-lg px-3 py-1.5">
                        ✓ You qualify for free delivery!
                      </p>
                    )
                  }
                  return null
                })()}
                <Link href="/cart" onClick={onClose}>
                  <Button fullWidth size="md">
                    View Cart & Checkout
                  </Button>
                </Link>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
