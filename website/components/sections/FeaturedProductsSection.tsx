'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useCityContext } from '@/context/CityContext'
import ProductCard from '@/components/ui/ProductCard'
import { productsApi } from '@/lib/api'

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
}

/** Product grid mirrors customer-app FeaturedProductsSection; header follows the home design system. */
export default function FeaturedProductsSection() {
  const { selectedCityId } = useCityContext()
  const { data: featuredProducts, isLoading } = useQuery({
    queryKey: ['featured-products', selectedCityId],
    queryFn: () => productsApi.getFeatured(500),
    enabled: !!selectedCityId,
  })

  return (
    <section className="py-14 md:py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-6 md:mb-8 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">
              <span className="h-px w-6 bg-primary-600" aria-hidden="true" />
              Handpicked daily
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
              Featured products
            </h2>
          </div>
          <Link
            href="/products"
            className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-primary-600 hover:text-primary-700"
          >
            View all products
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-72 rounded-xl bg-gray-100 animate-pulse"
              />
            ))}
          </div>
        ) : !featuredProducts || featuredProducts.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No featured products available at the moment.
          </p>
        ) : (
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
        )}
      </div>
    </section>
  )
}
