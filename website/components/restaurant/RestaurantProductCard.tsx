'use client'

import { useMemo, useState } from 'react'
import { ShoppingCart, Plus, Minus, Trash2, Leaf } from 'lucide-react'
import type { Product, ProductUnit } from '@/types'
import ProductPrice from '@/components/ui/ProductPrice'
import UnitSelector from '@/components/ui/UnitSelector'
import SmartImage from '@/components/ui/SmartImage'
import Badge from '@/components/ui/Badge'
import { priceForUnit, unitLabelShort } from '@/lib/unitPricing'
import { resolveImageUrl } from '@/lib/utils'
import {
  availableQualities, qualityBasePrice, money,
  type RestaurantProduct, type Quality,
} from '@/lib/restaurantPricing'

export interface RestaurantCartLine {
  key: string
  productId: string
  name: string
  image?: string | null
  quality: Quality
  unit: ProductUnit
  unitShort: string
  qty: number
  unitPrice: number
}

interface Props {
  product: RestaurantProduct
  cart: RestaurantCartLine[]
  onAdd: (line: RestaurantCartLine) => void
  onSetQty: (key: string, qty: number) => void
}

function ImageFallback() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
      <ShoppingCart className="w-10 h-10 mb-1" />
      <span className="text-xs text-gray-400">No Image</span>
    </div>
  )
}

/** Restaurant storefront card — mirrors the consumer ProductCard, with a quality
 *  tier selector and the same half/quarter-kg unit selector. */
export default function RestaurantProductCard({ product, cart, onAdd, onSetQty }: Props) {
  const qualities = availableQualities(product)
  const [quality, setQuality] = useState<Quality>(qualities[0])
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit>('full')

  const inStock = (product.stock_quantity ?? 0) > 0

  // Map the restaurant product (at the chosen quality) onto the consumer Product
  // shape so we can reuse UnitSelector + ProductPrice + their pricing logic. The
  // fractions derive from the selected quality's base (½ = ×0.5, ¼ = ×0.25).
  const mapped = useMemo(() => {
    const base = qualityBasePrice(product, quality) ?? 0
    return {
      id: product.id,
      name: product.name_en,
      nameUrdu: product.name_ur,
      image: resolveImageUrl(product.primary_image || ''),
      price: base,
      unit: (product.unit_type as Product['unit']) || 'kg',
      halfKgPrice: null,
      quarterKgPrice: null,
      halfDozenPrice: null,
      allowHalfKg: product.allow_half_kg !== false,
      allowQuarterKg: product.allow_quarter_kg !== false,
      isFresh: inStock,
    } as unknown as Product
  }, [product, quality, inStock])

  const displayPrice = priceForUnit(mapped, selectedUnit)
  const baseUnitLabel = String(product.unit_type || 'kg')

  const key = `${product.id}|${quality}|${selectedUnit}`
  const line = cart.find((l) => l.key === key)
  const quantity = line?.qty || 0

  const buildLine = (): RestaurantCartLine => ({
    key,
    productId: product.id,
    name: product.name_en,
    image: product.primary_image,
    quality,
    unit: selectedUnit,
    unitShort: selectedUnit === 'full' ? baseUnitLabel : unitLabelShort(selectedUnit),
    qty: 1,
    unitPrice: displayPrice,
  })

  return (
    <div className="h-full w-full">
      <div className="group h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-[0_2px_6px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="relative aspect-square overflow-hidden bg-gray-50">
          <SmartImage
            src={mapped.image}
            alt={product.name_en}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
            fallback={<ImageFallback />}
          />
          <div className="absolute top-2 left-2">
            {inStock ? (
              <span className="bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-0.5">
                <Leaf className="w-2.5 h-2.5" /> Fresh
              </span>
            ) : (
              <Badge variant="danger">Out of Stock</Badge>
            )}
          </div>
        </div>

        <div className="p-2 flex flex-col flex-grow min-w-0 w-full">
          <h3 className="font-semibold text-gray-900 line-clamp-2 text-[15px] leading-5 min-h-[20px]">
            {product.name_en}
          </h3>
          {product.name_ur && (
            <p className="text-sm font-bold text-gray-800 mb-1 font-urdu line-clamp-1 text-right" dir="rtl">
              {product.name_ur}
            </p>
          )}

          {/* Quality tier selector */}
          {qualities.length > 1 && (
            <div className="mt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Quality</p>
              <div className="grid grid-cols-3 gap-1">
                {qualities.map((q) => {
                  const qp = qualityBasePrice(product, q)
                  const active = quality === q
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuality(q)}
                      className={`flex flex-col items-center rounded-lg border px-1 py-1 transition-colors ${
                        active
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-primary-300'
                      }`}
                    >
                      <span className="text-xs font-bold leading-none">{q}</span>
                      <span className="text-[10px] mt-0.5 leading-none">{qp != null ? money(qp) : '—'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Half / quarter-kg selector (consumer component, priced for this quality) */}
          <UnitSelector
            product={mapped}
            selectedUnit={selectedUnit}
            onChange={setSelectedUnit}
            size="sm"
            fullWidth
            className="my-1.5"
          />

          <div className="mt-auto pt-1 w-full min-w-0">
            <ProductPrice
              price={displayPrice}
              unit={selectedUnit === 'full' ? baseUnitLabel : unitLabelShort(selectedUnit)}
              size="md"
            />

            {inStock && quantity > 0 && (
              <div className="flex justify-end mt-1">
                <div className="inline-flex items-center bg-primary-50 rounded-xl p-0.5">
                  <button
                    type="button"
                    onClick={() => onSetQty(key, quantity - 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-100 shrink-0"
                    aria-label={quantity === 1 ? 'Remove' : 'Decrease'}
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
                    onClick={() => onSetQty(key, quantity + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary-600 hover:bg-primary-700 shrink-0"
                    aria-label="Increase"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              </div>
            )}

            {inStock && quantity === 0 && (
              <button
                type="button"
                onClick={() => onAdd(buildLine())}
                className="w-full mt-1 inline-flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-[13px] font-bold py-2 rounded-lg transition-colors"
              >
                <ShoppingCart className="w-4 h-4" /> Add to Cart
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
