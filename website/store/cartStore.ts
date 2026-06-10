'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usesHttpOnlyCookies } from '@/lib/authConfig'
import { clearTokens, storeTokens } from '@/lib/secureTokens'
import { setLastPhone } from '@/lib/phoneStorage'
import { CartState, Product, ProductUnit } from '@/types'
import { calculateClientDeliveryCharge } from '@/lib/deliveryRules'
import { getSelectedCityId } from '@/lib/cityStorage'
import { priceForUnit, resolveLineUnitPrice } from '@/lib/unitPricing'

// A cart line is uniquely identified by (productId, unit) — the same product
// can appear twice (e.g., 1 kg + half kg).
const lineKey = (productId: string, unit: ProductUnit = 'full') =>
  `${productId}::${unit}`

/** Keep persisted cartsByCity in sync whenever the active cart items change. */
const persistActiveCityItems = (
  state: Pick<CartState, 'items' | 'cartsByCity' | 'activeCityId'>,
  items: CartState['items']
): Pick<CartState, 'items' | 'cartsByCity' | 'activeCityId'> => {
  const cityId = state.activeCityId || getSelectedCityId()
  if (!cityId) {
    return {
      items,
      cartsByCity: state.cartsByCity,
      activeCityId: state.activeCityId,
    }
  }
  return {
    items,
    activeCityId: cityId,
    cartsByCity: { ...state.cartsByCity, [cityId]: items },
  }
}

const DEFAULT_BASE_CHARGE = 100
const DEFAULT_FREE_THRESHOLD = 500

