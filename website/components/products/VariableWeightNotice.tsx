'use client'

import { motion } from 'framer-motion'
import { Scale, X } from 'lucide-react'
import { useVariableWeightNotice } from '@/store/variableWeightNotice'

/** Urdu popup shown when a customer adds a variable-weight product to the cart. */
export default function VariableWeightNotice() {
  const { open, note, dismiss } = useVariableWeightNotice()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <Scale className="h-7 w-7 text-amber-600" />
        </div>

        <p
          dir="rtl"
          className="text-center text-base leading-loose text-gray-800 font-urdu"
        >
          {note}
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          سمجھ گیا (OK)
        </button>
      </motion.div>
    </div>
  )
}
