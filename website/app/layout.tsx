import type { Metadata } from 'next'
import { Inter, Bricolage_Grotesque } from 'next/font/google'
import './globals.css'
import ConditionalHeader from '@/components/layout/ConditionalHeader'
import ConditionalFooter from '@/components/layout/ConditionalFooter'
import ConditionalMobileNav from '@/components/layout/ConditionalMobileNav'
import { Toaster } from 'react-hot-toast'
import AppProviders from '@/components/providers/AppProviders'
import BrandFavicon from '@/components/BrandFavicon'
import ErrorBoundary from '@/components/providers/ErrorBoundary'
import SentryInit from '@/components/providers/SentryInit'
import TodaysBasketModal from '@/components/basket/TodaysBasketModal'
import AiChatWidget from '@/components/ai/AiChatWidget'
import MarketingTracker from '@/components/marketing/MarketingTracker'

const inter = Inter({ subsets: ['latin'] })

// Display face for headlines (exposed as --font-display / Tailwind `font-display`).
// Body text stays Inter so the rest of the site is untouched.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
})

// The Google-search favicon is generated as a real, square, same-origin PNG by
// app/icon.tsx (+ app/apple-icon.tsx); Next injects their <link rel="icon"> into
// the server HTML <head>, which is what crawlers read. We deliberately do NOT
// set `icons` here — that would double up and re-introduce the cross-origin,
// non-square Supabase image Google was refusing to show.
export function generateMetadata(): Metadata {
  return {
    // Base used to turn relative OG/Twitter image paths and canonical URLs into
    // absolute ones. Without it Next falls back to localhost in production builds.
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://freshbazar.pk'),
    title: {
      default: 'Fresh Bazar Pakistan - Fresh Groceries Delivered',
      template: '%s | Fresh Bazar',
    },
    description: 'Your trusted partner for fresh groceries delivery in Pakistan. Fresh vegetables, fruits, dry fruits, and chicken delivered to your doorstep.',
    keywords: ['fresh bazar', 'fresh vegetables', 'grocery delivery', 'Pakistan', 'fruits', 'chicken', 'atta chakki'],
    authors: [{ name: 'Fresh Bazar' }],
    openGraph: {
      type: 'website',
      locale: 'en_PK',
      url: 'https://freshbazar.pk',
      siteName: 'Fresh Bazar Pakistan',
      title: 'Fresh Bazar Pakistan - Fresh Groceries Delivered',
      description: 'Your trusted partner for fresh groceries delivery in Pakistan.',
      images: [
        {
          url: '/og-image.jpg',
          width: 1200,
          height: 630,
          alt: 'Fresh Bazar Pakistan',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Fresh Bazar Pakistan - Fresh Groceries Delivered',
      description: 'Your trusted partner for fresh groceries delivery in Pakistan.',
      images: ['/og-image.jpg'],
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${bricolage.variable}`}>
        <ErrorBoundary>
          <AppProviders>
            <SentryInit />
            <BrandFavicon />
            <div className="min-h-screen flex flex-col">
              <ConditionalHeader />
              <main className="flex-1">{children}</main>
              <ConditionalFooter />
              <ConditionalMobileNav />
            </div>
            <TodaysBasketModal />
            <AiChatWidget />
            <MarketingTracker />
            <Toaster
              position="top-center"
              toastOptions={{
                duration: 3000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#22c55e',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 4000,
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </AppProviders>
        </ErrorBoundary>
      </body>
    </html>
  )
}
