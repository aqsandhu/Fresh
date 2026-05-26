import type { Metadata } from 'next'
import HeroSection from '@/components/sections/HeroSection'
import CategoriesSection from '@/components/sections/CategoriesSection'
import FeaturedProductsSection from '@/components/sections/FeaturedProductsSection'
import DeliveryInfoSection from '@/components/sections/DeliveryInfoSection'
import AppDownloadSection from '@/components/sections/AppDownloadSection'

export const metadata: Metadata = {
  title: 'Fresh Groceries Delivered | Fresh Bazar',
  description: 'Get farm-fresh vegetables, fruits, dry fruits, and chicken delivered to your doorstep. Free delivery on Rs. 500+ vegetables/fruits.',
}

export default function HomePage() {
  return (
    <div className="animate-fade-in">
      <HeroSection />
      <CategoriesSection />
      <FeaturedProductsSection />
      <DeliveryInfoSection />
      <AppDownloadSection />
    </div>
  )
}
