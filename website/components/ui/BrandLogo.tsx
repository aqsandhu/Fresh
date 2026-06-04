'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchBrandLogoUrl } from '@/lib/brand'
import { cn } from '@/lib/utils'

type BrandLogoSize = 'nav' | 'default' | 'lg'

const IMG_CLASSES: Record<BrandLogoSize, string> = {
  nav: 'h-[90%] max-h-full w-auto max-w-none object-contain object-center',
  default: 'h-10 w-auto max-w-none object-contain',
  lg: 'h-20 sm:h-24 w-auto max-w-none object-contain',
}

const SKELETON_CLASSES: Record<BrandLogoSize, string> = {
  nav: 'h-[90%] max-h-full w-24',
  default: 'h-10 w-20',
  lg: 'h-20 w-32',
}

interface BrandLogoProps {
  className?: string
  imgClassName?: string
  size?: BrandLogoSize
}

/** Logo image only — no title text beside the mark (nav/footer/header). */
export default function BrandLogo({
  className = '',
  imgClassName,
  size = 'default',
}: BrandLogoProps) {
  const imageClass = imgClassName ?? IMG_CLASSES[size]
  const isNav = size === 'nav'
  const { data: logoUrl, isLoading } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: fetchBrandLogoUrl,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div
      className={cn(
        'flex items-center shrink-0 min-w-0 leading-none',
        isNav && 'h-full',
        className
      )}
    >
      {isLoading ? (
        <div
          className={cn(
            SKELETON_CLASSES[size],
            'bg-gray-100 animate-pulse rounded shrink-0'
          )}
        />
      ) : logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className={imageClass} />
      ) : (
        <span
          className={
            isNav
              ? 'font-bold text-primary-700 text-base leading-none'
              : 'font-bold text-primary-700 text-lg leading-none'
          }
        >
          FB
        </span>
      )}
    </div>
  )
}
