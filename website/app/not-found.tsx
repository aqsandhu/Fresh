'use client'

import { Search, Home, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Search className="w-12 h-12 text-primary-600" />
        </div>
        
        <h1 className="text-6xl font-bold text-gray-200 mb-2">404</h1>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Page Not Found
        </h2>
        
        <p className="text-gray-600 mb-8">
          Sorry, we couldn&apos;t find the page you&apos;re looking for on Fresh Bazar. It might have been moved or deleted.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button className="flex items-center justify-center gap-2 w-full">
              <Home className="w-4 h-4" />
              Go Home
            </Button>
          </Link>
          
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-gray-500 text-sm mb-4">Looking for something else?</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/category/sabzi" className="text-primary-600 hover:underline text-sm">
              Vegetables
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/category/fruit" className="text-primary-600 hover:underline text-sm">
              Fruits
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/contact" className="text-primary-600 hover:underline text-sm">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
