import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, Product } from '@types';
import { cartService } from '@services/cart.service';
import { calculateCartTotals } from '@utils/helpers';

interface CartStore {
  items: CartItem[];
  isLoading: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  
  // Actions
  loadCart: () => Promise<void>;
  addToCart: (product: Product, quantity?: number) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  syncWithBackend: () => Promise<boolean>;
  mergeWithServerCart: () => Promise<void>;
  isInCart: (productId: string) => boolean;
  getItemQuantity: (productId: string) => number;
  
  // Computed
  itemCount: () => number;
  subtotal: () => number;
  deliveryCharge: () => number;
  total: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      syncError: null,
      lastSyncedAt: null,

      loadCart: async () => {
        set({ isLoading: true, syncError: null });
        try {
          // Load from local storage
          const localItems = await cartService.getCart();
          set({ items: localItems });
          
          // Sync local cart to backend in background
          if (localItems.length > 0) {
            cartService.syncCartWithBackend(localItems).catch((err: any) => {
              console.log('Background cart sync failed:', err?.message);
            });
          }
        } catch (error: any) {
          console.error('Error loading cart:', error);
          set({ syncError: 'Failed to load cart. Please try again.' });
        } finally {
          set({ isLoading: false });
        }
      },

      addToCart: async (product: Product, quantity: number = 1) => {
        set({ isLoading: true, syncError: null });
        try {
          const items = await cartService.addToCart(product, quantity);
          set({ items, lastSyncedAt: Date.now() });
        } catch (error: any) {
          console.error('Error adding to cart:', error);
          set({ syncError: 'Failed to add item. Please try again.' });
          // Still update local state for better UX
          const currentItems = get().items;
          const existingItemIndex = currentItems.findIndex((item) => item.product.id === product.id);
          let updatedItems;
          if (existingItemIndex >= 0) {
            updatedItems = [...currentItems];
            updatedItems[existingItemIndex].quantity += quantity;
          } else {
            updatedItems = [...currentItems, { product, quantity }];
          }
          set({ items: updatedItems });
          await cartService.saveCart(updatedItems);
        } finally {
          set({ isLoading: false });
        }
      },

      updateQuantity: async (productId: string, quantity: number) => {
        set({ isLoading: true, syncError: null });
        try {
          const items = await cartService.updateQuantity(productId, quantity);
          set({ items, lastSyncedAt: Date.now() });
        } catch (error: any) {
          console.error('Error updating quantity:', error);
          set({ syncError: 'Failed to update quantity. Please try again.' });
          // Still update local state for better UX
          const currentItems = get().items;
          const itemIndex = currentItems.findIndex((item) => item.product.id === productId);
          if (itemIndex >= 0) {
            let updatedItems;
            if (quantity <= 0) {
              updatedItems = currentItems.filter((item) => item.product.id !== productId);
            } else {
              updatedItems = [...currentItems];
              updatedItems[itemIndex].quantity = quantity;
            }
            set({ items: updatedItems });
            await cartService.saveCart(updatedItems);
          }
        } finally {
          set({ isLoading: false });
        }
      },

      removeFromCart: async (productId: string) => {
        set({ isLoading: true, syncError: null });
        try {
          const items = await cartService.removeFromCart(productId);
          set({ items, lastSyncedAt: Date.now() });
        } catch (error: any) {
          console.error('Error removing from cart:', error);
          set({ syncError: 'Failed to remove item. Please try again.' });
          // Still update local state for better UX
          const currentItems = get().items;
          const updatedItems = currentItems.filter((item) => item.product.id !== productId);
          set({ items: updatedItems });
          await cartService.saveCart(updatedItems);
        } finally {
          set({ isLoading: false });
        }
      },

      clearCart: async () => {
        set({ isLoading: true, syncError: null });
        try {
          await cartService.clearCart();
          set({ items: [], lastSyncedAt: Date.now() });
        } catch (error: any) {
          console.error('Error clearing cart:', error);
          set({ syncError: 'Failed to clear cart. Please try again.' });
          // Still clear local state
          set({ items: [] });
          await cartService.saveCart([]);
        } finally {
          set({ isLoading: false });
        }
      },

      syncWithBackend: async () => {
        try {
          const currentItems = get().items;
          const success = await cartService.syncCartWithBackend(currentItems);
          if (success) {
            set({ lastSyncedAt: Date.now(), syncError: null });
          }
          return success;
        } catch (error: any) {
          console.error('Error syncing cart:', error);
          set({ syncError: 'Failed to sync with server.' });
          return false;
        }
      },

      mergeWithServerCart: async () => {
        set({ isLoading: true });
        try {
          // Just sync local cart to backend
          const localItems = await cartService.getCart();
          if (localItems.length > 0) {
            await cartService.syncCartWithBackend(localItems);
          }
          set({ items: localItems, lastSyncedAt: Date.now(), syncError: null });
        } catch (error: any) {
          console.error('Error merging cart:', error);
          set({ syncError: 'Failed to merge cart with server.' });
        } finally {
          set({ isLoading: false });
        }
      },

      isInCart: (productId: string) => {
        return get().items.some((item) => item.product.id === productId);
      },

      getItemQuantity: (productId: string) => {
        const item = get().items.find((item) => item.product.id === productId);
        return item?.quantity || 0;
      },

      itemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      subtotal: () => {
        return get().items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      },

      deliveryCharge: () => {
        // NOTE: This is a local estimate only. For accurate charges,
        // screens should fetch from GET /api/site-settings/delivery.
        // CartScreen and TimeSlotScreen already do this correctly.
        return 0;
      },

      total: () => {
        return get().subtotal() + get().deliveryCharge();
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
);

export default useCartStore;
