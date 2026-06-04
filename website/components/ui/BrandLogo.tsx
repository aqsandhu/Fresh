'use client'

import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { fetchBrandLogoUrl, getDefaultBrandLogo } from '@/lib/brand'

interface BrandLogoProps {
  className?: string
  imgClassName?: string
  showText?: boolean
  priority?: boolean
}

export default function BrandLogo({
  className = '',
  imgClassName = 'h-9 w-auto max-w-[140px] object-contain',
  showText = true,
  priority = false,
}: BrandLogoProps) {
  const { data: src } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: fetchBrandLogoUrl,
    staleTime: 5 * 60 * 1000,
    initialData: getDefaultBrandLogo(),
  })

  const logoSrc = src || getDefaultBrandLogo()
  const isRemote = logoSrc.startsWith('http')

  return (
    <div className={`flex items-center gap-2 shrink-0 min-w-0 ${className}`}>
      {isRemote ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoSrc} alt="Fresh Bazar" className={imgClassName} />
      ) : (
        <Image
          src={logoSrc}
          alt="Fresh Bazar"
          width={140}
          height={48}
          className={imgClassName}
          priority={priority}
        />
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
