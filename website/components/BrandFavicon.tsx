'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBrandLogoUrl } from '@/lib/brand'

const FAVICON_RELS: Array<{ rel: string; sizes?: string }> = [
  { rel: 'icon', sizes: '32x32' },
  { rel: 'icon', sizes: '48x48' },
  { rel: 'icon', sizes: '96x96' },
  { rel: 'apple-touch-icon', sizes: '180x180' },
  { rel: 'icon', sizes: '192x192' },
]

/** Sets favicon / touch icons from Supabase logo (larger sizes for recognition). */
export default function BrandFavicon() {
  const { data: logoUrl } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: fetchBrandLogoUrl,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!logoUrl) return

    const created: HTMLLinkElement[] = []

    for (const { rel, sizes } of FAVICON_RELS) {
      const selector = sizes
        ? `link[rel="${rel}"][sizes="${sizes}"]`
        : `link[rel="${rel}"]`
      let link = document.querySelector<HTMLLinkElement>(selector)
      if (!link) {
        link = document.createElement('link')
        link.rel = rel
        if (sizes) link.setAttribute('sizes', sizes)
        document.head.appendChild(link)
        created.push(link)
      }
      link.type = 'image/png'
      link.href = logoUrl
    }

    return () => {
      for (const link of created) {
        link.remove()
      }
    }
  }, [logoUrl])

  return null
}
