'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchBrandLogoUrl } from '@/lib/brand'

type BrandLogoSize = 'nav' | 'default' | 'lg'

const SIZE_CLASSES: Record<BrandLogoSize, string> = {
  nav: 'h-11 sm:h-12 w-auto max-w-[220px] object-contain',
  default: 'h-9 w-auto max-w-[140px] object-contain',
  lg: 'h-16 sm:h-20 w-auto max-w-[280px] object-contain',
}

const SKELETON_CLASSES: Record<BrandLogoSize, string> = {
  nav: 'h-11 sm:h-12 w-28',
  default: 'h-9 w-24',
  lg: 'h-16 w-32',
}

interface BrandLogoProps {
  className?: string
  imgClassName?: string
  showText?: boolean
  priority?: boolean
  size?: BrandLogoSize
}

export default function BrandLogo({
  className = '',
  imgClassName,
  showText = true,
  size = 'default',
}: BrandLogoProps) {
  const imageClass = imgClassName ?? SIZE_CLASSES[size]
  const { data: logoUrl, isLoading } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: fetchBrandLogoUrl,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className={`flex items-center gap-2.5 shrink-0 min-w-0 ${className}`}>
      {isLoading ? (
        <div
          className={`${SKELETON_CLASSES[size]} bg-gray-100 animate-pulse rounded`}
        />
      ) : logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Fresh Bazar" className={imageClass} />
      ) : (
        <span
          className={
            size === 'nav'
              ? 'font-bold text-primary-700 text-xl'
              : 'font-bold text-primary-700 text-lg'
          }
        >
          FB
        </span>
      )}
      {showText && (
        <div className="hidden sm:block min-w-0">
          <p
            className={`font-bold leading-tight text-gray-900 ${
              size === 'nav' ? 'text-base' : 'text-lg'
            }`}
          >
            Fresh Bazar
          </p>
          <p className="text-[11px] text-primary-600 font-urdu leading-tight" dir="rtl">
            فریش بازار
          </p>
        </div>
      )}
    </div>
  )
}
