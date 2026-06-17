'use client'

import { usePathname } from 'next/navigation'
import Footer from './Footer'
import { hideConsumerChrome } from '@/lib/restaurantChrome'

const HIDE_FOOTER_PATHS = ['/cart', '/checkout']

export default function ConditionalFooter() {
  const pathname = usePathname()
  if (HIDE_FOOTER_PATHS.includes(pathname) || hideConsumerChrome(pathname)) return null
  return <Footer />
}
