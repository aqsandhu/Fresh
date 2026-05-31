'use client'

import { usePathname } from 'next/navigation'
import Footer from './Footer'

const HIDE_FOOTER_PATHS = ['/cart', '/checkout']

export default function ConditionalFooter() {
  const pathname = usePathname()
  if (HIDE_FOOTER_PATHS.includes(pathname)) return null
  return <Footer />
}
