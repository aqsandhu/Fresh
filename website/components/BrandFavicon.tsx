'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBrandFaviconUrl } from '@/lib/favicon'
import { applyBrandFavicons } from '@/lib/brandFavicon'

export default function BrandFavicon() {
  const { data: faviconUrl } = useQuery({
    queryKey: ['brand-favicon'],
    queryFn: fetchBrandFaviconUrl,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!faviconUrl) return
    let cleanup: (() => void) | undefined
    let cancelled = false

    applyBrandFavicons(faviconUrl).then((fn) => {
      if (cancelled) {
        fn()
        return
      }
      cleanup = fn
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [faviconUrl])

  return null
}
