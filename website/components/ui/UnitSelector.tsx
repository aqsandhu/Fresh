'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import type { Product, ProductUnit, ProductQuality } from '@/types'
import {
  getUnitOptions,
  getUnitPickerDisplayLabel,
} from '@/lib/unitPricing'
import { formatPriceShort } from '@/lib/utils'
import { useDialog } from '@/lib/useDialog'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock'

interface UnitSelectorProps {
  product: Product
  selectedUnit: ProductUnit
  onChange: (unit: ProductUnit) => void
  /** Quality tier the prices should reflect (defaults to 'A'). */
  quality?: ProductQuality
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
  quality = 'A',
  size = 'sm',
  className = '',
  fullWidth = false,
}: UnitSelectorProps) {
  const unitOptions = useMemo(() => getUnitOptions(product, quality), [product, quality])
  const [open, setOpen] = useState(false)
  const dialogRef = useDialog(open, () => setOpen(false))
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Shared, counted lock (G30) — '' on close used to unlock the page under
    // another overlay that was still open.
    lockBodyScroll()
    document.addEventListener('keydown', onKey)
    return () => {
      unlockBodyScroll()
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
            className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          >
            <div className="absolute inset-0 bg-black/35" aria-hidden="true" onClick={() => setOpen(false)} />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Choose a size"
              className="relative w-full max-w-md bg-white rounded-lg border border-gray-200 overflow-hidden shadow-lg focus:outline-none"
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
    // Not a control: only keeps clicks inside the selector from reaching the
    // product card link around it. The button below is the control.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
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
  unit: ProductUnit,
  quality: ProductQuality = 'A'
): number {
  const opts = getUnitOptions(product, quality)
  return opts.find((o) => o.unit === unit)?.price ?? product.price
}
