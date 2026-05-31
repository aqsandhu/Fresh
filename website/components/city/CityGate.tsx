'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useCityContext } from '@/context/CityContext'

const EXEMPT_PREFIXES = ['/select-city', '/login', '/register']

function isExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export default function CityGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { selectedCityId, isReady } = useCityContext()

  useEffect(() => {
    if (!isReady) return
    if (isExemptPath(pathname)) return
    if (!selectedCityId) {
      router.replace('/select-city')
    }
  }, [isReady, pathname, selectedCityId, router])

  if (!isReady) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (!selectedCityId && !isExemptPath(pathname)) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
