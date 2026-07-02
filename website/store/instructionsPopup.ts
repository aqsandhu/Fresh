'use client'

import { create } from 'zustand'

interface InstructionsPopupState {
  /** Per-page instructions popup (genie-closes into its lightbulb icon). */
  open: boolean
  setOpen: (v: boolean) => void
}

export const useInstructionsPopup = create<InstructionsPopupState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}))
