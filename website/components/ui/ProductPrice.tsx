import { cn, formatPriceShort, formatProductUnitSuffix } from '@/lib/utils'

type ProductPriceSize = 'sm' | 'md' | 'lg' | 'xl'

const priceSizeClasses: Record<ProductPriceSize, string> = {
  sm: 'text-sm font-semibold',
  md: 'text-base font-bold',
  lg: 'text-lg font-bold',
  xl: 'text-3xl font-bold',
}

const unitSizeClasses: Record<ProductPriceSize, string> = {
  sm: 'text-[10px] font-normal',
  md: 'text-xs font-normal',
  lg: 'text-sm font-normal',
  xl: 'text-base font-normal',
}

interface ProductPriceProps {
  price: number
  unit?: string
  size?: ProductPriceSize
  className?: string
  priceClassName?: string
  unitClassName?: string
  compareAtPrice?: number
}

export default function ProductPrice({
  price,
  unit,
  size = 'md',
  className,
  priceClassName,
  unitClassName,
  compareAtPrice,
}: ProductPriceProps) {
  const unitSuffix = formatProductUnitSuffix(unit)

  return (
    <span className={cn('inline-flex items-baseline gap-0.5 flex-wrap', className)}>
      <span className={cn('text-primary-700', priceSizeClasses[size], priceClassName)}>
        {formatPriceShort(price)}
      </span>
      {unitSuffix && (
        <span className={cn('text-gray-500', unitSizeClasses[size], unitClassName)}>
          {unitSuffix}
        </span>
      )}
      {compareAtPrice != null && compareAtPrice > price && (
        <span className={cn('text-gray-400 line-through ml-1', unitSizeClasses[size])}>
          {formatPriceShort(compareAtPrice)}
        </span>
      )}
    </span>
  )
}
