'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchBrandLogoUrl } from '@/lib/brand'

interface BrandLogoProps {
  className?: string
  imgClassName?: string
  showText?: boolean
}

export default function BrandLogo({
  className = '',
  imgClassName = 'h-9 w-auto max-w-[140px] object-contain',
  showText = true,
}: BrandLogoProps) {
  const { data: logoUrl, isLoading } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: fetchBrandLogoUrl,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className={`flex items-center gap-2 shrink-0 min-w-0 ${className}`}>
      {isLoading ? (
        <div className="h-9 w-24 bg-gray-100 animate-pulse rounded" />
      ) : logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Fresh Bazar" className={imgClassName} />
      ) : (
        <span className="font-bold text-primary-700 text-lg">FB</span>
      )}
      {showText && (
        <div className="hidden sm:block min-w-0">
          <p className="font-bold text-lg leading-tight text-gray-900">Fresh Bazar</p>
          <p className="text-[11px] text-primary-600 font-urdu leading-tight" dir="rtl">
            فریش بازار
          </p>
        </div>
      )}
    </div>
  )
}
