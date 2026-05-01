'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Filter, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import ProductCard from '@/components/ui/ProductCard'
import Button from '@/components/ui/Button'
import { categoriesApi, productsApi } from '@/lib/api'
import { Product } from '@/types'

type SortOption = 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'

export default function CategoryPage() {
  const params = useParams()
  const slug = params.slug as string
  
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [showFilters, setShowFilters] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [inStockOnly, setInStockOnly] = useState(false)

  // Fetch category info by slug
  const { data: category, isLoading: categoryLoading, error: categoryError } = useQuery({
    queryKey: ['category', slug],
    queryFn: () => categoriesApi.getBySlug(slug),
    retry: false,
  })

  // Map sort option to backend params
  const sortMap: Record<SortOption, { sortBy: string; sortOrder: string }> = {
    'price-asc': { sortBy: 'price', sortOrder: 'asc' },
    'price-desc': { sortBy: 'price', sortOrder: 'desc' },
    'name-asc': { sortBy: 'name_en', sortOrder: 'asc' },
    'name-desc': { sortBy: 'name_en', sortOrder: 'desc' },
  }

  // Fetch products for this category from the database
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['category-products', category?.id, sortBy, minPrice, maxPrice, inStockOnly],
    queryFn: () => {
      const sort = sortMap[sortBy]
      return productsApi.getAll({
        category: category!.id,
        limit: 50,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
        ...(minPrice ? { minPrice: parseInt(minPrice) } : {}),
        ...(maxPrice ? { maxPrice: parseInt(maxPrice) } : {}),
        ...(inStockOnly ? { inStock: 'true' } : {}),
      })
    },
    enabled: !!category?.id,
  })

  const products: Product[] = productsData?.products || []

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            {category?.name || slug}
          </h1>
          {category?.nameUrdu && (
            <p className="text-lg text-gray-600 font-urdu" dir="rtl">
              {category.nameUrdu}
            </p>
          )}
        </motion.div>

        {/* Filters & Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full sm:w-auto"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="price-asc">Price (Low to High)</option>
              <option value="price-desc">Price (High to Low)</option>
            </select>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white rounded-xl p-6 mb-6 shadow-sm"
          >
            <div className="grid md:grid-cols-3 gap-6">
              {/* Price Range */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Price Range</h4>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <span className="text-gray-500">-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Stock Filter */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Availability</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <span className="text-sm text-gray-600">In Stock Only</span>
                </label>
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMinPrice('')
                    setMaxPrice('')
                    setInStockOnly(false)
                    setSortBy('name-asc')
                  }}
                >
                  Clear All Filters
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Results Count */}
        <p className="text-sm text-gray-500 mb-4">
          {isLoading ? 'Loading...' : `Showing ${products.length} products`}
        </p>

        {/* Products Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        ) : categoryError ? (
          <div className="text-center py-12">
            <p className="text-gray-700 font-medium mb-2">Category not found</p>
            <p className="text-gray-500 text-sm">
              No category exists with slug <code className="bg-gray-100 px-1.5 py-0.5 rounded">{slug}</code>.
              Add this category from the admin panel and assign products to it.
            </p>
          </div>
        ) : !categoryLoading && !category ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading category...</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-700 font-medium mb-2">No products in this category yet</p>
            <p className="text-gray-500 text-sm">
              Add products to <strong>{category?.name || slug}</strong> from the admin panel.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
