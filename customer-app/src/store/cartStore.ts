import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProductUnit, StoreCartItem, StoreProduct } from '@app-types';
import { priceForUnit, resolveLineUnitPrice } from '@/lib/unitPricing';
import { getSelectedCityId } from '@/lib/cityStorage';
import { withCityParams } from '@/lib/apiHelpers';
import { cartService } from '@services/cart.service';
import { calculateDeliveryCharge as calcDeliveryCharge } from '@utils/helpers';
import { API_BASE_URL } from '@utils/constants';

const lineKey = (productId: string, unit: ProductUnit = 'full') =>
  `${productId}::${unit}`;

const persistActiveCityItems = (
  state: Pick<CartStore, 'items' | 'cartsByCity' | 'activeCityId'>,
  items: StoreCartItem[]
): Pick<CartStore, 'items' | 'cartsByCity' | 'activeCityId'> => {
  const cityId = state.activeCityId;
  if (!cityId) {
    return {
      items,
      cartsByCity: state.cartsByCity,
      activeCityId: state.activeCityId,
    };
  }
  return {
    items,
    activeCityId: cityId,
    cartsByCity: { ...state.cartsByCity, [cityId]: items },
  };
};

const DEFAULT_BASE_CHARGE = 100;
const DEFAULT_FREE_THRESHOLD = 500;

async function fetchDeliverySettings(): Promise<{ baseCharge: number; freeThreshold: number }> {
  try {
    const params = withCityParams();
    const qs = params.city_id ? `?city_id=${encodeURIComponent(params.city_id)}` : '';
    const res = await fetch(`${API_BASE_URL}/site-settings/delivery${qs}`);
    const json = await res.json();
    const data = json?.data || json;
    return {
      baseCharge: parseFloat(data?.base_charge) || DEFAULT_BASE_CHARGE,
      freeThreshold: parseFloat(data?.free_delivery_threshold) || DEFAULT_FREE_THRESHOLD,
    };
  } catch {
    return { baseCharge: DEFAULT_BASE_CHARGE, freeThreshold: DEFAULT_FREE_THRESHOLD };
  }
}

interface CartStore {
  items: StoreCartItem[];
  cartsByCity: Record<string, StoreCartItem[]>;
  activeCityId: string | null;
  isLoading: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  deliveryBaseCharge: number;
  deliveryFreeThreshold: number;
  hasHydrated: boolean;

  setHasHydrated: (h: boolean) => void;
  loadDeliverySettings: () => Promise<void>;
  loadCart: () => Promise<void>;

  addItem: (product: StoreProduct, quantity?: number, unit?: ProductUnit) => Promise<void>;
  removeItem: (productId: string, unit?: ProductUnit) => Promise<void>;
  updateQuantity: (productId: string, quantity: number, unit?: ProductUnit) => Promise<void>;
  clearCart: () => Promise<void>;
  switchCity: (cityId: string) => void;

  /** Back-compat aliases used by existing screens */
  addToCart: (product: StoreProduct, quantity?: number, unit?: ProductUnit) => Promise<void>;
  removeFromCart: (productId: string, unit?: ProductUnit) => Promise<void>;

  syncWithBackend: () => Promise<boolean>;
  mergeWithServerCart: () => Promise<void>;
  isInCart: (productId: string, unit?: ProductUnit) => boolean;
  getItemQuantity: (productId: string, unit?: ProductUnit) => number;

  getTotalItems: () => number;
  itemCount: () => number;
  getSubtotal: () => number;
  subtotal: () => number;
  getDeliveryCharge: (isFreeDeliverySlot?: boolean) => number;
  deliveryCharge: () => number;
  getFinalTotal: (isFreeDeliverySlot?: boolean) => number;
  total: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      cartsByCity: {},
      activeCityId: null,
      isLoading: false,
      syncError: null,
      lastSyncedAt: null,
      deliveryBaseCharge: DEFAULT_BASE_CHARGE,
      deliveryFreeThreshold: DEFAULT_FREE_THRESHOLD,
      hasHydrated: false,

      setHasHydrated: (h) => set({ hasHydrated: h }),

      loadDeliverySettings: async () => {
        const settings = await fetchDeliverySettings();
        set({
          deliveryBaseCharge: settings.baseCharge,
          deliveryFreeThreshold: settings.freeThreshold,
        });
      },

      loadCart: async () => {
        set({ isLoading: true, syncError: null });
        try {
          const cityId = get().activeCityId || (await getSelectedCityId());
          if (cityId) {
            const cityItems = get().cartsByCity[cityId] || [];
            set({ items: cityItems, activeCityId: cityId });
          }
          await get().loadDeliverySettings();
        } catch (error: any) {
          set({ syncError: 'Failed to load cart. Please try again.' });
        } finally {
          set({ isLoading: false });
        }
      },

