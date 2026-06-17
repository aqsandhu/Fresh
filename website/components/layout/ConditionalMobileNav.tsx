'use client'

import { usePathname } from 'next/navigation'
import MobileNav from './MobileNav'
import { hideConsumerChrome } from '@/lib/restaurantChrome'

export default function ConditionalMobileNav() {
  const pathname = usePathname()
  if (hideConsumerChrome(pathname)) return null
  return <MobileNav />
}
