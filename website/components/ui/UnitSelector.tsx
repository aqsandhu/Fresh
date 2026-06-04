'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import type { Product, ProductUnit } from '@/types'
import {
  getUnitOptions,
  getUnitPickerDisplayLabel,
} from '@/lib/unitPricing'
import { formatPriceShort } from '@/lib/utils'

interface UnitSelectorProps {
  product: Product
  selectedUnit: ProductUnit
  onChange: (unit: ProductUnit) => void
  size?: 'sm' | 'md'
  className?: string
  /** Stretch chip to full card width (product grid). */
  fullWidth?: boolean
}

const CHIP =
  'text-[#2F6B4F] bg-[#F4F9F6] border-[#C5DECF] hover:bg-[#e8f3ec]'

/**
 * Unit picker — matches customer-app UnitSelector / ProductCard modal.
 */
export default function UnitSelector({
  product,
  selectedUnit,
  onChange,
  size = 'sm',
  className = '',
  fullWidth = false,
}: UnitSelectorProps) {
  const unitOptions = useMemo(() => getUnitOptions(product), [product])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (unitOptions.length <= 1) return null

  const displayLabel = getUnitPickerDisplayLabel(
    product,
    selectedUnit,
    unitOptions
  )

  const chipPad =
    size === 'md' ? 'px-3.5 py-[11px]' : 'px-[10px] py-[9px]'
  const chipText = size === 'md' ? 'text-sm' : 'text-xs'
  const chevronClass = size === 'md' ? 'w-5 h-5' : 'w-4 h-4'

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/35"
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-md bg-white rounded-lg border border-gray-200 overflow-hidden shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {unitOptions.map((opt) => (
                <button
                  key={opt.unit}
                  type="button"
                  onClick={() => {
                    onChange(opt.unit)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-4 py-4 flex items-center justify-between gap-3 border-b border-gray-100 last:border-0 transition-colors ${
                    opt.unit === selectedUnit
                      ? 'bg-[#F4F9F6]'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`flex-1 min-w-0 text-sm ${
                      opt.unit === selectedUnit
                        ? 'font-bold text-[#2F6B4F]'
                        : 'font-medium text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-sm font-semibold text-gray-600 shrink-0">
                    {formatPriceShort(opt.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div
      className={`${fullWidth ? 'w-full' : ''} ${className}`}
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
          setOpen(true)
        }}
        className={`${fullWidth ? 'w-full' : 'inline-flex self-stretch'} flex items-center justify-between gap-1.5 font-semibold border rounded-lg transition-colors ${CHIP} ${chipPad} ${chipText}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 text-left min-w-0 truncate">{displayLabel}</span>
        <ChevronDown className={`${chevronClass} shrink-0`} />
      </button>
      {modal}
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