      addItem: async (product, quantity = 1, unit = 'full') => {
        set({ isLoading: true, syncError: null });
        try {
          set((state) => {
            const targetKey = lineKey(product.id, unit);
            const existingItem = state.items.find(
              (item) => lineKey(item.product.id, item.unit || 'full') === targetKey
            );

            let nextItems: StoreCartItem[];
            if (existingItem) {
              nextItems = state.items.map((item) =>
                lineKey(item.product.id, item.unit || 'full') === targetKey
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              );
            } else {
              nextItems = [
                ...state.items,
                {
                  product,
                  quantity,
                  unit,
                  unitPrice: priceForUnit(product, unit),
                },
              ];
            }

            return persistActiveCityItems(state, nextItems);
          });

          const items = get().items;
          cartService
            .syncCartWithBackend(items)
            .then((ok) => {
              if (ok) set({ lastSyncedAt: Date.now(), syncError: null });
              else set({ syncError: 'Failed to sync cart with server.' });
            })
            .catch(() => set({ syncError: 'Failed to sync cart with server.' }));
        } finally {
          set({ isLoading: false });
        }
      },

      removeItem: async (productId, unit = 'full') => {
        set({ isLoading: true });
        try {
          set((state) => {
            const nextItems = state.items.filter(
              (item) => lineKey(item.product.id, item.unit || 'full') !== lineKey(productId, unit)
            );
            return persistActiveCityItems(state, nextItems);
          });
          await cartService.syncCartWithBackend(get().items);
        } finally {
          set({ isLoading: false });
        }
      },

      updateQuantity: async (productId, quantity, unit = 'full') => {
        if (quantity <= 0) {
          await get().removeItem(productId, unit);
          return;
        }

        set({ isLoading: true });
        try {
          set((state) => {
            const nextItems = state.items.map((item) =>
              lineKey(item.product.id, item.unit || 'full') === lineKey(productId, unit)
                ? { ...item, quantity }
                : item
            );
            return persistActiveCityItems(state, nextItems);
          });
          await cartService.syncCartWithBackend(get().items);
        } finally {
          set({ isLoading: false });
        }
      },

      clearCart: async () => {
        set({ isLoading: true });
        try {
          set((state) => persistActiveCityItems(state, []));
          await cartService.clearCart();
        } finally {
          set({ isLoading: false });
        }
      },

      switchCity: (cityId) => {
        set((state) => {
          const nextByCity = { ...state.cartsByCity };
          if (state.activeCityId) {
            nextByCity[state.activeCityId] = state.items;
          }
          const nextItems = nextByCity[cityId] || [];
          return {
            activeCityId: cityId,
            cartsByCity: nextByCity,
            items: nextItems,
          };
        });
        get().loadDeliverySettings().catch(() => {});
      },

      addToCart: async (product, quantity, unit) => get().addItem(product, quantity, unit),
      removeFromCart: async (productId, unit) => get().removeItem(productId, unit),

      syncWithBackend: async () => {
        try {
          const success = await cartService.syncCartWithBackend(get().items);
          if (success) set({ lastSyncedAt: Date.now(), syncError: null });
          return success;
        } catch {
          set({ syncError: 'Failed to sync with server.' });
          return false;
        }
      },

      mergeWithServerCart: async () => {
        set({ isLoading: true });
        try {
          await get().syncWithBackend();
        } finally {
          set({ isLoading: false });
        }
      },

      isInCart: (productId, unit = 'full') =>
        get().items.some(
          (item) =>
            item.product.id === productId && (item.unit || 'full') === unit
        ),

      getItemQuantity: (productId, unit = 'full') => {
        const item = get().items.find(
          (i) => i.product.id === productId && (i.unit || 'full') === unit
        );
        return item?.quantity || 0;
      },

      getTotalItems: () => get().items.reduce((total, item) => total + item.quantity, 0),
      itemCount: () => get().getTotalItems(),

      getSubtotal: () =>
        get().items.reduce(
          (total, item) => total + resolveLineUnitPrice(item) * item.quantity,
          0
        ),
      subtotal: () => get().getSubtotal(),

      getDeliveryCharge: (isFreeDeliverySlot = false) => {
        const { items, deliveryBaseCharge, deliveryFreeThreshold } = get();
        if (items.length === 0) return 0;
        return calcDeliveryCharge(
          items,
          deliveryFreeThreshold,
          deliveryBaseCharge,
          isFreeDeliverySlot
        );
      },
      deliveryCharge: () => get().getDeliveryCharge(),

      getFinalTotal: (isFreeDeliverySlot = false) =>
        get().getSubtotal() + get().getDeliveryCharge(isFreeDeliverySlot),
      total: () => get().getFinalTotal(),
    }),
    {
      name: 'freshbazar-cart-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        cartsByCity: state.cartsByCity,
        activeCityId: state.activeCityId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        if (state?.activeCityId && state.cartsByCity[state.activeCityId]) {
          state.items = state.cartsByCity[state.activeCityId];
        }
      },
    }
  )
);

export default useCartStore;
