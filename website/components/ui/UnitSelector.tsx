'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
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
 * Unit picker — modal menu like customer-app (all options visible, no clip).
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

  const chipPad = size === 'md' ? 'px-3 py-2.5' : 'px-2.5 py-2'
  const chipText = size === 'md' ? 'text-sm' : 'text-xs'

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/40"
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">
                  Select unit
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="max-h-[min(70vh,320px)] overflow-y-auto">
                {unitOptions.map((opt) => (
                  <button
                    key={opt.unit}
                    type="button"
                    onClick={() => {
                      onChange(opt.unit)
                      setOpen(false)
                    }}
                    className={`w-full text-left px-4 py-3.5 flex items-center justify-between gap-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                      opt.unit === selectedUnit
                        ? 'bg-[#F4F9F6] text-[#2F6B4F]'
                        : 'text-gray-800'
                    }`}
                  >
                    <span
                      className={`text-sm ${
                        opt.unit === selectedUnit ? 'font-bold' : 'font-medium'
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
        className={`${fullWidth ? 'w-full' : 'inline-flex'} flex items-center justify-between gap-2 font-semibold border rounded-xl transition-colors ${CHIP} ${chipPad} ${chipText}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
          {displayLabel}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0" />
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
