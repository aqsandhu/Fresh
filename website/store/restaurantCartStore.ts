'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { restaurantShopApi } from '@/lib/restaurantApi'
import { round2, type RestaurantProduct, type Quality } from '@/lib/restaurantPricing'
import type { ProductUnit } from '@/types'

export interface RestaurantCartItem {
  product: RestaurantProduct
  quantity: number
  unit: ProductUnit
  quality: Quality
  unitPrice: number
}

const lineKey = (productId: string, quality: Quality, unit: ProductUnit) =>
  `${productId}::${quality}::${unit}`

interface RestaurantCartState {
  items: RestaurantCartItem[]
  deliveryBaseCharge: number
  deliveryFreeThreshold: number
  hasHydrated: boolean
  setHasHydrated: (h: boolean) => void
  loadDeliverySettings: () => Promise<void>
  addItem: (item: RestaurantCartItem) => void
  removeItem: (productId: string, quality: Quality, unit: ProductUnit) => void
  updateQuantity: (productId: string, quality: Quality, unit: ProductUnit, quantity: number) => void
  clearCart: () => void
  getTotalItems: () => number
  getSubtotal: () => number
  getDeliveryCharge: () => number
  getFinalTotal: () => number
}

const DEFAULT_BASE = 100
const DEFAULT_THRESHOLD = 2000

export const useRestaurantCartStore = create<RestaurantCartState>()(
  persist(
    (set, get) => ({
      items: [],
      deliveryBaseCharge: DEFAULT_BASE,
      deliveryFreeThreshold: DEFAULT_THRESHOLD,
      hasHydrated: false,
      setHasHydrated: (h) => set({ hasHydrated: h }),

      loadDeliverySettings: async () => {
        try {
          const d = await restaurantShopApi.getDelivery()
          set({
            deliveryBaseCharge: Number(d?.base_charge) || DEFAULT_BASE,
            deliveryFreeThreshold: Number(d?.free_delivery_threshold) || DEFAULT_THRESHOLD,
          })
        } catch {
          /* keep defaults */
        }
      },

      addItem: (item) => {
        set((state) => {
          const key = lineKey(item.product.id, item.quality, item.unit)
          const existing = state.items.find((i) => lineKey(i.product.id, i.quality, i.unit) === key)
          if (existing) {
            return {
              items: state.items.map((i) =>
                lineKey(i.product.id, i.quality, i.unit) === key
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            }
          }
          return { items: [...state.items, item] }
        })
      },

      removeItem: (productId, quality, unit) => {
        set((state) => ({
          items: state.items.filter((i) => lineKey(i.product.id, i.quality, i.unit) !== lineKey(productId, quality, unit)),
        }))
      },

      updateQuantity: (productId, quality, unit, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId, quality, unit)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            lineKey(i.product.id, i.quality, i.unit) === lineKey(productId, quality, unit)
              ? { ...i, quantity }
              : i
          ),
        }))
      },

      clearCart: () => set({ items: [] }),

      getTotalItems: () => get().items.reduce((t, i) => t + i.quantity, 0),

      getSubtotal: () => round2(get().items.reduce((t, i) => t + round2(i.unitPrice * i.quantity), 0)),

      getDeliveryCharge: () => {
        const { deliveryBaseCharge, deliveryFreeThreshold } = get()
        const subtotal = get().getSubtotal()
        if (subtotal <= 0) return 0
        return subtotal >= deliveryFreeThreshold ? 0 : deliveryBaseCharge
      },

      getFinalTotal: () => round2(get().getSubtotal() + get().getDeliveryCharge()),
    }),
    {
      name: 'freshbazar-restaurant-cart',
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
