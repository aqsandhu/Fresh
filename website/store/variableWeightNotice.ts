'use client'

import { create } from 'zustand'

const DEFAULT_NOTE =
  'آرڈر پیک کرتے ہوئے اس پروڈکٹ کا وزن آپ کے آرڈر سے کم یا زیادہ ہو سکتا ہے۔ ایسی صورت میں آپ کا آرڈر اور اس کی رقم آپ کے اصل وزن کے مطابق تبدیل ہو جائے گی۔'

const SEEN_KEY = 'fb-varweight-seen'

function seenSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

interface VariableWeightNoticeState {
  open: boolean
  note: string
  /** Show once per product per session. */
  notify: (productId: string, note?: string | null) => void
  dismiss: () => void
}

export const useVariableWeightNotice = create<VariableWeightNoticeState>((set) => ({
  open: false,
  note: DEFAULT_NOTE,
  notify: (productId, note) => {
    const seen = seenSet()
    if (seen.has(productId)) return
    seen.add(productId)
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)))
      } catch {
        /* ignore */
      }
    }
    set({ open: true, note: (note && note.trim()) || DEFAULT_NOTE })
  },
  dismiss: () => set({ open: false }),
}))
