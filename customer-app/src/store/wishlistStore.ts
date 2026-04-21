import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '@types';

interface WishlistItem {
  id: string;
  product: Product;
  addedAt: number;
}

interface WishlistStore {
  items: WishlistItem[];
  toggle: (product: Product) => void;
  add: (product: Product) => void;
  remove: (productId: string) => void;
  clear: () => void;
  isWishlisted: (productId: string) => boolean;
  count: () => number;
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],

      toggle: (product: Product) => {
        const exists = get().items.some((i) => i.product.id === product.id);
        if (exists) {
          set({ items: get().items.filter((i) => i.product.id !== product.id) });
        } else {
          set({
            items: [
              ...get().items,
              { id: product.id, product, addedAt: Date.now() },
            ],
          });
        }
      },

      add: (product: Product) => {
        if (get().items.some((i) => i.product.id === product.id)) return;
        set({
          items: [
            ...get().items,
            { id: product.id, product, addedAt: Date.now() },
          ],
        });
      },

      remove: (productId: string) => {
        set({ items: get().items.filter((i) => i.product.id !== productId) });
      },

      clear: () => set({ items: [] }),

      isWishlisted: (productId: string) =>
        get().items.some((i) => i.product.id === productId),

      count: () => get().items.length,
    }),
    {
      name: 'wishlist-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
);

export default useWishlistStore;
