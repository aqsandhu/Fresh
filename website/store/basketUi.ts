'use client'

import { create } from 'zustand'

interface BasketUiState {
  isOpen: boolean
  open: () => void
  close: () => void
}

/** Shared open/close state for the "Today's Basket" popup (Header + launcher). */
export const useBasketUi = create<BasketUiState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
