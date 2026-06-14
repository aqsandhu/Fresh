'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GuidanceTipsState {
  /** Global on/off for the Urdu guidance tips. Default ON. */
  enabled: boolean
  hasHydrated: boolean
  setEnabled: (v: boolean) => void
  toggle: () => void
  setHasHydrated: (v: boolean) => void
}

export const useGuidanceTips = create<GuidanceTipsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      hasHydrated: false,
      setEnabled: (v) => set({ enabled: v }),
      toggle: () => set({ enabled: !get().enabled }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'fb-guidance-tips',
      partialize: (s) => ({ enabled: s.enabled }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
)
