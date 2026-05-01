'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Category } from '@/types'
import { ArrowRight } from 'lucide-react'
import SmartImage from './SmartImage'

interface CategoryCardProps {
  category: Category
  variant?: 'default' | 'large'
}

// Visual fallbacks: gradient panel for the large hero variant, gradient circle
// with the category initial for the default row variant. Used by SmartImage
// when the image is missing or 404s (e.g. Render disk wipe).
function LargeFallback() {
  return <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600" />
}

function SmallFallback({ initial }: { initial: string }) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-2xl">
      {initial}
    </div>
  )
}

export default function CategoryCard({ category, variant = 'default' }: CategoryCardProps) {
  if (variant === 'large') {
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
      >
        <Link href={`/category/${category.slug}`}>
          <div className="relative h-48 md:h-64 rounded-2xl overflow-hidden group">
            <SmartImage
              src={category.image}
              alt={category.name}
              fill
              className="object-cover group-hover:scale-110 transition-transform duration-500"
              sizes="(max-width: 768px) 50vw, 33vw"
              fallback={<LargeFallback />}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h3 className="text-2xl font-bold text-white mb-1">
                {category.name}
              </h3>
              <p className="text-white/80 font-urdu text-lg mb-2" dir="rtl">
                {category.nameUrdu}
              </p>
              <p className="text-white/70 text-sm mb-3">
                {category.productCount} products
              </p>
              <span className="inline-flex items-center text-white text-sm font-medium group-hover:underline">
                Shop Now
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>
          </div>
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Link href={`/category/${category.slug}`}>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow duration-300 group">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
              <SmartImage
                src={category.image}
                alt={category.name}
                fill
                className="object-cover group-hover:scale-110 transition-transform duration-300"
                sizes="64px"
                fallback={<SmallFallback initial={category.name.charAt(0)} />}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                {category.name}
              </h3>
              <p className="text-sm text-gray-500 font-urdu" dir="rtl">
                {category.nameUrdu}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {category.productCount} items
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
