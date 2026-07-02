'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useCityContext } from '@/context/CityContext'
import CategoryCard from '@/components/ui/CategoryCard'
import { categoriesApi } from '@/lib/api'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
}

export default function CategoriesSection() {
  const { selectedCityId } = useCityContext()
  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories', selectedCityId],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!selectedCityId,
  })

  return (
    <section className="py-14 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-8 md:mb-10 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">
              <span className="h-px w-6 bg-primary-600" aria-hidden="true" />
              Categories
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
              Shop by category
            </h2>
            <p
              className="mt-2 text-base md:text-lg font-semibold text-gray-500 font-urdu leading-loose text-left"
              dir="rtl"
            >
              کیٹیگری کے مطابق خریداری کریں
            </p>
          </div>
          <Link
            href="/products"
            className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-primary-600 hover:text-primary-700"
          >
            All products
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>

        {/* Loading State */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-48 md:h-64 rounded-2xl bg-gray-100 animate-pulse"
              />
            ))}
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No categories available at the moment.</p>
          </div>
        ) : (
          /* Categories Grid — large image tiles */
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5"
          >
            {categories.map((category) => (
              <motion.div key={category.id} variants={itemVariants}>
                <CategoryCard category={category} variant="large" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  )
}
