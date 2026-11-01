'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
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
import { categoriesApi, productsApi, nextProductPage, PRODUCTS_PAGE_SIZE } from '@/lib/api'
import { Product } from '@/types'

export default function CategoryPage() {
  const params = useParams()
  const slug = params.slug as string

  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_LISTING_FILTERS)

  // Fetch category info by slug
  const {
    data: category,
    isLoading: categoryLoading,
    isPending: categoryPending,
    error: categoryError,
  } = useQuery({
    queryKey: ['category', slug],
    queryFn: () => categoriesApi.getBySlug(slug),
    retry: false,
  })

  // Fetch products for this category from the database
  // Backend caps a page at 100 — page through with "Load more" so large
  // categories are never silently truncated.
  const {
    data: productsData,
    isLoading: productsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'category-products',
      category?.id,
      filters.sortBy,
      filters.minPrice,
      filters.maxPrice,
      filters.inStockOnly,
    ],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      productsApi.getAll({
        category: category!.id,
        page: pageParam,
        limit: PRODUCTS_PAGE_SIZE,
        ...listingQueryParams(filters),
      }),
    getNextPageParam: (lastPage) => nextProductPage(lastPage.meta),
    enabled: !!category?.id,
  })

  const products: Product[] = productsData?.pages.flatMap((p) => p.products) ?? []
  const totalProducts = Number(productsData?.pages[0]?.meta?.total) || products.length
  // While the category itself is still resolving, the products query is
  // disabled (TanStack v5 reports isLoading=false then) — treat that as loading
  // so the page never flashes "Showing 0 products / No products yet".
  const isLoading = categoryLoading || (!!category?.id && productsLoading)
  // 404 from /categories/:slug → error. (isPending, not isLoading: a paused
  // offline query must not be mistaken for a missing category.)
  const notFound = !!categoryError || (!categoryPending && !category)

  const browseAll = (
    <Link href="/products">
      <Button variant="outline">Browse all products</Button>
    </Link>
  )

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
            {category?.name || (categoryLoading ? '…' : notFound ? 'Category not found' : slug)}
          </h1>
          {category?.nameUrdu && (
            <p className="text-lg text-gray-600 font-urdu" dir="rtl">
              {category.nameUrdu}
            </p>
          )}
        </motion.div>

        {notFound ? (
          <ListingEmptyState
            title="This category is not available"
            message="It may have been renamed or removed. You can still browse everything we have."
            action={browseAll}
          />
        ) : (
          <>
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
                hasActiveFilters(filters) ? (
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
                    title={`No products in ${category?.name || 'this category'} yet`}
                    message="New stock is added regularly — please check back soon."
                    action={browseAll}
                  />
                )
              }
            />
          </>
        )}
      </div>
    </div>
  )
}
