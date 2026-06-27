import type { Metadata } from 'next'
import HeroSection from '@/components/sections/HeroSection'
import CategoriesSection from '@/components/sections/CategoriesSection'
import FeaturedProductsSection from '@/components/sections/FeaturedProductsSection'
import DeliveryInfoSection from '@/components/sections/DeliveryInfoSection'
import AppDownloadSection from '@/components/sections/AppDownloadSection'
import GuidanceTips from '@/components/guidance/GuidanceTips'

export const metadata: Metadata = {
  // The root layout's title.template ("%s | Fresh Bazar") appends the brand
  // automatically, so this string must NOT include "| Fresh Bazar" itself —
  // otherwise the rendered <title> doubles up to "… | Fresh Bazar | Fresh Bazar".
  title: 'Fresh Groceries Delivered',
  description: 'Get farm-fresh vegetables, fruits, dry fruits, and chicken delivered to your doorstep. Free delivery on Rs. 500+ vegetables/fruits.',
}

export default function HomePage() {
  return (
    <div className="animate-fade-in">
      <HeroSection />
      <div className="container mx-auto px-4 mt-4">
        <GuidanceTips tips={[]} page="home" />
      </div>
      <CategoriesSection />
      <FeaturedProductsSection />
      <DeliveryInfoSection />
      <AppDownloadSection />
    </div>
  )
}
