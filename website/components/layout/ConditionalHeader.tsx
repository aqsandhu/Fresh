'use client'

import { usePathname } from 'next/navigation'
import Header from './Header'
import { hideConsumerChrome } from '@/lib/restaurantChrome'

export default function ConditionalHeader() {
  const pathname = usePathname()
  if (hideConsumerChrome(pathname)) return null
  return <Header />
}
