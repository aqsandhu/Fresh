'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Trash2, Leaf, ChevronDown } from 'lucide-react'
import { Product, ProductUnit } from '@/types'
import ProductPrice from './ProductPrice'
import { useCartStore } from '@/store/cartStore'
import Badge from './Badge'
import SmartImage from './SmartImage'
import toast from 'react-hot-toast'
import {
  getUnitOptions,
  getUnitPickerDisplayLabel,
  unitLabelShort,
} from '@/lib/unitPricing'
import { formatPriceShort } from '@/lib/utils'

interface ProductCardProps {
  product: Product
  showAddToCart?: boolean
}

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
  const unitOptions = useMemo(() => getUnitOptions(product), [product])
  const hasFractionUnits = unitOptions.length > 1
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit>('full')
  const [unitMenuOpen, setUnitMenuOpen] = useState(false)
  const unitMenuRef = useRef<HTMLDivElement>(null)
  const activeOption =
    unitOptions.find((o) => o.unit === selectedUnit) || unitOptions[0]
  const displayPrice = activeOption?.price ?? product.price
  const unitPickerLabel = getUnitPickerDisplayLabel(
    product,
    selectedUnit,
    unitOptions
  )

  useEffect(() => {
    if (!unitMenuOpen) return
    const close = (e: MouseEvent) => {
      if (
        unitMenuRef.current &&
        !unitMenuRef.current.contains(e.target as Node)
      ) {
        setUnitMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [unitMenuOpen])

  const cartItem = items.find(
    (item) =>
      item.product.id === product.id && (item.unit || 'full') === selectedUnit
  )
  const quantity = cartItem?.quantity || 0

  const handleAddToCart = () => {
    addItem(product, 1, selectedUnit)
    const suffix = unitLabelShort(selectedUnit)
    toast.success(
      `${product.name}${suffix ? ` (${suffix})` : ''} added to cart`,
      { duration: 2000, icon: '🛒' }
    )
  }

  const handleIncrement = () => {
    updateQuantity(product.id, quantity + 1, selectedUnit)
  }

  const handleDecrement = () => {
    updateQuantity(product.id, quantity - 1, selectedUnit)
  }

  const discountPercent =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(
          ((product.compareAtPrice - product.price) / product.compareAtPrice) *
            100
        )
      : 0

  const productHref = `/product/${product.id}`

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <div className="group h-full flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
        {/* Image — link only here so cart buttons never fight navigation */}
        <Link href={productHref} className="block relative aspect-square overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
          <SmartImage
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            fallback={<ImageFallback />}
          />

          <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
            {product.isFresh ? (
              <span className="bg-green-500/90 backdrop-blur-sm text-white text-xs font-medium px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                <Leaf className="w-3 h-3" />
                Fresh
              </span>
            ) : (
              <Badge variant="danger">Out of Stock</Badge>
            )}
            {discountPercent > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-sm">
                -{discountPercent}% OFF
              </span>
            )}
          </div>
        </Link>

        <div className="p-3 flex flex-col flex-grow min-w-0">
          <Link href={productHref} className="block min-w-0">
            <h3 className="font-semibold text-gray-900 line-clamp-2 text-[15px] leading-snug">
              {product.name}
            </h3>
            {product.nameUrdu && (
              <p
                className="text-sm font-bold text-gray-800 mt-0.5 font-urdu line-clamp-1 leading-snug"
                dir="rtl"
              >
                {product.nameUrdu}
              </p>
            )}
          </Link>

          {hasFractionUnits && (
            <div
              ref={unitMenuRef}
              className="relative mt-2 mb-2 w-full min-w-0"
            >
              <button
                type="button"
                onClick={() => setUnitMenuOpen((v) => !v)}
                className="w-full min-h-[40px] flex items-center justify-between gap-2 text-sm font-semibold text-[#2F6B4F] bg-[#F4F9F6] hover:bg-[#e8f3ec] border border-[#C5DECF] px-3 py-2 rounded-xl transition-colors"
                aria-haspopup="listbox"
                aria-expanded={unitMenuOpen}
              >
                <span className="flex-1 text-left leading-snug whitespace-normal break-words">
                  {unitPickerLabel}
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    unitMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {unitMenuOpen && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {unitOptions.map((opt) => (
                    <button
                      key={opt.unit}
                      type="button"
                      onClick={() => {
                        setSelectedUnit(opt.unit)
                        setUnitMenuOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors ${
                        opt.unit === selectedUnit
                          ? 'bg-[#F4F9F6] text-[#2F6B4F] font-semibold'
                          : 'text-gray-700'
                      }`}
                    >
                      <span className="leading-snug">{opt.label}</span>
                      <span className="text-gray-600 font-medium shrink-0">
                        {formatPriceShort(opt.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-auto pt-1 space-y-2 min-w-0">
            <ProductPrice
              price={displayPrice}
              unit={
                selectedUnit === 'full'
                  ? product.unit
                  : unitLabelShort(selectedUnit)
              }
              size="md"
              compareAtPrice={
                selectedUnit === 'full' && discountPercent > 0
                  ? product.compareAtPrice
                  : undefined
              }
            />

            {showAddToCart && product.isFresh && quantity > 0 && (
              <div className="flex items-center justify-between gap-1 w-full bg-primary-50 rounded-xl p-1 border border-primary-100">
                <button
                  type="button"
                  onClick={handleDecrement}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-white shadow-sm hover:bg-red-50 transition-colors border border-gray-100 shrink-0"
                  aria-label={quantity === 1 ? 'Remove from cart' : 'Decrease quantity'}
                >
                  {quantity === 1 ? (
                    <Trash2 className="w-4 h-4 text-red-500" />
                  ) : (
                    <Minus className="w-4 h-4 text-gray-600" />
                  )}
                </button>
                <span className="flex-1 text-center text-base font-bold text-primary-700 tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={handleIncrement}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-600 hover:bg-primary-700 shadow-sm transition-colors shrink-0"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              </div>
            )}

            {showAddToCart && product.isFresh && quantity === 0 && (
              <button
                type="button"
                onClick={handleAddToCart}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add to Cart
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
