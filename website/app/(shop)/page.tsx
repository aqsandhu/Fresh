import type { Metadata } from 'next'
import HeroSection from '@/components/sections/HeroSection'
import CategoriesSection from '@/components/sections/CategoriesSection'
import FeaturedProductsSection from '@/components/sections/FeaturedProductsSection'
import HowItWorksSection from '@/components/sections/HowItWorksSection'
import DeliveryInfoSection from '@/components/sections/DeliveryInfoSection'
import AppDownloadSection from '@/components/sections/AppDownloadSection'

export const metadata: Metadata = {
  title: 'Fresh Groceries Delivered | Fresh Bazar',
  description: 'Get farm-fresh vegetables, fruits, dry fruits, and chicken delivered to your doorstep. Free delivery on orders above Rs. 500.',
}

export default function HomePage() {
  return (
    <div className="animate-fade-in">
      <HeroSection />
      <CategoriesSection />
      <FeaturedProductsSection />
      <HowItWorksSection />
      <DeliveryInfoSection />
      <AppDownloadSection />
    </div>
  )
}
