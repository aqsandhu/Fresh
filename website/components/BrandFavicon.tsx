'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBrandFaviconUrl } from '@/lib/favicon'
import { applyBrandFavicons } from '@/lib/brandFavicon'
import { optimizedImageSrc } from '@/lib/optimizedImage'

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

    // A 256 px copy, not the full upload (610 KB on the live site).
    applyBrandFavicons(optimizedImageSrc(faviconUrl, 256)).then((fn) => {
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
