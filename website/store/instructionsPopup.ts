'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface InstructionsPopupState {
  /** Per-page instructions popup (genie-closes into its lightbulb icon). */
  open: boolean
  /** Page-keys whose instructions the user has already seen (auto-show once). */
  seenPages: Record<string, boolean>
  hasHydrated: boolean
  setOpen: (v: boolean) => void
  markSeen: (page: string) => void
  setHasHydrated: (v: boolean) => void
}

export const useInstructionsPopup = create<InstructionsPopupState>()(
  persist(
    (set, get) => ({
      open: false,
      seenPages: {},
      hasHydrated: false,
      setOpen: (v) => set({ open: v }),
      markSeen: (page) => set({ seenPages: { ...get().seenPages, [page]: true } }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'fb-instructions-seen',
      partialize: (s) => ({ seenPages: s.seenPages }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
)
