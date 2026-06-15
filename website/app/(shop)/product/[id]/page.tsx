'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SmartImage from '@/components/ui/SmartImage'
import {
  ChevronRight,
  Minus,
  Plus,
  ShoppingCart,
  Check,
  Star,
  Truck,
  ShieldCheck,
  Heart,
  Share2,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import ProductCard from '@/components/ui/ProductCard'
import ProductPrice from '@/components/ui/ProductPrice'
import ProductReviews from '@/components/feedback/ProductReviews'
import GuidanceTips from '@/components/guidance/GuidanceTips'
import { useCartStore } from '@/store/cartStore'
import { useVariableWeightNotice } from '@/store/variableWeightNotice'
import { useCityContext } from '@/context/CityContext'
import { productsApi } from '@/lib/api'
import api from '@/lib/api'
import UnitSelector, { getSelectedUnitPrice } from '@/components/ui/UnitSelector'
import { unitLabelShort } from '@/lib/unitPricing'
import { Product, ProductUnit } from '@/types'

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [quantity, setQuantity] = useState(1)
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit>('full')
  const [freeThreshold, setFreeThreshold] = useState(500)
  const { addItem, items } = useCartStore()
  const notifyVariableWeight = useVariableWeightNotice((s) => s.notify)
  const { selectedCityId } = useCityContext()

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.getById(id),
  })

  const displayPrice = product
    ? getSelectedUnitPrice(product, selectedUnit)
    : 0

  const cartItem = items.find(
    (item) =>
      item.product.id === id && (item.unit || 'full') === selectedUnit
  )

  const { data: relatedData } = useQuery({
    queryKey: ['related-products', product?.categoryId],
    queryFn: () => productsApi.getAll({ category: product!.categoryId, limit: 5 }),
    enabled: !!product?.categoryId,
  })

  const relatedProducts: Product[] = (relatedData?.products || [])
    .filter((p: Product) => p.id !== id)
    .slice(0, 4)

  useEffect(() => {
    if (!selectedCityId) return
    api
      .get('/site-settings/delivery', { params: { city_id: selectedCityId } })
      .then((res) => {
        const t = parseFloat(res.data?.data?.free_delivery_threshold)
        if (Number.isFinite(t) && t > 0) setFreeThreshold(t)
      })
      .catch(() => {})
  }, [selectedCityId])

  const categorySlug = product?.category || product?.categoryId
  const categoryName = product?.category || 'Category'
  const stockQty =
    (product as Product & { stock?: number })?.stock ??
    product?.stock_quantity ??
    0
  const isFresh =
    (product as Product & { isFresh?: boolean })?.isFresh ?? stockQty > 0
  const maxQuantity = stockQty > 0 ? stockQty : 99

  const inCart = Boolean(cartItem)

  const handleAddToCart = () => {
    if (!isFresh || !product) return
    addItem(product, quantity, selectedUnit)
    if (product.isVariableWeight) {
      notifyVariableWeight(product.id, product.variableWeightNote)
    }
    const suffix = unitLabelShort(selectedUnit)
    toast.success(
      `${product.name}${suffix ? ` (${suffix})` : ''} added to cart!`
    )
  }

  const handleShare = async () => {
    if (!product) return
    try {
      await navigator.share?.({
        title: product.name,
        text: `Check out ${product.name} on Fresh Bazar!`,
        url: window.location.href,
      })
    } catch {
      /* cancelled */
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Product not found.</p>
      </div>
    )
  }

  const imageSrc = product.image || product.image_url || undefined

  return (
    <div className="min-h-screen bg-gray-50 pb-10 overflow-x-hidden">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 text-gray-700 hover:text-primary-600 p-1"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
        </div>
      </div>

      <nav className="container mx-auto px-4 flex flex-wrap items-center gap-1 text-xs py-1">
        <Link href="/" className="text-primary-600 font-medium hover:underline">
          Home
        </Link>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        {categorySlug && (
          <>
            <Link
              href={`/category/${categorySlug}`}
              className="text-primary-600 font-medium hover:underline capitalize"
            >
              {categoryName}
            </Link>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </>
        )}
        <span className="text-gray-500 truncate flex-1 min-w-0">
          {product.name}
        </span>
      </nav>

      <div className="container mx-auto px-4 mt-2">
        <GuidanceTips tips={[]} page="product" />
      </div>

      {/* Mobile: stacked (unchanged). Desktop: image left half + details right half. */}
      <section className="bg-white pb-6 mb-8">
        <div className="md:mx-auto md:max-w-6xl md:px-6 md:py-8 md:grid md:grid-cols-2 md:gap-10 md:items-start">
        <div className="relative mx-4 mt-1 md:mx-0 md:mt-0 md:sticky md:top-24 aspect-square max-w-lg md:max-w-none bg-gray-100 rounded-xl md:rounded-2xl overflow-hidden md:border md:border-gray-100 md:shadow-sm">
          <SmartImage
            src={imageSrc}
            alt={product.name}
            fill
            className="object-cover"
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            fallback={
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <ShoppingCart className="w-16 h-16" />
              </div>
            }
          />
          {isFresh && stockQty > 0 && (
            <span className="absolute top-2 left-2 bg-green-600 text-white text-[11px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
              Fresh
            </span>
          )}
          <button
            type="button"
            className="absolute top-2 right-2 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md"
            aria-label="Wishlist"
          >
            <Heart className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="px-4 pt-4 md:px-0 md:pt-0 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="text-[22px] md:text-[28px] font-bold text-gray-900 leading-7 md:leading-9">
              {product.name}
            </h1>
            {product.nameUrdu && (
              <p className="text-base font-semibold text-gray-600 font-urdu" dir="rtl">
                {product.nameUrdu}
              </p>
            )}
          </div>

          {(product as Product & { rating?: number }).rating != null &&
            (product as Product & { rating?: number }).rating! > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <Star className="w-[18px] h-[18px] text-yellow-400 fill-yellow-400" />
              <span className="text-[15px] font-bold text-gray-900">
                {(product as Product & { rating?: number }).rating}
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-[13px] text-gray-500">
                {(product as Product & { reviews?: number }).reviews ?? 0} reviews
              </span>
            </div>
          )}

          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <ProductPrice
                price={displayPrice}
                unit={product.unit}
                size="lg"
                compareAtPrice={product.compareAtPrice}
              />
            </div>
            <button
              type="button"
              onClick={handleShare}
              className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 shrink-0"
              aria-label="Share"
            >
              <Share2 className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <UnitSelector
            product={product}
            selectedUnit={selectedUnit}
            onChange={setSelectedUnit}
            size="md"
            fullWidth
          />

          {product.description && (
            <p className="text-sm text-gray-600 leading-[22px]">
              {product.description}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 w-[48%] min-w-[46%] text-xs text-gray-600 leading-4">
              <Truck className="w-4 h-4 text-primary-600 shrink-0" />
              <span>
                Free Delivery on Rs. {freeThreshold}+ Sabzi/Fruits
              </span>
            </div>
            <div className="flex items-center gap-1.5 w-[48%] min-w-[46%] text-xs text-gray-600 leading-4">
              <ShieldCheck className="w-4 h-4 text-primary-600 shrink-0" />
              <span>Freshness Guaranteed</span>
            </div>
          </div>

          {!isFresh || stockQty <= 0 ? (
            <span className="inline-block bg-red-100 text-red-600 text-xs font-bold px-4 py-2 rounded-full mt-1">
              Out of Stock
            </span>
          ) : (
            <span className="inline-block bg-primary-50 text-primary-700 text-xs font-bold px-4 py-2 rounded-full border border-primary-100 mt-1">
              In Stock ({stockQty} {product.unit}s available)
            </span>
          )}

          {isFresh && stockQty > 0 && (
            <div className="flex items-center gap-4 mt-6">
              <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-[18px] h-[18px] text-gray-700" />
                </button>
                <span className="min-w-[28px] text-center text-base font-bold text-gray-900 tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((q) => Math.min(maxQuantity, q + 1))
                  }
                  disabled={quantity >= maxQuantity}
                  className="w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-[18px] h-[18px] text-gray-700" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className={`flex-1 inline-flex items-center justify-center gap-2 py-3.5 rounded-lg font-bold text-white text-base transition-colors ${
                  inCart
                    ? 'bg-primary-700 hover:bg-primary-800'
                    : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {inCart ? (
                  <>
                    <Check className="w-5 h-5" />
                    Added to Cart
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    Add to Cart
                  </>
                )}
              </button>
            </div>
          )}
        </div>
        </div>
      </section>

      <ProductReviews productId={product.id} />

      {relatedProducts.length > 0 && (
        <div className="container mx-auto px-4">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Related Products
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
