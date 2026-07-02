'use client'

import { create } from 'zustand'

interface RightDrawerState {
  /** Utility drawer (slides in from the right edge). */
  open: boolean
  /** AI support chat panel (launcher lives inside the drawer). */
  chatOpen: boolean
  /** City picker modal (button lives inside the drawer). */
  cityPickerOpen: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
  setChatOpen: (v: boolean) => void
  setCityPickerOpen: (v: boolean) => void
}

export const useRightDrawer = create<RightDrawerState>((set, get) => ({
  open: false,
  chatOpen: false,
  cityPickerOpen: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set({ open: !get().open }),
  setChatOpen: (v) => set({ chatOpen: v }),
  setCityPickerOpen: (v) => set({ cityPickerOpen: v }),
}))
