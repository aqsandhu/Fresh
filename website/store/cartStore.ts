'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CartState, Product } from '@/types'

// Defaults (overridden by backend settings when loaded)
let DELIVERY_CHARGE = 100
let FREE_DELIVERY_THRESHOLD = 500

// Load delivery settings from backend
let _settingsLoaded = false
const loadDeliverySettings = async () => {
  if (_settingsLoaded) return
  try {
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
        const subtotal = get().getSubtotal()
        const { items } = get()
        if (items.length === 0) return 0

        const hasOnlyChicken = get().hasOnlyChicken()
        const hasOnlyMeat = items.every((item) => item.product.category === 'meat')

        // Chicken-only or meat-only: always charged
        if (hasOnlyChicken || hasOnlyMeat) {
          return DELIVERY_CHARGE
        }

        // Mixed or other: free if above threshold
        if (subtotal >= FREE_DELIVERY_THRESHOLD) {
          return 0
        }

        return DELIVERY_CHARGE
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
      name: 'sabziwala-cart',
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
  setAuth: (user: AuthUser, tokens: { accessToken: string; refreshToken: string }) => void
  setUser: (user: AuthUser | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, tokens) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', tokens.accessToken)
          localStorage.setItem('refreshToken', tokens.refreshToken)
        }
        set({ user, isAuthenticated: true, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
      },
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token')
          localStorage.removeItem('refreshToken')
        }
        set({ user: null, isAuthenticated: false, accessToken: null, refreshToken: null })
      },
    }),
    {
      name: 'sabziwala-auth',
    }
  )
)
