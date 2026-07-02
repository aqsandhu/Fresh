'use client'

import { create } from 'zustand'

interface LeftDrawerState {
  /** Categories drawer (slides in from the left edge). */
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

export const useLeftDrawer = create<LeftDrawerState>((set, get) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set({ open: !get().open }),
}))
