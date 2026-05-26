'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Product, ProductUnit } from '@/types'
import { getUnitOptions } from '@/lib/unitPricing'
import { formatPriceShort } from '@/lib/utils'

interface UnitSelectorProps {
  product: Product
  selectedUnit: ProductUnit
  onChange: (unit: ProductUnit) => void
  /** Visual size variant. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Dropdown for picking fractional units (½ kg, ¼ kg, ½ dozen). Re-used on
 * product cards and the product detail page so pricing logic stays in one place.
 */
export default function UnitSelector({
  product,
  selectedUnit,
  onChange,
  size = 'sm',
  className = '',
}: UnitSelectorProps) {
  const unitOptions = useMemo(() => getUnitOptions(product), [product])
  const [open, setOpen] = useState(false)

  if (unitOptions.length <= 1) return null

  const active =
    unitOptions.find((o) => o.unit === selectedUnit) || unitOptions[0]

  const chipClass =
    size === 'md'
      ? 'text-sm px-3 py-1.5'
      : 'text-xs px-2 py-1'

  return (
    <div
      className={`relative ${className}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={`inline-flex items-center gap-1 font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors ${chipClass}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {active?.label || 'Per unit'}
        <ChevronDown className={size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {unitOptions.map((opt) => (
            <button
              key={opt.unit}
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(opt.unit)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors ${
                opt.unit === selectedUnit
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'text-gray-700'
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-gray-600 font-medium">
                {formatPriceShort(opt.price)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function getSelectedUnitPrice(
  product: Product,
  unit: ProductUnit
): number {
  const opts = getUnitOptions(product)
  return opts.find((o) => o.unit === unit)?.price ?? product.price
}
