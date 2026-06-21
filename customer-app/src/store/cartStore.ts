import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProductUnit, ProductQuality, StoreCartItem, StoreProduct } from '@app-types';
import { priceForUnit, resolveLineUnitPrice } from '@/lib/unitPricing';
import { getSelectedCityId } from '@/lib/cityStorage';
import { withCityParams } from '@/lib/apiHelpers';
import { cartService } from '@services/cart.service';
import { calculateDeliveryCharge as calcDeliveryCharge } from '@utils/helpers';
import { API_BASE_URL } from '@utils/constants';

const lineKey = (productId: string, unit: ProductUnit = 'full', quality: ProductQuality = 'A') =>
  `${productId}::${unit}::${quality}`;

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

async function fetchDeliverySettings(): Promise<{ baseCharge: number; freeThreshold: number; slotCutoffPercent: number }> {
  try {
    const params = withCityParams();
    const qs = params.city_id ? `?city_id=${encodeURIComponent(params.city_id)}` : '';
    const res = await fetch(`${API_BASE_URL}/site-settings/delivery${qs}`);
    const json = await res.json();
    const data = json?.data || json;
    const cutoff = parseFloat(data?.slot_cutoff_percent);
    return {
      baseCharge: parseFloat(data?.base_charge) || DEFAULT_BASE_CHARGE,
      freeThreshold: parseFloat(data?.free_delivery_threshold) || DEFAULT_FREE_THRESHOLD,
      slotCutoffPercent: Number.isFinite(cutoff) ? cutoff : 60,
    };
  } catch {
    return { baseCharge: DEFAULT_BASE_CHARGE, freeThreshold: DEFAULT_FREE_THRESHOLD, slotCutoffPercent: 60 };
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
  deliverySlotCutoffPercent: number;
  hasHydrated: boolean;

  setHasHydrated: (h: boolean) => void;
  loadDeliverySettings: () => Promise<void>;
  loadCart: () => Promise<void>;

  addItem: (product: StoreProduct, quantity?: number, unit?: ProductUnit, quality?: ProductQuality) => Promise<void>;
  removeItem: (productId: string, unit?: ProductUnit, quality?: ProductQuality) => Promise<void>;
  updateQuantity: (productId: string, quantity: number, unit?: ProductUnit, quality?: ProductQuality) => Promise<void>;
  clearCart: () => Promise<void>;
  switchCity: (cityId: string) => void;

  /** Back-compat aliases used by existing screens */
  addToCart: (product: StoreProduct, quantity?: number, unit?: ProductUnit, quality?: ProductQuality) => Promise<void>;
  removeFromCart: (productId: string, unit?: ProductUnit, quality?: ProductQuality) => Promise<void>;

  syncWithBackend: () => Promise<boolean>;
  mergeWithServerCart: () => Promise<void>;
  isInCart: (productId: string, unit?: ProductUnit, quality?: ProductQuality) => boolean;
  getItemQuantity: (productId: string, unit?: ProductUnit, quality?: ProductQuality) => number;

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
      deliverySlotCutoffPercent: 60,
      hasHydrated: false,

      setHasHydrated: (h) => set({ hasHydrated: h }),

      loadDeliverySettings: async () => {
        const settings = await fetchDeliverySettings();
        set({
          deliveryBaseCharge: settings.baseCharge,
          deliveryFreeThreshold: settings.freeThreshold,
          deliverySlotCutoffPercent: settings.slotCutoffPercent,
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

      addItem: async (product, quantity = 1, unit = 'full', quality = 'A') => {
        set({ isLoading: true, syncError: null });
        try {
          set((state) => {
            const targetKey = lineKey(product.id, unit, quality);
            const existingItem = state.items.find(
              (item) => lineKey(item.product.id, item.unit || 'full', item.quality || 'A') === targetKey
            );

            let nextItems: StoreCartItem[];
            if (existingItem) {
              nextItems = state.items.map((item) =>
                lineKey(item.product.id, item.unit || 'full', item.quality || 'A') === targetKey
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
                  quality,
                  unitPrice: priceForUnit(product, unit, quality),
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

      removeItem: async (productId, unit = 'full', quality = 'A') => {
        set({ isLoading: true });
        try {
          set((state) => {
            const nextItems = state.items.filter(
              (item) => lineKey(item.product.id, item.unit || 'full', item.quality || 'A') !== lineKey(productId, unit, quality)
            );
            return persistActiveCityItems(state, nextItems);
          });
          await cartService.syncCartWithBackend(get().items);
        } finally {
          set({ isLoading: false });
        }
      },

      updateQuantity: async (productId, quantity, unit = 'full', quality = 'A') => {
        if (quantity <= 0) {
          await get().removeItem(productId, unit, quality);
          return;
        }

        set({ isLoading: true });
        try {
          set((state) => {
            const nextItems = state.items.map((item) =>
              lineKey(item.product.id, item.unit || 'full', item.quality || 'A') === lineKey(productId, unit, quality)
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
          await cartService.clearBackendCart();
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

      addToCart: async (product, quantity, unit, quality) => get().addItem(product, quantity, unit, quality),
      removeFromCart: async (productId, unit, quality) => get().removeItem(productId, unit, quality),

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

      isInCart: (productId, unit = 'full', quality = 'A') =>
        get().items.some(
          (item) =>
            item.product.id === productId &&
            (item.unit || 'full') === unit &&
            (item.quality || 'A') === quality
        ),

      getItemQuantity: (productId, unit = 'full', quality = 'A') => {
        const item = get().items.find(
          (i) =>
            i.product.id === productId &&
            (i.unit || 'full') === unit &&
            (i.quality || 'A') === quality
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
