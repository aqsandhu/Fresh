import type { Metadata } from 'next'
import HeroSection from '@/components/sections/HeroSection'
import FeaturedProductsSection from '@/components/sections/FeaturedProductsSection'
import DeliveryInfoSection from '@/components/sections/DeliveryInfoSection'
import AppDownloadSection from '@/components/sections/AppDownloadSection'

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
      {/* Instructions show via the global InstructionsPopup (lightbulb icon).
          Categories live in the left swipe drawer (CategoriesDrawer);
          products lead the page and the hero brand band follows them. */}
      <FeaturedProductsSection />
      <HeroSection />
      <DeliveryInfoSection />
      <AppDownloadSection />
    </div>
  )
}
