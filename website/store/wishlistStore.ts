'use client'

// The wishlist (W22): product ids, newest first. Kept with the account when
// signed in (server = the truth; components/providers/WishlistSync joins this
// device's list at sign-in and clears it at sign-out); a guest keeps it on
// this device. The product details come from the product list of the
// customer's city.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { wishlistApi } from '@/lib/api'

interface WishlistState {
  ids: string[]
  /** True once the account's list has been read / joined this session. */
  synced: boolean
  /**
   * Changes made as a guest (or the old device-only list) that the account
   * has not seen yet — joined at the next sign-in. Without them the account's
   * list simply replaces this device's (so a product removed on another
   * device does not come back from here).
   */
  unsynced: boolean
  has: (productId: string) => boolean
  /** Add or remove one; signed in → saved to the account (undone if that fails). */
  toggle: (productId: string, signedIn: boolean) => Promise<'added' | 'removed'>
  replace: (ids: string[]) => void
  clear: () => void
}

const LEGACY_KEY = 'freshbazar-wishlist' // device-only list before W22: [{ id, product, addedAt }]

/** Ids from the old device-only list, so nobody loses what they saved before. */
function legacyIds(): string[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LEGACY_KEY) : null
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.map((x: { id?: unknown }) => x?.id).filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],
      synced: false,
      unsynced: false,

      has: (productId) => get().ids.includes(productId),

      toggle: async (productId, signedIn) => {
        const before = get().ids
        const removing = before.includes(productId)
        set({ ids: removing ? before.filter((x) => x !== productId) : [productId, ...before] })
        if (!signedIn) set({ unsynced: true })
        if (signedIn) {
          try {
            const ids = removing ? await wishlistApi.remove(productId) : await wishlistApi.add(productId)
            set({ ids })
          } catch (err) {
            set({ ids: before })
            throw err
          }
        }
        return removing ? 'removed' : 'added'
      },

      replace: (ids) => set({ ids, synced: true, unsynced: false }),

      clear: () => set({ ids: [], synced: false, unsynced: false }),
    }),
    {
      name: 'freshbazar-wishlist-ids',
      partialize: (s) => ({ ids: s.ids, unsynced: s.unsynced }),
      onRehydrateStorage: () => (state) => {
        // One-time move of the old device-only list. The old key is removed
        // right away, so after a sign-out (which clears the list) it can never
        // come back for the next person on this browser.
        const old = legacyIds()
        try {
          window.localStorage.removeItem(LEGACY_KEY)
        } catch {
          /* storage unavailable */
        }
        if (state && state.ids.length === 0 && old.length) {
          useWishlistStore.setState({ ids: old, unsynced: true })
        }
      },
    }
  )
)
