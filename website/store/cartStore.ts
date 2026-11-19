'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usesHttpOnlyCookies } from '@/lib/authConfig'
import { clearTokens, storeTokens } from '@/lib/secureTokens'
import { setLastPhone } from '@/lib/phoneStorage'
import { CartState, Product, ProductUnit, ProductQuality } from '@/types'
import { calculateClientDeliveryCharge } from '@/lib/deliveryRules'
import { getSelectedCityId } from '@/lib/cityStorage'
import { priceForUnit, resolveLineUnitPrice } from '@/lib/unitPricing'
import { getApiBaseUrl } from '@/lib/apiBase'

// A cart line is uniquely identified by (productId, unit, quality) — the same
// product can appear several times (e.g. 1 kg Quality A + half kg Quality B).
const lineKey = (
  productId: string,
  unit: ProductUnit = 'full',
  quality: ProductQuality = 'A'
) => `${productId}::${unit}::${quality}`

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

/** A real figure from the office, 0 included (0 = free delivery / no limit). */
const settingOr = (value: unknown, fallback: number): number => {
  const n = parseFloat(String(value ?? ''))
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

// Delivery charges are per city (I22): ask for the selected city's figures —
// the server bills those, so the cart must quote the same.
async function fetchDeliverySettings(cityId?: string | null): Promise<{ baseCharge: number; freeThreshold: number }> {
  try {
    const qs = cityId ? `?city_id=${encodeURIComponent(cityId)}` : ''
    const res = await fetch(`${getApiBaseUrl()}/site-settings/delivery${qs}`)
    const json = await res.json()
    const data = json?.data || json
    return {
      baseCharge: settingOr(data?.base_charge, DEFAULT_BASE_CHARGE),
      freeThreshold: settingOr(data?.free_delivery_threshold, DEFAULT_FREE_THRESHOLD),
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
      unsaved: null,
      savedCityId: null,
      hasHydrated: false,
      setHasHydrated: (h: boolean) => set({ hasHydrated: h }),

      loadDeliverySettings: async () => {
        const settings = await fetchDeliverySettings(getSelectedCityId() || get().activeCityId)
        set({
          deliveryBaseCharge: settings.baseCharge,
          deliveryFreeThreshold: settings.freeThreshold,
        })
      },

      addItem: (product: Product, quantity = 1, unit: ProductUnit = 'full', quality: ProductQuality = 'A') => {
        set((state) => {
          const targetKey = lineKey(product.id, unit, quality)
          const existingItem = state.items.find(
            (item) => lineKey(item.product.id, item.unit, item.quality) === targetKey
          )

          let nextItems: CartState['items']
          if (existingItem) {
            nextItems = state.items.map((item) =>
              lineKey(item.product.id, item.unit, item.quality) === targetKey
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
                quality,
                unitPrice: priceForUnit(product, unit, quality),
              },
            ]
          }

          return persistActiveCityItems(state, nextItems)
        })
      },

      removeItem: (productId: string, unit: ProductUnit = 'full', quality: ProductQuality = 'A') => {
        set((state) => {
          const nextItems = state.items.filter(
            (item) => lineKey(item.product.id, item.unit, item.quality) !== lineKey(productId, unit, quality)
          )
          return persistActiveCityItems(state, nextItems)
        })
      },

      updateQuantity: (productId: string, quantity: number, unit: ProductUnit = 'full', quality: ProductQuality = 'A') => {
        if (quantity <= 0) {
          get().removeItem(productId, unit, quality)
          return
        }

        set((state) => {
          const nextItems = state.items.map((item) =>
            lineKey(item.product.id, item.unit, item.quality) === lineKey(productId, unit, quality)
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
        // The new city has its own delivery charge (I22).
        void fetchDeliverySettings(cityId).then((settings) => {
          if (get().activeCityId !== cityId) return
          set({ deliveryBaseCharge: settings.baseCharge, deliveryFreeThreshold: settings.freeThreshold })
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
        unsaved: state.unsaved,
        savedCityId: state.savedCityId,
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
        // A cart saved before carts belonged to the account has no mark: treat
        // it as a guest cart, so it is JOINED to the account's cart, never lost.
        if (state.unsaved === undefined) {
          state.unsaved = Object.values(state.cartsByCity || {}).some((c) => c.length > 0) ? 'guest' : null
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
  /** tokens: absent when the server keeps the session in HttpOnly cookies (it then sends none). */
  setAuth: (user: AuthUser, tokens?: { accessToken?: string | null; refreshToken?: string | null } | null) => void
  setUser: (user: AuthUser | null) => void
  logout: () => void
  /** Bump on any meaningful interaction so we know the session is "fresh". */
  bumpActivity: () => void
  /** Mark a PIN re-auth as just succeeded. */
  markPinVerified: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
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
          // A server in cookie mode sends no tokens: the HttpOnly cookie is the
          // session. Reading tokens.accessToken here used to throw, and the
          // login page then said "Invalid PIN" for a correct PIN (H6).
          if (!usesHttpOnlyCookies() && tokens?.accessToken) {
            storeTokens(tokens.accessToken, tokens.refreshToken)
          }
          setLastPhone(user.phone)
        }
        const now = Date.now()
        set({
          user,
          isAuthenticated: true,
          accessToken: usesHttpOnlyCookies() ? null : tokens?.accessToken || null,
          refreshToken: usesHttpOnlyCookies() ? null : tokens?.refreshToken || null,
          lastActiveAt: now,
          pinVerifiedAt: now,
        })
      },
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => {
        if (typeof window !== 'undefined') {
          // Tell the backend to revoke the session and clear the HttpOnly
          // cookies. Fire-and-forget: local state must clear even when the
          // request fails or the token is already expired.
          const accessToken = get().accessToken
          // In bearer mode the refresh token travels in the body so the server
          // can revoke it (cookie mode sends it as an HttpOnly cookie).
          const refreshToken = get().refreshToken
          fetch(`${getApiBaseUrl()}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify(refreshToken ? { refreshToken } : {}),
          }).catch(() => {})
          clearTokens()
        }
        // The cart belongs to the person who just signed out — on a shared
        // computer it must not become the next account's cart.
        useCartStore.setState({ items: [], cartsByCity: {}, unsaved: null, savedCityId: null })
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
