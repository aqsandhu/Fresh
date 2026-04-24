'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Search,
  Loader2,
  SlidersHorizontal,
  X,
  AlertTriangle
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { productsApi, getApiErrorMessage } from '@/lib/api'
import { Product } from '@/types'
import { formatPriceShort } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { useCartStore } from '@/store/cartStore'
import toast from 'react-hot-toast'

export default function SearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const { addItem } = useCartStore()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState('relevance')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000])

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setProducts([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await productsApi.getAll({
        search: searchQuery.trim(),
        limit: 50,
      })
      setProducts(response.products)
    } catch (err) {
      console.error('Search error:', err)
      const msg = getApiErrorMessage(err)
      setError(msg)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query)
    }, 400) // 400ms debounce

    return () => clearTimeout(timer)
  }, [query, performSearch])

  const handleAddToCart = (product: Product) => {
    addItem(product, 1)
    toast.success(`${product.name} added to cart`)
  }

  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'price-asc':
        return a.price - b.price
      case 'price-desc':
        return b.price - a.price
      case 'name-asc':
        return a.name.localeCompare(b.name)
      case 'name-desc':
        return b.name.localeCompare(a.name)
      default:
        return 0
    }
  })

  const filteredProducts = sortedProducts.filter(
    (p) => p.price >= priceRange[0] && p.price <= priceRange[1]
  )

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        {/* Search Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Search Results
          </h1>
          <p className="text-gray-600">
            {loading ? (
              'Searching...'
            ) : error ? (
              <span className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </span>
            ) : (
              <>
                {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''} for &quot;
                <span className="font-medium text-gray-900">{query}</span>&quot;
              </>
            )}
          </p>
        </motion.div>

        {/* Filters & Sort */}
        {!loading && !error && products.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-wrap items-center justify-between gap-4 mb-6"
          >
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 bg-white rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="relevance">Relevance</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name-asc">Name: A to Z</option>
                <option value="name-desc">Name: Z to A</option>
              </select>
            </div>
          </motion.div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white rounded-xl p-6 mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Filters</h3>
              <button
                onClick={() => setShowFilters(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price Range: Rs. {priceRange[0]} - Rs. {priceRange[1]}
                </label>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="100"
                  value={priceRange[1]}
                  onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                  className="w-full"
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-600">Searching products...</span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <AlertTriangle className="w-20 h-20 text-red-300 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Search Unavailable
            </h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              {error}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/category/sabzi">
                <Button variant="outline">Browse Vegetables</Button>
              </Link>
              <Link href="/category/fruit">
                <Button variant="outline">Browse Fruits</Button>
              </Link>
              <Link href="/">
                <Button>Go Home</Button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* No Results */}
        {!loading && !error && filteredProducts.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <Search className="w-20 h-20 text-gray-300 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              No Results Found
            </h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              We couldn&apos;t find any products matching &quot;{query}&quot;. Try a different search term or browse our categories.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/category/sabzi">
                <Button variant="outline">Browse Vegetables</Button>
              </Link>
              <Link href="/category/fruit">
                <Button variant="outline">Browse Fruits</Button>
              </Link>
              <Link href="/">
                <Button>Go Home</Button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* Product Grid */}
        {!loading && !error && filteredProducts.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm overflow-hidden group"
              >
                <Link href={`/product/${product.id}`}>
                  <div className="relative aspect-square bg-gray-100">
                    <Image
                      src={product.image || product.image_url || '/placeholder-product.png'}
                      alt={product.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                    />
                    {product.isFresh && (
                      <span className="absolute top-3 left-3 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                        Fresh
                      </span>
                    )}
                  </div>
                </Link>
                <div className="p-4">
                  <Link href={`/product/${product.id}`}>
                    <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-primary-600 transition-colors">
                      {product.name}
                    </h3>
                  </Link>
                  <p className="text-gray-500 text-sm mb-3">{product.unit}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xl font-bold text-primary-600">
                        {formatPriceShort(product.price)}
                      </span>
                      {product.compareAtPrice && (
                        <span className="text-sm text-gray-400 line-through ml-2">
                          {formatPriceShort(product.compareAtPrice)}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddToCart(product)}
                      disabled={product.stock === 0}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
