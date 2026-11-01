'use client'

// All-products listing page. Reachable from the homepage "View all products"
// button, the mobile bottom nav "Shop" tab, and any "Continue shopping" CTA.
// Filters, sort and the grid are the shared components/shop/ProductListing
// pieces (same as the category page); products come from productsApi.getAll
// without a category filter.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useInfiniteQuery } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import {
  DEFAULT_LISTING_FILTERS,
  ListingEmptyState,
  ListingFilters,
  ProductListingFilters,
  ProductListingGrid,
  hasActiveFilters,
  listingQueryParams,
} from '@/components/shop/ProductListing'
import { productsApi, nextProductPage, PRODUCTS_PAGE_SIZE } from '@/lib/api'
import { Product } from '@/types'
import { useOptionalCityName } from '@/context/CityContext'

export default function AllProductsPage() {
  const cityName = useOptionalCityName()
  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_LISTING_FILTERS)

  // The backend caps a page at 100 (parsePagination) — a single `limit: 2000`
  // request silently hid everything past the first 100 products. Page through
  // with "Load more" instead.
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['all-products', filters.sortBy, filters.minPrice, filters.maxPrice, filters.inStockOnly],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      productsApi.getAll({
        page: pageParam,
        limit: PRODUCTS_PAGE_SIZE,
        ...listingQueryParams(filters),
      }),
    getNextPageParam: (lastPage) => nextProductPage(lastPage.meta),
  })

  const products: Product[] = data?.pages.flatMap((p) => p.products) ?? []
  const totalProducts = Number(data?.pages[0]?.meta?.total) || products.length
  const filtered = hasActiveFilters(filters)

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
            Shop All Products
          </h1>
          <p className="text-gray-600">Fresh groceries delivered across {cityName}</p>
        </motion.div>

        <ProductListingFilters value={filters} onChange={setFilters} />

        {/* Results Count */}
        <p className="text-sm text-gray-500 mb-4">
          {isLoading ? 'Loading...' : `Showing ${products.length} of ${totalProducts} products`}
        </p>

        <ProductListingGrid
          products={products}
          total={totalProducts}
          isLoading={isLoading}
          hasNextPage={!!hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          empty={
            filtered ? (
              <ListingEmptyState
                title="No products match these filters"
                message="Try a different price range or clear the filters."
                action={
                  <Button variant="outline" onClick={() => setFilters(DEFAULT_LISTING_FILTERS)}>
                    Clear All Filters
                  </Button>
                }
              />
            ) : (
              <ListingEmptyState
                title="No products available right now"
                message={`We're restocking ${cityName || 'your city'} — please check back soon.`}
              />
            )
          }
        />
      </div>
    </div>
  )
}
