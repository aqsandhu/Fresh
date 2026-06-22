import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ConditionalHeader from '@/components/layout/ConditionalHeader'
import ConditionalFooter from '@/components/layout/ConditionalFooter'
import ConditionalMobileNav from '@/components/layout/ConditionalMobileNav'
import { Toaster } from 'react-hot-toast'
import AppProviders from '@/components/providers/AppProviders'
import BrandFavicon from '@/components/BrandFavicon'
import ErrorBoundary from '@/components/providers/ErrorBoundary'
import TodaysBasketModal from '@/components/basket/TodaysBasketModal'
import AiChatWidget from '@/components/ai/AiChatWidget'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ErrorBoundary>
          <AppProviders>
            <BrandFavicon />
            <div className="min-h-screen flex flex-col">
              <ConditionalHeader />
              <main className="flex-1">{children}</main>
              <ConditionalFooter />
              <ConditionalMobileNav />
            </div>
            <TodaysBasketModal />
            <AiChatWidget />
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
