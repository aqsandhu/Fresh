'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import SmartImage from '@/components/ui/SmartImage'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Minus, Plus, Trash2, X, ShoppingBag } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'
import { formatPriceShort } from '@/lib/utils'
import { getDeliveryHint } from '@/lib/deliveryRules'
import { unitLabelShort } from '@/lib/unitPricing'
import Button from '@/components/ui/Button'

interface CartDropdownProps {
  isOpen: boolean
  onClose: () => void
}

export default function CartDropdown({ isOpen, onClose }: CartDropdownProps) {
  const {
    items,
    updateQuantity,
    getSubtotal,
    getTotalItems,
    getDeliveryCharge,
    getFinalTotal,
    deliveryFreeThreshold,
    loadDeliverySettings,
  } = useCartStore()

  const desktopRef = useRef<HTMLDivElement>(null)
  const mobileRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    loadDeliverySettings()
  }, [loadDeliverySettings])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    // Prevent body horizontal scroll while panel is open on mobile.
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const insideDesktop = desktopRef.current?.contains(target)
      const insideMobile = mobileRef.current?.contains(target)
      if (!insideDesktop && !insideMobile) {
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
  const delivery = getDeliveryCharge()
  const total = getFinalTotal()
  const totalItems = getTotalItems()
  const deliveryHint = getDeliveryHint(items, deliveryFreeThreshold)

  // The panel is laid out as a flex column so the items list (flex-1) gets
  // the leftover height while the header + footer stay pinned. This is what
  // makes the "View Cart & Checkout" button always reachable, even with many
  // items in the cart.
  const panelBody = (
    <div className="flex flex-col h-full max-h-full overflow-hidden">
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
          aria-label="Close cart"
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
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-50">
            {items.map((item) => {
              const unit = item.unit || 'full'
              const unitSuffix = unitLabelShort(unit)
              const linePrice = item.unitPrice ?? item.product.price
              return (
                <div
                  key={`${item.product.id}::${unit}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    <SmartImage
                      src={item.product.image}
                      alt={item.product.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                      fallback={
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingCart className="w-5 h-5 text-gray-300" />
                        </div>
                      }
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.product.name}
                      {unitSuffix && (
                        <span className="ml-1 text-[10px] text-primary-600 font-semibold">
                          ({unitSuffix})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 inline-flex items-baseline gap-0.5">
                      {formatPriceShort(linePrice)}
                      <span className="text-[10px] text-gray-400">
                        /
                        {unit === 'full'
                          ? item.product.unit
                          : unitSuffix.replace(/^\W+\s*/u, '')}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        updateQuantity(item.product.id, item.quantity - 1, unit)
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-100 transition-colors"
                      aria-label="Decrease quantity"
                    >
                      {item.quantity === 1 ? (
                        <Trash2 className="w-3 h-3 text-red-500" />
                      ) : (
                        <Minus className="w-3 h-3 text-gray-600" />
                      )}
                    </button>
                    <span className="w-6 text-center text-sm font-semibold text-gray-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        updateQuantity(item.product.id, item.quantity + 1, unit)
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-100 transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3 h-3 text-gray-600" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold text-gray-900">
                  {formatPriceShort(subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Delivery</span>
                <span
                  className={`font-semibold ${
                    delivery === 0 ? 'text-green-600' : 'text-gray-900'
                  }`}
                >
                  {delivery === 0 ? 'FREE' : formatPriceShort(delivery)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                <span className="text-sm font-medium text-gray-900">Total</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatPriceShort(total)}
                </span>
              </div>
            </div>
            {deliveryHint && (
              <p
                className={`text-xs mb-3 rounded-lg px-3 py-1.5 ${
                  delivery === 0
                    ? 'text-green-600 bg-green-50'
                    : 'text-amber-600 bg-amber-50'
                }`}
              >
                {delivery === 0 ? '\u2713 ' : ''}
                {deliveryHint}
              </p>
            )}
            <Link href="/cart" onClick={onClose}>
              <Button fullWidth size="md">
                View Cart &amp; Checkout
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  )

  // ---------- Desktop variant: rendered inline, hidden on mobile ----------
  const desktopPanel = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={desktopRef}
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="hidden sm:flex absolute right-0 top-full mt-2 w-[380px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden flex-col"
        >
          {panelBody}
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ---------- Mobile variant: portal to body ----------
  // We anchor the panel inside a wrapper that covers the gap between the
  // sticky header (top: ~5rem) and the bottom MobileNav (~5rem). With
  // `top-20 bottom-24` the panel can never extend past the MobileNav, so
  // the footer "View Cart & Checkout" button is always tappable even when
  // the user has many items. `dvh` keeps the math correct as mobile
  // browser chrome shows/hides during scroll.
  const mobilePanel =
    mounted &&
    createPortal(
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close cart"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[90] bg-black/30 sm:hidden"
              onClick={onClose}
            />
            <div className="fixed z-[100] top-20 bottom-24 left-0 right-0 px-2 flex items-start justify-center sm:hidden pointer-events-none">
              <motion.div
                ref={mobileRef}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto w-full max-w-[380px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col"
                style={{ maxHeight: '100%' }}
              >
                {panelBody}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>,
      document.body
    )

  return (
    <>
      {desktopPanel}
      {mobilePanel}
    </>
  )
}
