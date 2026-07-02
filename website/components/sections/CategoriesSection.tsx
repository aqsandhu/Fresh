'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useCityContext } from '@/context/CityContext'
import { categoriesApi } from '@/lib/api'
import SmartImage from '@/components/ui/SmartImage'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4 },
  },
}

function TileFallback({ initial }: { initial: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-400 to-primary-600 text-4xl font-bold text-white/80">
      {initial}
    </div>
  )
}

/** Image-tile category wall shown right after the featured products. */
export default function CategoriesSection() {
  const { selectedCityId } = useCityContext()
  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories', selectedCityId],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!selectedCityId,
  })

  if (!isLoading && (!categories || categories.length === 0)) return null

  return (
    <section className="py-10 md:py-14 bg-white">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6 md:mb-8"
        >
          <h2 className="text-[26px] md:text-3xl font-bold text-gray-900">
            Shop by Category
          </h2>
          <p className="mt-1 text-lg font-bold text-gray-500 font-urdu" dir="rtl">
            کیٹیگری کے مطابق خریداری کریں
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4"
          >
            {categories!.map((category) => (
              <motion.div key={category.id} variants={itemVariants}>
                <Link
                  href={`/category/${category.slug}`}
                  className="group relative block aspect-[4/3] overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-lg"
                >
                  <SmartImage
                    src={category.image}
                    alt={category.name}
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                    fallback={<TileFallback initial={category.name.charAt(0)} />}
                  />
                  {/* Readability wash + names */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="text-[15px] font-bold leading-tight text-white">
                      {category.name}
                    </p>
                    <div className="mt-0.5 flex items-end justify-between gap-2">
                      {category.nameUrdu && (
                        <p
                          dir="rtl"
                          className="font-urdu text-[13px] font-bold leading-6 text-white/90"
                        >
                          {category.nameUrdu}
                        </p>
                      )}
                      <ArrowRight className="mb-1 h-4 w-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  )
}
