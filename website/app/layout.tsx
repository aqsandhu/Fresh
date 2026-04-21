import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import MobileNav from '@/components/layout/MobileNav'
import { Toaster } from 'react-hot-toast'
import QueryProvider from '@/components/providers/QueryProvider'
import ErrorBoundary from '@/components/providers/ErrorBoundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'SabziWala Pakistan - Fresh Groceries Delivered',
    template: '%s | SabziWala Pakistan',
  },
  description: 'Your trusted partner for fresh groceries delivery in Pakistan. Fresh vegetables, fruits, dry fruits, and chicken delivered to your doorstep.',
  keywords: ['sabzi', 'fresh vegetables', 'grocery delivery', 'Pakistan', 'fruits', 'chicken', 'atta chakki'],
  authors: [{ name: 'SabziWala' }],
  openGraph: {
    type: 'website',
    locale: 'en_PK',
    url: 'https://sabziwala.pk',
    siteName: 'SabziWala Pakistan',
    title: 'SabziWala Pakistan - Fresh Groceries Delivered',
    description: 'Your trusted partner for fresh groceries delivery in Pakistan.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'SabziWala Pakistan',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SabziWala Pakistan - Fresh Groceries Delivered',
    description: 'Your trusted partner for fresh groceries delivery in Pakistan.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
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
          <QueryProvider>
            <div className="min-h-screen flex flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
              <MobileNav />
            </div>
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
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
