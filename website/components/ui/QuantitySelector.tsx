'use client'

import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuantitySelectorProps {
  quantity: number
  onIncrease: () => void
  onDecrease: () => void
  min?: number
  max?: number
  size?: 'sm' | 'md'
  className?: string
}

export default function QuantitySelector({
  quantity,
  onIncrease,
  onDecrease,
  min = 1,
  max = 99,
  size = 'md',
  className,
}: QuantitySelectorProps) {
  const sizes = {
    sm: {
      button: 'w-6 h-6',
      text: 'text-sm w-8',
      icon: 'w-3 h-3',
    },
    md: {
      button: 'w-8 h-8',
      text: 'text-base w-10',
      icon: 'w-4 h-4',
    },
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        onClick={onDecrease}
        disabled={quantity <= min}
        className={cn(
          'flex items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors',
          'hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed',
          sizes[size].button
        )}
      >
        <Minus className={sizes[size].icon} />
      </button>
      <span
        className={cn(
          'text-center font-medium text-gray-900',
          sizes[size].text
        )}
      >
        {quantity}
      </span>
      <button
        onClick={onIncrease}
        disabled={quantity >= max}
        className={cn(
          'flex items-center justify-center rounded-full bg-primary-100 text-primary-600 transition-colors',
          'hover:bg-primary-200 disabled:opacity-40 disabled:cursor-not-allowed',
          sizes[size].button
        )}
      >
        <Plus className={sizes[size].icon} />
      </button>
    </div>
  )
}
