'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { 
  ChevronLeft, 
  Minus, 
  Plus, 
  ShoppingCart, 
  Check, 
  Star,
  Truck,
  Shield,
  Clock,
  Heart,
  Share2,
  Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import ProductCard from '@/components/ui/ProductCard'
import { useCartStore } from '@/store/cartStore'
import { productsApi } from '@/lib/api'
import { formatPriceShort } from '@/lib/utils'
import { Product } from '@/types'

export default function ProductDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [quantity, setQuantity] = useState(1)
  const { addItem, items } = useCartStore()

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.getById(id),
  })

  // Fetch related products from same category
  const { data: relatedData } = useQuery({
    queryKey: ['related-products', product?.categoryId],
    queryFn: () => productsApi.getAll({ category: product!.categoryId, limit: 5 }),
    enabled: !!product?.categoryId,
  })

  const relatedProducts: Product[] = (relatedData?.products || [] as Product[])
    .filter((p: Product) => p.id !== id)
    .slice(0, 4)

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

  const inCart = items.find((item) => item.product.id === product.id)

  const handleAddToCart = () => {
    addItem(product, quantity)
    toast.success(`${product.name} added to cart!`)
  }

  const hasValidImage = Boolean(product?.image || product?.image_url)
  const imageSrc = product?.image || product?.image_url || '/placeholder-product.png'

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-primary-600">Home</Link>
          <ChevronLeft className="w-4 h-4" />
          <Link href={`/category/${product.category}`} className="hover:text-primary-600 capitalize">
            {product.category}
          </Link>
          <ChevronLeft className="w-4 h-4" />
          <span className="text-gray-900">{product.name}</span>
        </nav>

        {/* Product Details */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-12">
          <div className="grid lg:grid-cols-2 gap-8 p-6 md:p-8">
            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden"
            >
              {hasValidImage ? (
                <Image
                  src={imageSrc}
                  alt={product.name}
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <ShoppingCart className="w-24 h-24" />
                </div>
              )}
              {product.isFresh && (
                <div className="absolute top-4 left-4">
                  <Badge variant="success">Fresh</Badge>
                </div>
              )}
              <button className="absolute top-4 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md hover:bg-gray-50">
                <Heart className="w-5 h-5 text-gray-600" />
              </button>
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
                    {product.name}
                  </h1>
                  <p className="text-lg text-gray-600 font-urdu" dir="rtl">
                    {product.nameUrdu}
                  </p>
                </div>
                <button className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
                  <Share2 className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* Rating */}
              {product.rating && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    <span className="font-semibold">{product.rating}</span>
                  </div>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">{product.reviews} reviews</span>
                </div>
              )}

              {/* Price */}
              <div className="mb-6">
                <span className="text-3xl font-bold text-primary-700">
                  {formatPriceShort(product.price)}
                </span>
                <span className="text-gray-500 ml-2">per {product.unit}</span>
              </div>

              {/* Description */}
              <p className="text-gray-600 mb-6">{product.description}</p>

              {/* Features */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Truck className="w-4 h-4 text-primary-600" />
                  <span>Free delivery above Rs. 500</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Shield className="w-4 h-4 text-primary-600" />
                  <span>Freshness guaranteed</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4 text-primary-600" />
                  <span>Same day delivery</span>
                </div>
              </div>

              {/* Stock Status */}
              <div className="mb-6">
                {product.isFresh && product.stock > 0 ? (
                  <Badge variant="success">In Stock ({product.stock} {product.unit}s available)</Badge>
                ) : (
                  <Badge variant="danger">Out of Stock</Badge>
                )}
              </div>

              {/* Quantity & Add to Cart */}
              {product.isFresh && product.stock > 0 && (
                <div className="flex flex-col sm:flex-row gap-4 mt-auto">
                  {/* Quantity Selector */}
                  <div className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-2">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center font-semibold">{quantity}</span>
                    <button
                      onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <Button
                    onClick={handleAddToCart}
                    size="lg"
                    className="flex-1"
                  >
                    {inCart ? (
                      <>
                        <Check className="w-5 h-5 mr-2" />
                        Added to Cart
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        Add to Cart
                      </>
                    )}
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Related Products
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {relatedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
