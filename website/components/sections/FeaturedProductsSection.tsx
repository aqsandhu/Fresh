'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Loader2 } from 'lucide-react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCityContext } from '@/context/CityContext'
import ProductCard from '@/components/ui/ProductCard'
import { productsApi, nextProductPage } from '@/lib/api'
import { Product } from '@/types'

/**
 * Featured cards shown per batch. The first batch keeps the category wall
 * close; "View More Products" reveals the next batch of featured products not
 * shown yet, again and again, until every featured product is on screen (the
 * API caps one request at 100, so the old single `getFeatured(100)` call could
 * never show the 101st). Same batch size as the customer app.
 */
const FEATURED_BATCH = 20

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
}

/** Mirrors customer-app FeaturedProductsSection layout. */
export default function FeaturedProductsSection() {
  const { selectedCityId } = useCityContext()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['featured-products', selectedCityId, 'batches', FEATURED_BATCH],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => productsApi.getFeaturedPage(pageParam, FEATURED_BATCH),
    getNextPageParam: (lastPage) => nextProductPage(lastPage.meta),
    enabled: !!selectedCityId,
  })

  // Flatten the batches; a product whose popularity moved between two clicks
  // could come back on a later page — show it once.
  const featuredProducts = useMemo(() => {
    const seen = new Set<string>()
    const out: Product[] = []
    for (const page of data?.pages ?? []) {
      for (const p of page.products) {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          out.push(p)
        }
      }
    }
    return out
  }, [data])
  const total = Number(data?.pages[0]?.meta?.total) || featuredProducts.length
  const remaining = Math.max(total - featuredProducts.length, 0)

  return (
    // Halved top padding — this is the first section under the navbar.
    <section className="pt-5 pb-10 md:pt-7 md:pb-14 bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-[26px] md:text-3xl font-bold text-gray-900 text-center"
        >
          Featured Products
        </motion.h2>

        <Link
          href="/products"
          className="mt-1.5 mb-6 flex items-center justify-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
        >
          Click to View All Products
          <ArrowRight className="w-4 h-4" />
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : featuredProducts.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No featured products available at the moment.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {featuredProducts.map((product) => (
                <motion.div
                  key={product.id}
                  variants={itemVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="min-w-0"
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </div>

            {/* Next batch of featured products — sits right above the category wall. */}
            {hasNextPage && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  aria-label={`View more products, ${remaining} more`}
                  className="flex w-full sm:w-auto sm:min-w-[360px] items-center justify-center gap-3 rounded-2xl bg-primary-600 px-8 py-4 text-white shadow-lg shadow-primary-600/30 transition-colors hover:bg-primary-700 disabled:opacity-80"
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="h-6 w-6 shrink-0 animate-spin" />
                  ) : (
                    <ChevronDown className="h-7 w-7 shrink-0" />
                  )}
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-lg font-extrabold tracking-wide">
                      {isFetchingNextPage ? 'Loading…' : 'View More Products'}
                    </span>
                    {/* Urdu and the count are separate runs so RTL/LTR never reorder them. */}
                    <span className="mt-1 flex items-center gap-2 text-[13px] font-semibold text-primary-100">
                      <span className="font-urdu" dir="rtl">مزید پروڈکٹس دیکھیں</span>
                      {remaining > 0 ? (
                        <span dir="ltr" className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold text-white">
                          +{remaining} more
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
