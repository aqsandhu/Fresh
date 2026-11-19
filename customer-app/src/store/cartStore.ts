import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProductUnit, ProductQuality, StoreCartItem, StoreProduct } from '@app-types';
import { priceForUnit, resolveLineUnitPrice } from '@/lib/unitPricing';
import { getSelectedCityId } from '@/lib/cityStorage';
import { withCityParams } from '@/lib/apiHelpers';
import { cartService } from '@services/cart.service';
import { productService } from '@services/product.service';
import { buildItemsFromSaved, cartLineKey, groupLinesByCity, mergeCartLines, UnsavedKind } from '@/lib/savedCart';
import { calculateDeliveryCharge as calcDeliveryCharge } from '@utils/helpers';
import { API_BASE_URL } from '@utils/constants';

const lineKey = cartLineKey;

// A change made on this device while the saved cart is being read must win:
// each change bumps this, and a read that finds it moved is thrown away.
let localChangeSeq = 0;
let savedCartBusy = false;
let savedCartRerun = false;

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

/** A real figure from the office, 0 included (0 = free delivery / no limit) — I22. */
const settingOr = (value: unknown, fallback: number): number => {
  const n = parseFloat(String(value ?? ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

async function fetchDeliverySettings(): Promise<{ baseCharge: number; freeThreshold: number; slotCutoffPercent: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const params = withCityParams();
    const qs = params.city_id ? `?city_id=${encodeURIComponent(params.city_id)}` : '';
    const res = await fetch(`${API_BASE_URL}/site-settings/delivery${qs}`, {
      signal: controller.signal,
    });
    const json = await res.json();
    const data = json?.data || json;
    const cutoff = parseFloat(data?.slot_cutoff_percent);
    return {
      baseCharge: settingOr(data?.base_charge, DEFAULT_BASE_CHARGE),
      freeThreshold: settingOr(data?.free_delivery_threshold, DEFAULT_FREE_THRESHOLD),
      slotCutoffPercent: Number.isFinite(cutoff) ? cutoff : 60,
    };
  } catch {
    // Timeout/network failure — fall back to safe defaults
    return { baseCharge: DEFAULT_BASE_CHARGE, freeThreshold: DEFAULT_FREE_THRESHOLD, slotCutoffPercent: 60 };
  } finally {
    clearTimeout(timeout);
  }
}

interface CartStore {
  items: StoreCartItem[];
  cartsByCity: Record<string, StoreCartItem[]>;
  activeCityId: string | null;
  isLoading: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  /** null = the account holds this cart; see lib/savedCart for guest / pending. */
  unsaved: UnsavedKind;
  /** The city whose cart the account holds, as far as this device knows. */
  savedCityId: string | null;
  lastPulledAt: number | null;
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
  /** Bring this device and the cart saved with the account into line (see lib/savedCart). */
  syncSavedCart: () => Promise<void>;
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
      unsaved: null,
      savedCityId: null,
      lastPulledAt: null,
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
        } catch {
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

          localChangeSeq++;
          // Not on the server yet (a guest cart stays a guest cart until it is joined).
          set((state) => ({ unsaved: state.unsaved === 'guest' ? 'guest' : 'pending' }));
          get().syncWithBackend().catch(() => undefined);
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
          localChangeSeq++;
          // Not on the server yet (a guest cart stays a guest cart until it is joined).
          set((state) => ({ unsaved: state.unsaved === 'guest' ? 'guest' : 'pending' }));
          await get().syncWithBackend();
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
          localChangeSeq++;
          // Not on the server yet (a guest cart stays a guest cart until it is joined).
          set((state) => ({ unsaved: state.unsaved === 'guest' ? 'guest' : 'pending' }));
          await get().syncWithBackend();
        } finally {
          set({ isLoading: false });
        }
      },

      clearCart: async () => {
        set({ isLoading: true });
        try {
          set((state) => persistActiveCityItems(state, []));
          localChangeSeq++;
          // Not on the server yet (a guest cart stays a guest cart until it is joined).
          set((state) => ({ unsaved: state.unsaved === 'guest' ? 'guest' : 'pending' }));
          await get().syncWithBackend();
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

      // Send this device's cart (the active city's) to the account. A guest's
      // cart goes nowhere and is remembered as "guest"; a failed send is
      // remembered as "pending" and retried by syncSavedCart.
      syncWithBackend: async () => {
        try {
          if (!(await cartService.isSignedIn())) {
            const anyItems = get().items.length > 0 || Object.values(get().cartsByCity).some((c) => c.length > 0);
            set({ unsaved: anyItems ? 'guest' : null });
            return true;
          }
          // A guest cart is JOINED to the account's cart (syncSavedCart), never
          // sent over it — sending it would wipe what the account had saved.
          if (get().unsaved === 'guest') {
            get().syncSavedCart().catch(() => undefined);
            return true;
          }
          const { items, activeCityId } = get();
          const success =
            items.length === 0
              ? await cartService.clearBackendCart()
              : await cartService.syncCartWithBackend(items, activeCityId);
          if (success) set({ lastSyncedAt: Date.now(), syncError: null, unsaved: null, savedCityId: activeCityId });
          else set({ syncError: 'Failed to sync cart with server.', unsaved: 'pending' });
          return success;
        } catch {
          set({ syncError: 'Failed to sync with server.', unsaved: 'pending' });
          return false;
        }
      },

      syncSavedCart: async () => {
        if (!get().hasHydrated) return;
        if (savedCartBusy) {
          savedCartRerun = true;
          return;
        }
        savedCartBusy = true;
        try {
          if (!(await cartService.isSignedIn())) return;
          const started = get();

          // A change the server never got: this device wins, send it.
          if (started.unsaved === 'pending') {
            await get().syncWithBackend();
            return;
          }

          const seq = localChangeSeq;
          const lines = await cartService.fetchServerCart();
          if (!lines) return;
          if (seq !== localChangeSeq) {
            savedCartRerun = true;
            return;
          }

          const merge = started.unsaved === 'guest';
          const nextByCity: Record<string, StoreCartItem[]> = { ...started.cartsByCity };
          if (started.activeCityId) nextByCity[started.activeCityId] = started.items;

          const groups = groupLinesByCity(lines, started.activeCityId);
          // The account's cart is empty (an order was placed, or it was emptied,
          // on another device): the copy this device holds goes too.
          if (!merge && lines.length === 0 && started.savedCityId) nextByCity[started.savedCityId] = [];

          let savedCityId = started.savedCityId;
          for (const [cityId, cityLines] of groups) {
            let products: StoreProduct[];
            try {
              products = await productService.getProductsByIds(cityLines.map((l) => l.productId), cityId);
            } catch {
              return; // offline — leave this device's cart as it is
            }
            const savedItems = buildItemsFromSaved(cityLines, products);
            nextByCity[cityId] = merge ? mergeCartLines(nextByCity[cityId] || [], savedItems) : savedItems;
            savedCityId = cityId;
          }
          if (seq !== localChangeSeq) {
            savedCartRerun = true;
            return;
          }

          const activeCityId = get().activeCityId;
          set({
            cartsByCity: nextByCity,
            items: activeCityId ? nextByCity[activeCityId] || [] : get().items,
            lastPulledAt: Date.now(),
            savedCityId,
            // The joined cart still has to reach the account: pending until sent.
            unsaved: merge ? 'pending' : null,
          });
          // After joining a guest cart, the account must hold the result.
          if (merge) await get().syncWithBackend();
        } finally {
          savedCartBusy = false;
          // Something changed while this ran. Only a guest cart still waiting
          // to be joined needs another go — any other change sent itself.
          if (savedCartRerun) {
            savedCartRerun = false;
            if (get().unsaved === 'guest') get().syncSavedCart().catch(() => undefined);
          }
        }
      },

      mergeWithServerCart: async () => get().syncSavedCart(),

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
        unsaved: state.unsaved,
        savedCityId: state.savedCityId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.activeCityId && state.cartsByCity[state.activeCityId]) {
          state.items = state.cartsByCity[state.activeCityId];
        }
        // A cart saved by an older app version has no "unsaved" mark: treat it
        // as a guest cart, so it is JOINED to the account's cart, never lost.
        if (state && state.unsaved === undefined) {
          state.unsaved = Object.values(state.cartsByCity || {}).some((c) => c.length > 0) ? 'guest' : null;
        }
        state?.setHasHydrated(true);
      },
    }
  )
);

export default useCartStore;