async function fetchDeliverySettings(): Promise<{ baseCharge: number; freeThreshold: number }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'
    const res = await fetch(`${baseUrl}/site-settings/delivery`)
    const json = await res.json()
    const data = json?.data || json
    return {
      baseCharge: parseFloat(data?.base_charge) || DEFAULT_BASE_CHARGE,
      freeThreshold: parseFloat(data?.free_delivery_threshold) || DEFAULT_FREE_THRESHOLD,
    }
  } catch {
    return { baseCharge: DEFAULT_BASE_CHARGE, freeThreshold: DEFAULT_FREE_THRESHOLD }
  }
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      cartsByCity: {} as Record<string, CartState['items']>,
      activeCityId: null as string | null,
      deliveryBaseCharge: DEFAULT_BASE_CHARGE,
      deliveryFreeThreshold: DEFAULT_FREE_THRESHOLD,
      hasHydrated: false,
      setHasHydrated: (h: boolean) => set({ hasHydrated: h }),

      loadDeliverySettings: async () => {
        const settings = await fetchDeliverySettings()
        set({
          deliveryBaseCharge: settings.baseCharge,
          deliveryFreeThreshold: settings.freeThreshold,
        })
      },

      addItem: (product: Product, quantity = 1, unit: ProductUnit = 'full') => {
        set((state) => {
          const targetKey = lineKey(product.id, unit)
          const existingItem = state.items.find(
            (item) => lineKey(item.product.id, item.unit) === targetKey
          )

          let nextItems: CartState['items']
          if (existingItem) {
            nextItems = state.items.map((item) =>
              lineKey(item.product.id, item.unit) === targetKey
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
          } else {
            nextItems = [
              ...state.items,
              {
                product,
                quantity,
                unit,
                unitPrice: priceForUnit(product, unit),
              },
            ]
          }

          return persistActiveCityItems(state, nextItems)
        })
      },

      removeItem: (productId: string, unit: ProductUnit = 'full') => {
        set((state) => {
          const nextItems = state.items.filter(
            (item) => lineKey(item.product.id, item.unit) !== lineKey(productId, unit)
          )
          return persistActiveCityItems(state, nextItems)
        })
      },

      updateQuantity: (productId: string, quantity: number, unit: ProductUnit = 'full') => {
        if (quantity <= 0) {
          get().removeItem(productId, unit)
          return
        }

        set((state) => {
          const nextItems = state.items.map((item) =>
            lineKey(item.product.id, item.unit) === lineKey(productId, unit)
              ? { ...item, quantity }
              : item
          )
          return persistActiveCityItems(state, nextItems)
        })
      },

      clearCart: () => {
        set((state) => persistActiveCityItems(state, []))
      },

      switchCity: (cityId: string) => {
        set((state) => {
          const nextByCity = { ...state.cartsByCity }
          if (state.activeCityId) {
            nextByCity[state.activeCityId] = state.items
          }
          return {
            activeCityId: cityId,
            cartsByCity: nextByCity,
            items: nextByCity[cityId] || [],
          }
        })
      },

      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0)
      },

      getTotalPrice: () => {
        return get().items.reduce(
          (total, item) =>
            total + resolveLineUnitPrice(item) * item.quantity,
          0
        )
      },

      getSubtotal: () => {
        return get().getTotalPrice()
      },

      getDeliveryCharge: (isFreeDeliverySlot = false) => {
        const { items, deliveryBaseCharge, deliveryFreeThreshold } = get()
        return calculateClientDeliveryCharge(
          items,
          deliveryBaseCharge,
          deliveryFreeThreshold,
          isFreeDeliverySlot
        )
      },

      getFinalTotal: (isFreeDeliverySlot = false) => {
        return get().getSubtotal() + get().getDeliveryCharge(isFreeDeliverySlot)
      },

      hasOnlyChicken: () => {
        const { items } = get()
        if (items.length === 0) return false
        return items.every((item) => item.product.category === 'chicken')
      },
    }),
    {
      name: 'freshbazar-cart-v2',
      partialize: (state) => ({
        cartsByCity: state.cartsByCity,
        activeCityId: state.activeCityId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return

        if (typeof window !== 'undefined') {
          try {
            const legacyRaw = localStorage.getItem('freshbazar-cart')
            if (legacyRaw) {
              const legacyParsed = JSON.parse(legacyRaw)
              const legacyItems =
                legacyParsed?.state?.items || legacyParsed?.items
              if (
                Array.isArray(legacyItems) &&
                legacyItems.length > 0 &&
                Object.keys(state.cartsByCity || {}).length === 0
              ) {
                const cityId = getSelectedCityId() || '_legacy'
                state.cartsByCity = { [cityId]: legacyItems }
                state.activeCityId = cityId
                state.items = legacyItems
              }
              localStorage.removeItem('freshbazar-cart')
            }
          } catch {
            /* ignore legacy parse errors */
          }
        }

        const cityId = state.activeCityId || getSelectedCityId()
        if (cityId) {
          state.activeCityId = cityId
          state.items = state.cartsByCity[cityId] || []
        }
        state.setHasHydrated(true)
      },
    }
  )
)

if (typeof window !== 'undefined') {
  useCartStore.getState().loadDeliverySettings()
}

// ============================================================================
// AUTH STORE
// ============================================================================

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
  /**
   * Set to `true` once Zustand's `persist` middleware has finished
   * loading from localStorage. Pages that gate behaviour on auth state
   * (checkout redirect, PIN gate) must wait for this before deciding,
   * otherwise a hard refresh briefly thinks the user is logged out and
   * bounces them to /login.
   */
  hasHydrated: boolean
  setHasHydrated: (h: boolean) => void
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
      hasHydrated: false,
      setHasHydrated: (h) => set({ hasHydrated: h }),
      setAuth: (user, tokens) => {
        if (typeof window !== 'undefined') {
          if (!usesHttpOnlyCookies()) {
            storeTokens(tokens.accessToken, tokens.refreshToken)
          }
          setLastPhone(user.phone)
        }
        const now = Date.now()
        set({
          user,
          isAuthenticated: true,
          accessToken: usesHttpOnlyCookies() ? null : tokens.accessToken,
          refreshToken: usesHttpOnlyCookies() ? null : tokens.refreshToken,
          lastActiveAt: now,
          pinVerifiedAt: now,
        })
      },
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => {
        if (typeof window !== 'undefined') {
          clearTokens()
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
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        lastActiveAt: state.lastActiveAt,
        pinVerifiedAt: state.pinVerifiedAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
