import type { Metadata } from 'next'
import HeroSection from '@/components/sections/HeroSection'
import CategoriesSection from '@/components/sections/CategoriesSection'
import FeaturedProductsSection from '@/components/sections/FeaturedProductsSection'
import DeliveryInfoSection from '@/components/sections/DeliveryInfoSection'
import AppDownloadSection from '@/components/sections/AppDownloadSection'
import GuidanceTips from '@/components/guidance/GuidanceTips'

export const metadata: Metadata = {
  // `absolute` overrides the root layout's title.template entirely, so the
  // homepage <title> is EXACTLY this string — the "%s | Fresh Bazar" template
  // is NOT appended (which is why there's no double "Fresh Bazar"). Other
  // pages still use the template normally.
  title: { absolute: 'Fresh Bazar | Fresh Sabzi Fruit' },
  description: 'Get farm-fresh vegetables, fruits, dry fruits, and chicken delivered to your doorstep. Free delivery on Rs. 500+ vegetables/fruits.',
}

export default function HomePage() {
  return (
    <div className="animate-fade-in">
      <div className="container mx-auto px-4 mt-4">
        <GuidanceTips tips={[]} page="home" />
      </div>
      <CategoriesSection />
      {/* Products lead the page; the hero brand band follows them. */}
      <FeaturedProductsSection />
      <HeroSection />
      <DeliveryInfoSection />
      <AppDownloadSection />
    </div>
  )
}
