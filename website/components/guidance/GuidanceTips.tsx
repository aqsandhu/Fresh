'use client'

import { useEffect, useState } from 'react'
import { Lightbulb, X, Sparkles } from 'lucide-react'
import { useGuidanceTips } from '@/store/guidanceTips'
import { tipsApi } from '@/lib/api'

interface GuidanceTipsProps {
  /** Hardcoded Urdu fallback tips, used until admin tips load (or if none). */
  tips: string[]
  /** Page key to fetch admin-managed tips for (e.g. "checkout"). */
  page?: string
  title?: string
}

/**
 * Dismissible Urdu user-guidance tips. Admin-managed tips for the page are
 * fetched and take priority; the hardcoded `tips` are the fallback so the card
 * still works before/without any admin tips. The on/off choice is global and
 * persisted.
 */
export default function GuidanceTips({ tips, page, title }: GuidanceTipsProps) {
  const { enabled, hasHydrated, setEnabled } = useGuidanceTips()
  const [remote, setRemote] = useState<string[] | null>(null)

  useEffect(() => {
    let active = true
    if (!page) return
    tipsApi
      .forPage(page)
      .then((rows) => {
        if (active && rows.length > 0) setRemote(rows.map((r) => r.text))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [page])

  const list = remote ?? tips

  // Avoid a hydration flash before the persisted choice loads.
  if (!hasHydrated || list.length === 0) return null

  if (!enabled) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setEnabled(true)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3.5 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition hover:shadow"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          ہدایات دکھائیں
        </button>
      </div>
    )
  }

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-sm ring-1 ring-amber-100/50">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/20">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
          </span>
          {title || 'رہنمائی'}
        </span>
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
          aria-label="Turn off tips"
        >
          <X className="h-3.5 w-3.5" />
          بند کریں
        </button>
      </div>

      {/* Tips */}
      <ul dir="rtl" className="space-y-2.5 px-4 py-3.5">
        {list.map((tip, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-gray-700">
            <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
              {i + 1}
            </span>
            <span className="font-urdu pt-0.5">{tip}</span>
          </li>
        ))}
      </ul>

      <div className="border-t border-amber-100 px-4 py-2 text-left">
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className="text-xs font-medium text-amber-600 transition hover:text-amber-800"
          dir="rtl"
        >
          یہ ہدایات بند کر دیں
        </button>
      </div>
    </div>
  )
}
