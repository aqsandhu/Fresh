'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchBrandLogoUrl } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { optimizedImageSrc } from '@/lib/optimizedImage'

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
  /** On a dark background (footer): a lighter green that stays readable. */
  onDark?: boolean
}

/** Logo image only — no title text beside the mark (nav/footer/header). */
export default function BrandLogo({
  className = '',
  imgClassName,
  size = 'default',
  onDark = false,
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
        // 256 px wide is plenty for a header / footer logo (the live upload was 656 KB).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedImageSrc(logoUrl, 256)} alt="" className={imageClass} />
      ) : (
        <span
          className={
            isNav
              ? cn('font-bold text-base leading-none', onDark ? 'text-primary-300' : 'text-primary-700')
              : cn('font-bold text-lg leading-none', onDark ? 'text-primary-300' : 'text-primary-700')
          }
        >
          FB
        </span>
      )}
    </div>
  )
}
