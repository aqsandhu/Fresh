'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBrandLogoUrl } from '@/lib/brand'

/** Sets document favicon from Supabase logo URL when available. */
export default function BrandFavicon() {
  const { data: logoUrl } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: fetchBrandLogoUrl,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!logoUrl) return
    const link =
      document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
      document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/png'
    link.href = logoUrl
    if (!link.parentNode) document.head.appendChild(link)
  }, [logoUrl])

  return null
}
