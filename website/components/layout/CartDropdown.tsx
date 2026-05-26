'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import SmartImage from '@/components/ui/SmartImage'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Minus, Plus, Trash2, X, ShoppingBag } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'
import { formatPriceShort, formatProductUnitSuffix } from '@/lib/utils'
import { getMixedOrderDeliveryHint } from '@/lib/deliveryRules'
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
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const updateLayout = () => setIsMobile(window.innerWidth < 640)
    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  useEffect(() => {
    settingsApi.getDeliverySettings().then((s) => {
      if (s?.free_delivery_threshold) setFreeThreshold(s.free_delivery_threshold)
      if (s?.base_charge) setBaseCharge(s.base_charge)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const prevOverflowX = document.body.style.overflowX
    document.body.style.overflowX = 'hidden'
    return () => {
      document.body.style.overflowX = prevOverflowX
    }
  }, [isOpen])

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
  const delivery = getDeliveryCharge()
  const deliveryHint = getMixedOrderDeliveryHint(items, freeThreshold)

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          {isMobile && (
            <motion.button
              type="button"
              aria-label="Close cart"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/20 sm:hidden"
              onClick={onClose}
            />
          )}
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={
              isMobile
                ? 'fixed left-1/2 top-24 z-[100] w-[calc(100vw-1rem)] max-w-[380px] -translate-x-1/2 max-h-[min(480px,calc(100vh-6rem))] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden'
                : 'absolute right-0 top-full mt-2 w-[380px] max-h-[480px] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden'
            }
          >
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
              <div className="py-12 px-5 text-center">
                <ShoppingCart className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Your cart is empty</p>
                <p className="text-sm text-gray-400 mt-1">Add fresh items to get started!</p>
              </div>
            ) : (
              <>
                <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-50">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="relative w-14 h-14 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        <SmartImage
                          src={item.product.image}
                          alt={item.product.name}
                          fill
                          className="object-cover"
                          sizes="56px"
                          fallback={
                            <div className="w-full h-full flex items-center justify-center">
                              <ShoppingCart className="w-5 h-5 text-gray-300" />
                            </div>
                          }
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                        <p className="text-xs text-gray-500 inline-flex items-baseline gap-0.5">
                          {formatPriceShort(item.product.price)}
                          <span className="text-[10px] text-gray-400">
                            {formatProductUnitSuffix(item.product.unit)}
                          </span>
                        </p>
                      </div>

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

                      <span className="text-sm font-bold text-primary-700 w-16 text-right">
                        {formatPriceShort(item.product.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600">Subtotal</span>
                    <span className="text-lg font-bold text-gray-900">{formatPriceShort(subtotal)}</span>
                  </div>
                  {deliveryHint && (
                    <p
                      className={`text-xs mb-3 rounded-lg px-3 py-1.5 ${
                        delivery === 0
                          ? 'text-green-600 bg-green-50'
                          : 'text-amber-600 bg-amber-50'
                      }`}
                    >
                      {delivery === 0 ? '✓ ' : ''}{deliveryHint}
                    </p>
                  )}
                  <Link href="/cart" onClick={onClose}>
                    <Button fullWidth size="md">
                      View Cart & Checkout
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  if (!mounted) return null

  if (isMobile && isOpen) {
    return createPortal(panel, document.body)
  }

  return panel
}
