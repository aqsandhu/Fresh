'use client'

import { Lightbulb, X, HelpCircle } from 'lucide-react'
import { useGuidanceTips } from '@/store/guidanceTips'

interface GuidanceTipsProps {
  /** Urdu tip lines for this page. */
  tips: string[]
  title?: string
}

/**
 * Dismissible Urdu user-guidance tips shown at the top of order-related pages.
 * The on/off choice is global and persisted, so turning it off here hides tips
 * everywhere; a small "show tips" affordance lets the user turn them back on
 * any time.
 */
export default function GuidanceTips({ tips, title }: GuidanceTipsProps) {
  const { enabled, hasHydrated, setEnabled } = useGuidanceTips()

  // Avoid a hydration flash before the persisted choice loads.
  if (!hasHydrated || tips.length === 0) return null

  if (!enabled) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setEnabled(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          ہدایات دکھائیں
        </button>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800">
          <Lightbulb className="h-4 w-4" />
          {title || 'رہنمائی'}
        </span>
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-amber-700 hover:bg-amber-100"
          aria-label="Turn off tips"
        >
          <X className="h-3.5 w-3.5" />
          بند کریں
        </button>
      </div>

      <ul dir="rtl" className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-amber-900">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <span className="font-urdu">{tip}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setEnabled(false)}
        className="mt-3 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900"
        dir="rtl"
      >
        یہ ہدایات بند کر دیں
      </button>
    </div>
  )
}
