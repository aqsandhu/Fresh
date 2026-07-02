'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Loader2 } from 'lucide-react'
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

/** Mirrors customer-app FeaturedProductsSection layout. */
export default function FeaturedProductsSection() {
  const { selectedCityId } = useCityContext()
  const { data: featuredProducts, isLoading } = useQuery({
    queryKey: ['featured-products', selectedCityId],
    queryFn: () => productsApi.getFeatured(500),
    enabled: !!selectedCityId,
  })

  return (
    <section className="py-10 md:py-14 bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary-700 ring-1 ring-primary-100">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            Fresh Today
          </span>
          <h2 className="mt-3 text-[26px] md:text-3xl font-bold text-gray-900">
            Featured Products
          </h2>
          <p className="mt-1 text-base font-bold text-gray-500 font-urdu" dir="rtl">
            آج کی تازہ پروڈکٹس
          </p>
        </motion.div>

        <Link
          href="/products"
          className="mt-2 mb-6 flex items-center justify-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
        >
          Click to View All Products
          <ArrowRight className="w-4 h-4" />
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
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
