'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Trash2, Leaf } from 'lucide-react'
import { Product, ProductUnit } from '@/types'
import ProductPrice from './ProductPrice'
import UnitSelector from './UnitSelector'
import { useCartStore } from '@/store/cartStore'
import Badge from './Badge'
import SmartImage from './SmartImage'
import toast from 'react-hot-toast'
import { getUnitOptions, unitLabelShort } from '@/lib/unitPricing'

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

  const activeOption =
    unitOptions.find((o) => o.unit === selectedUnit) || unitOptions[0]
  const displayPrice = activeOption?.price ?? product.price

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
      <div className="group h-full flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 overflow-visible">
        <Link
          href={productHref}
          className="block relative aspect-square overflow-hidden rounded-t-2xl bg-gradient-to-br from-gray-50 to-gray-100"
        >
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

        <div className="p-3 flex flex-col flex-grow min-w-0 w-full">
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
            <div className="mt-2 mb-2 w-full min-w-0">
              <UnitSelector
                product={product}
                selectedUnit={selectedUnit}
                onChange={setSelectedUnit}
                size="md"
                fullWidth
              />
            </div>
          )}

          <div className="mt-auto pt-1 space-y-2 w-full min-w-0">
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
                  aria-label={
                    quantity === 1 ? 'Remove from cart' : 'Decrease quantity'
                  }
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
