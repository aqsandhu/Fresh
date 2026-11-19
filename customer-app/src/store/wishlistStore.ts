import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { Product } from '@app-types';
import { wishlistService } from '@services/wishlist.service';
import { productService } from '@services/product.service';
import { getSelectedCityId } from '@/lib/cityStorage';

interface WishlistItem {
  id: string;
  product: Product;
  addedAt: number;
}

interface WishlistStore {
  items: WishlistItem[];
  /**
   * Changes made while signed out that the account has not seen yet — joined
   * at the next sign-in. Otherwise the account's list replaces this phone's,
   * so a product removed on another device does not come back from here.
   */
  unsynced: boolean;
  toggle: (product: Product) => void;
  add: (product: Product) => void;
  remove: (productId: string) => void;
  /** Sign-out: forget this phone's copy (the account keeps the list). */
  clear: () => void;
  /** The "Clear" button: empties the list here AND on the account. */
  clearAll: () => Promise<void>;
  /** After sign-in / app start with a session: join or read the account's list. */
  syncWithAccount: () => Promise<void>;
  isWishlisted: (productId: string) => boolean;
  count: () => number;
}

/** Lazy: the auth store pulls this store in for sign-out (circular otherwise). */
function signedIn(): boolean {
  try {
    const { useAuthStore } = require('./authStore');
    return Boolean(useAuthStore.getState().isAuthenticated);
  } catch {
    return false;
  }
}

const saveFailed = () =>
  Toast.show({ type: 'error', text1: 'Could not update your wishlist', text2: 'Check your connection and try again.' });

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      unsynced: false,

      toggle: (product: Product) => {
        if (get().items.some((i) => i.product.id === product.id)) get().remove(product.id);
        else get().add(product);
      },

      add: (product: Product) => {
        if (get().items.some((i) => i.product.id === product.id)) return;
        const before = get().items;
        set({ items: [{ id: product.id, product, addedAt: Date.now() }, ...before] });
        if (!signedIn()) {
          set({ unsynced: true });
          return;
        }
        wishlistService.add(product.id).catch(() => {
          set({ items: before });
          saveFailed();
        });
      },

      remove: (productId: string) => {
        const before = get().items;
        set({ items: before.filter((i) => i.product.id !== productId) });
        if (!signedIn()) {
          set({ unsynced: true });
          return;
        }
        wishlistService.remove(productId).catch(() => {
          set({ items: before });
          saveFailed();
        });
      },

      clear: () => set({ items: [], unsynced: false }),

      clearAll: async () => {
        const ids = get().items.map((i) => i.product.id);
        if (signedIn()) await Promise.all(ids.map((id) => wishlistService.remove(id)));
        set({ items: [], unsynced: false });
      },

      syncWithAccount: async () => {
        const local = get().items;
        const ids = get().unsynced ? await wishlistService.merge(local.map((i) => i.product.id)) : await wishlistService.get();
        const cityId = await getSelectedCityId();
        const fetched = cityId && ids.length ? await productService.getProductsByIds(ids, cityId) : [];
        const byId = new Map<string, Product>(fetched.map((p) => [p.id, p]));
        for (const i of local) if (!byId.has(i.product.id)) byId.set(i.product.id, i.product);
        // The account's order; a product not sold in this city (and never on
        // this phone) has no details to show, so it is left out here.
        const items = ids
          .map((id) => byId.get(id))
          .filter((p): p is Product => Boolean(p))
          .map((product) => ({ id: product.id, product, addedAt: local.find((i) => i.id === product.id)?.addedAt ?? Date.now() }));
        set({ items, unsynced: false });
      },

      isWishlisted: (productId: string) => get().items.some((i) => i.product.id === productId),

      count: () => get().items.length,
    }),
    {
      name: 'wishlist-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items, unsynced: state.unsynced }),
      // A list saved before W22 (device-only) is joined at the next sign-in.
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<WishlistStore>;
        const items = p.items || [];
        return { ...current, items, unsynced: p.unsynced ?? items.length > 0 };
      },
    }
  )
);

export default useWishlistStore;
