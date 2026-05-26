'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CartState, Product } from '@/types'
import { calculateClientDeliveryCharge } from '@/lib/deliveryRules'

// Defaults (overridden by backend settings when loaded)
let DELIVERY_CHARGE = 100
let FREE_DELIVERY_THRESHOLD = 500

// Load delivery settings from backend
let _settingsLoaded = false
const loadDeliverySettings = async () => {
  if (_settingsLoaded) return
  try {
    // IMPORTANT: Set NEXT_PUBLIC_API_URL in production. This localhost fallback is dev-only.
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'
    const res = await fetch(`${baseUrl}/site-settings/delivery`)
    const json = await res.json()
    const data = json?.data || json
    if (data?.base_charge) DELIVERY_CHARGE = data.base_charge
    if (data?.free_delivery_threshold) FREE_DELIVERY_THRESHOLD = data.free_delivery_threshold
    _settingsLoaded = true
  } catch {
    // Keep defaults on error
  }
}

// Trigger load on import (non-blocking)
if (typeof window !== 'undefined') {
  loadDeliverySettings()
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product, quantity = 1) => {
        set((state) => {
          const existingItem = state.items.find(
            (item) => item.product.id === product.id
          )

          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.product.id === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
            }
          }

          return {
            items: [...state.items, { product, quantity }],
          }
        })
      },

      removeItem: (productId: string) => {
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
        }))
      },

      updateQuantity: (productId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(productId)
          return
        }

        set((state) => ({
          items: state.items.map((item) =>
            item.product.id === productId ? { ...item, quantity } : item
          ),
        }))
      },

      clearCart: () => {
        set({ items: [] })
      },

      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0)
      },

      getTotalPrice: () => {
        return get().items.reduce(
          (total, item) => total + item.product.price * item.quantity,
          0
        )
      },

      getSubtotal: () => {
        return get().getTotalPrice()
      },

      getDeliveryCharge: () => {
        const { items } = get()
        return calculateClientDeliveryCharge(items, DELIVERY_CHARGE, FREE_DELIVERY_THRESHOLD)
      },

      getFinalTotal: () => {
        return get().getSubtotal() + get().getDeliveryCharge()
      },

      hasOnlyChicken: () => {
        const { items } = get()
        if (items.length === 0) return false
        return items.every((item) => item.product.category === 'chicken')
      },
    }),
    {
      name: 'freshbazar-cart',
    }
  )
)

// Auth Store
interface AuthUser {
  id: string
  name: string
  phone: string
  email?: string
  role?: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  accessToken: string | null
  refreshToken: string | null
  /** Epoch ms of the last user-initiated action. Powers checkout re-auth. */
  lastActiveAt: number | null
  /** Epoch ms of the last successful PIN verification (login OR re-auth). */
  pinVerifiedAt: number | null
  setAuth: (user: AuthUser, tokens: { accessToken: string; refreshToken: string }) => void
  setUser: (user: AuthUser | null) => void
  logout: () => void
  /** Bump on any meaningful interaction so we know the session is "fresh". */
  bumpActivity: () => void
  /** Mark a PIN re-auth as just succeeded. */
  markPinVerified: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      lastActiveAt: null,
      pinVerifiedAt: null,
      setAuth: (user, tokens) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', tokens.accessToken)
          localStorage.setItem('refreshToken', tokens.refreshToken)
        }
        const now = Date.now()
        set({
          user,
          isAuthenticated: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          lastActiveAt: now,
          pinVerifiedAt: now,
        })
      },
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token')
          localStorage.removeItem('refreshToken')
        }
        set({
          user: null,
          isAuthenticated: false,
          accessToken: null,
          refreshToken: null,
          lastActiveAt: null,
          pinVerifiedAt: null,
        })
      },
      bumpActivity: () => set({ lastActiveAt: Date.now() }),
      markPinVerified: () => set({ pinVerifiedAt: Date.now(), lastActiveAt: Date.now() }),
    }),
    {
      name: 'freshbazar-auth',
    }
  )
)
