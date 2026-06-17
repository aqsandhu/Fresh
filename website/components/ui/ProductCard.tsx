'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ShoppingCart, Plus, Minus, Trash2, Leaf } from 'lucide-react'
import { Product, ProductUnit, ProductQuality } from '@/types'
import ProductPrice from './ProductPrice'
import UnitSelector from './UnitSelector'
import { useCartStore } from '@/store/cartStore'
import { useVariableWeightNotice } from '@/store/variableWeightNotice'
import Badge from './Badge'
import SmartImage from './SmartImage'
import toast from 'react-hot-toast'
import { getUnitOptions, unitLabelShort, offeredQualities, qualityStock } from '@/lib/unitPricing'

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

/** Layout mirrors customer-app ProductCard (fullWidth / featured grid). */
export default function ProductCard({ product, showAddToCart = true }: ProductCardProps) {
  const { addItem, updateQuantity, items } = useCartStore()
  const notifyVariableWeight = useVariableWeightNotice((s) => s.notify)
  // Quality tiers (A/B/C). B/C only appear when the admin set their consumer price.
  const qualities = useMemo(() => offeredQualities(product), [product])
  const [selectedQuality, setSelectedQuality] = useState<ProductQuality>('A')
  const unitOptions = useMemo(() => getUnitOptions(product, selectedQuality), [product, selectedQuality])
  const hasFractionUnits = unitOptions.length > 1
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit>('full')

  const activeOption =
    unitOptions.find((o) => o.unit === selectedUnit) || unitOptions[0]
  const displayPrice = activeOption?.price ?? product.price

  // Stock is per-quality (shared with restaurants) — the selected tier's bucket.
  const inStock = qualityStock(product, selectedQuality) > 0

  const cartItem = items.find(
    (item) =>
      item.product.id === product.id &&
      (item.unit || 'full') === selectedUnit &&
      (item.quality || 'A') === selectedQuality
  )
  const quantity = cartItem?.quantity || 0

  const handleAddToCart = () => {
    addItem(product, 1, selectedUnit, selectedQuality)
    if (product.isVariableWeight) {
      notifyVariableWeight(product.id, product.variableWeightNote)
    }
    const suffix = unitLabelShort(selectedUnit)
    const qLabel = qualities.length > 1 ? ` · Quality ${selectedQuality}` : ''
    toast.success(
      `${product.name}${suffix ? ` (${suffix})` : ''}${qLabel} added to cart`,
      { duration: 2000, icon: '🛒' }
    )
  }

  const handleIncrement = () => {
    updateQuantity(product.id, quantity + 1, selectedUnit, selectedQuality)
  }

  const handleDecrement = () => {
    updateQuantity(product.id, quantity - 1, selectedUnit, selectedQuality)
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
    <div className="h-full w-full">
      <div className="group h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-[0_2px_6px_rgba(0,0,0,0.08)] overflow-hidden">
        <Link
          href={productHref}
          className="block relative aspect-square overflow-hidden bg-gray-50"
        >
          <SmartImage
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
            fallback={<ImageFallback />}
          />

          <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
            {inStock ? (
              <span className="bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-0.5">
                <Leaf className="w-2.5 h-2.5" />
                Fresh
              </span>
            ) : (
              <Badge variant="danger">Out of Stock</Badge>
            )}
            {discountPercent > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded">
                -{discountPercent}% OFF
              </span>
            )}
          </div>
        </Link>

        <div className="p-2 flex flex-col flex-grow min-w-0 w-full">
          <Link href={productHref} className="block min-w-0">
            <h3 className="font-semibold text-gray-900 line-clamp-2 text-[15px] leading-5 min-h-[20px]">
              {product.name}
            </h3>
            {product.nameUrdu && (
              <p
                className="text-sm font-bold text-gray-800 mb-1 font-urdu line-clamp-1 text-right"
                dir="rtl"
              >
                {product.nameUrdu}
              </p>
            )}
          </Link>

          {qualities.length > 1 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">
                Quality
              </span>
              <div className="inline-flex flex-1 rounded-lg bg-gray-100 p-0.5">
                {qualities.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setSelectedQuality(q)
                      setSelectedUnit('full')
                    }}
                    className={`flex-1 rounded-md py-1 text-xs font-bold transition-all ${
                      selectedQuality === q
                        ? 'bg-white text-primary-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    aria-pressed={selectedQuality === q}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasFractionUnits && (
            <UnitSelector
              product={product}
              selectedUnit={selectedUnit}
              onChange={setSelectedUnit}
              quality={selectedQuality}
              size="sm"
              fullWidth
              className="my-1.5"
            />
          )}

          <div className="mt-auto pt-1 w-full min-w-0">
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

            {showAddToCart && inStock && quantity > 0 && (
              <div className="flex justify-end mt-1">
                <div className="inline-flex items-center bg-primary-50 rounded-xl p-0.5">
                  <button
                    type="button"
                    onClick={handleDecrement}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-100 shrink-0"
                    aria-label={
                      quantity === 1 ? 'Remove from cart' : 'Decrease quantity'
                    }
                  >
                    {quantity === 1 ? (
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-gray-600" />
                    )}
                  </button>
                  <span className="min-w-[26px] px-0.5 text-center text-[13px] font-bold text-primary-700 tabular-nums">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={handleIncrement}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary-600 hover:bg-primary-700 shrink-0"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              </div>
            )}

            {showAddToCart && inStock && quantity === 0 && (
              <button
                type="button"
                onClick={handleAddToCart}
                className="w-full mt-1 inline-flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-[13px] font-bold py-2 rounded-lg transition-colors"
              >
                <ShoppingCart className="w-4 h-4" />
                Add to Cart
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
