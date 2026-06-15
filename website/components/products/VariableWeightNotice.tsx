'use client'

import { motion } from 'framer-motion'
import { Scale, X } from 'lucide-react'
import { useVariableWeightNotice } from '@/store/variableWeightNotice'

/** Urdu popup shown when a customer adds a variable-weight product to the cart. */
export default function VariableWeightNotice() {
  const { open, note, dismiss } = useVariableWeightNotice()
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative mx-auto my-auto w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Header band */}
        <div className="flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 px-5 pb-4 pt-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 ring-8 ring-amber-50">
            <Scale className="h-8 w-8 text-amber-600" />
          </span>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full bg-white/70 p-1.5 text-gray-500 hover:bg-white hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-5 pb-5 pt-4">
          <h3 className="mb-2 text-center text-base font-bold text-gray-900 font-urdu" dir="rtl">
            وزن میں معمولی فرق ممکن ہے
          </h3>
          <p
            dir="rtl"
            className="text-center text-[13px] leading-7 text-gray-600 font-urdu break-words"
          >
            {note}
          </p>

          <button
            type="button"
            onClick={dismiss}
            className="mt-5 w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-700"
          >
            سمجھ گیا (OK)
          </button>
        </div>
      </motion.div>
    </div>
  )
}
