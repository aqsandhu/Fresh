'use client'

// Shared pieces of the two catalog listing pages — /products (all products)
// and /category/[slug] (one category). Both used to carry their own copy of
// the sort map, the filter bar/panel and the grid + "Load more", which had
// already started to drift apart. One copy now; the pages keep only their
// own header and empty-state wording.

import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Filter, Loader2 } from 'lucide-react'
import ProductCard from '@/components/ui/ProductCard'
import Button from '@/components/ui/Button'
import { PRODUCTS_PAGE_SIZE } from '@/lib/api'
import { Product } from '@/types'

export type SortOption = 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'

/** UI sort option → GET /products sortBy / sortOrder. */
export const SORT_MAP: Record<SortOption, { sortBy: string; sortOrder: string }> = {
  'price-asc': { sortBy: 'price', sortOrder: 'asc' },
  'price-desc': { sortBy: 'price', sortOrder: 'desc' },
  'name-asc': { sortBy: 'name_en', sortOrder: 'asc' },
  'name-desc': { sortBy: 'name_en', sortOrder: 'desc' },
}

export interface ListingFilters {
  sortBy: SortOption
  minPrice: string
  maxPrice: string
  inStockOnly: boolean
}

export const DEFAULT_LISTING_FILTERS: ListingFilters = {
  sortBy: 'name-asc',
  minPrice: '',
  maxPrice: '',
  inStockOnly: false,
}

/** True when the shopper narrowed the list (price / stock), not just sorted it. */
export function hasActiveFilters(f: ListingFilters): boolean {
  return Boolean(f.minPrice || f.maxPrice || f.inStockOnly)
}

/** Backend query params (GET /products) for the current filters. */
export function listingQueryParams(f: ListingFilters) {
  const sort = SORT_MAP[f.sortBy]
  return {
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    ...(f.minPrice ? { minPrice: parseInt(f.minPrice) } : {}),
    ...(f.maxPrice ? { maxPrice: parseInt(f.maxPrice) } : {}),
    ...(f.inStockOnly ? { inStock: 'true' } : {}),
  }
}

/** Filter button + sort select + collapsible price / stock panel. */
export function ProductListingFilters({
  value,
  onChange,
}: {
  value: ListingFilters
  onChange: (next: ListingFilters) => void
}) {
  const [showFilters, setShowFilters] = useState(false)
  const set = (patch: Partial<ListingFilters>) => onChange({ ...value, ...patch })

  return (
    <>
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
            value={value.sortBy}
            onChange={(e) => set({ sortBy: e.target.value as SortOption })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="price-asc">Price (Low to High)</option>
            <option value="price-desc">Price (High to Low)</option>
          </select>
        </div>
      </div>

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
                  value={value.minPrice}
                  onChange={(e) => set({ minPrice: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <span className="text-gray-500">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={value.maxPrice}
                  onChange={(e) => set({ maxPrice: e.target.value })}
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
                  checked={value.inStockOnly}
                  onChange={(e) => set({ inStockOnly: e.target.checked })}
                  className="w-4 h-4 text-primary-600 rounded"
                />
                <span className="text-sm text-gray-600">In Stock Only</span>
              </label>
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => onChange(DEFAULT_LISTING_FILTERS)}>
                Clear All Filters
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </>
  )
}

/** Product grid with spinner and "Load more" (the API caps a page at 100). */
export function ProductListingGrid({
  products,
  total,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  empty,
}: {
  products: Product[]
  total: number
  isLoading: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  /** Rendered when loading finished with no products. */
  empty: ReactNode
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (products.length === 0) return <>{empty}</>

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {products.map((product, index) => (
          <motion.div
            key={product.id}
            className="min-w-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min((index % PRODUCTS_PAGE_SIZE) * 0.03, 0.4) }}
          >
            <ProductCard product={product} />
          </motion.div>
        ))}
      </div>
      {hasNextPage && (
        <div className="flex justify-center mt-8">
          <Button variant="outline" onClick={onLoadMore} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : `Load more (${total - products.length} left)`}
          </Button>
        </div>
      )}
    </>
  )
}

/** Customer-facing empty state (no admin instructions — shoppers see this). */
export function ListingEmptyState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-12">
      <p className="text-gray-700 font-medium mb-2">{title}</p>
      <p className="text-gray-500 text-sm">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
