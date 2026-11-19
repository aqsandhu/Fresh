// The customer's cart: lines per product + size + quality, prices from the real
// unit-pricing rules, the delivery rule (vegetables/fruit toward the free
// threshold), a cart per city, and the server copy kept in step.
const mockCartService = {
  syncCartWithBackend: jest.fn(async () => true),
  clearBackendCart: jest.fn(async () => true),
  isSignedIn: jest.fn(async () => true),
  fetchServerCart: jest.fn(async (): Promise<unknown[] | null> => []),
};
const mockProductService = { getProductsByIds: jest.fn(async (): Promise<unknown[]> => []) };
jest.mock('@services/product.service', () => ({ get productService() { return mockProductService; } }));
jest.mock('@services/cart.service', () => ({ get cartService() { return mockCartService; } }));
jest.mock('@/lib/cityStorage', () => ({ getSelectedCityId: jest.fn(async () => 'city-1') }));

import { useCartStore } from '@/store/cartStore';
import type { StoreProduct } from '@app-types';

const product = (id: string, price: number, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, price, unit: 'kg', inStock: true, categorySlug: 'vegetables', ...extra } as unknown as StoreProduct);
const tomato = product('tomato', 200);
const apple = product('apple', 300, { categorySlug: 'fruits' });
const chicken = product('chicken', 800, { categorySlug: 'chicken' });
const eggs = product('eggs', 360, { unit: 'dozen', categorySlug: 'eggs' });

const cart = () => useCartStore.getState();
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  mockCartService.syncCartWithBackend.mockResolvedValue(true);
  mockCartService.clearBackendCart.mockResolvedValue(true);
  mockCartService.isSignedIn.mockResolvedValue(true);
  mockCartService.fetchServerCart.mockResolvedValue([]);
  mockProductService.getProductsByIds.mockResolvedValue([]);
  useCartStore.setState({ items: [], cartsByCity: {}, activeCityId: 'city-1', deliveryBaseCharge: 100, deliveryFreeThreshold: 500, syncError: null, unsaved: null, savedCityId: null, lastPulledAt: null, hasHydrated: true });
  (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ json: async () => ({ data: { base_charge: '150', free_delivery_threshold: '1000', slot_cutoff_percent: '70' } }) }));
});

describe('adding', () => {
  it('same product + size + quality adds up; a different size or quality is its own line', async () => {
    await cart().addItem(tomato, 1);
    await cart().addItem(tomato, 2);
    await cart().addItem(tomato, 1, 'half_kg');
    await cart().addItem(tomato, 1, 'full', 'B');
    expect(cart().items).toHaveLength(3);
    expect(cart().getItemQuantity('tomato')).toBe(3);
    expect(cart().isInCart('tomato', 'half_kg')).toBe(true);
    expect(cart().isInCart('tomato', 'quarter_kg')).toBe(false);
    await flush();
    expect(mockCartService.syncCartWithBackend).toHaveBeenCalledTimes(4);
  });

  it('half kg is priced at half the kilo price; half dozen at half the dozen', async () => {
    await cart().addItem(tomato, 2, 'half_kg');
    await cart().addItem(eggs, 1, 'half_dozen');
    expect(cart().getSubtotal()).toBe(200 + 180);
    expect(cart().subtotal()).toBe(380);
  });

  it('a failed server sync is shown, the cart is kept', async () => {
    mockCartService.syncCartWithBackend.mockResolvedValueOnce(false);
    await cart().addToCart(tomato, 1);
    await flush();
    expect(cart().syncError).toMatch(/sync/);
    expect(cart().items).toHaveLength(1);
  });
});

describe('changing', () => {
  beforeEach(async () => {
    await cart().addItem(tomato, 2);
    await cart().addItem(apple, 1);
    jest.clearAllMocks();
  });

  it('new quantity; zero removes the line', async () => {
    await cart().updateQuantity('tomato', 5);
    expect(cart().getItemQuantity('tomato')).toBe(5);
    await cart().updateQuantity('apple', 0);
    expect(cart().isInCart('apple')).toBe(false);
    expect(cart().getTotalItems()).toBe(5);
    expect(cart().itemCount()).toBe(5);
  });

  it('removing the last line clears the server cart instead of syncing an empty list', async () => {
    await cart().removeFromCart('tomato');
    expect(mockCartService.syncCartWithBackend).toHaveBeenCalled();
    await cart().removeItem('apple');
    expect(mockCartService.clearBackendCart).toHaveBeenCalledTimes(1);
    expect(cart().items).toEqual([]);
  });

  it('clearCart empties this city on the phone and on the server', async () => {
    await cart().clearCart();
    expect(cart().items).toEqual([]);
    expect(cart().cartsByCity['city-1']).toEqual([]);
    expect(mockCartService.clearBackendCart).toHaveBeenCalled();
  });
});

describe('delivery charge', () => {
  it('free once vegetables + fruit reach the threshold; chicken never counts', async () => {
    await cart().addItem(chicken, 5);
    expect(cart().getDeliveryCharge()).toBe(100);
    await cart().addItem(tomato, 1);
    await cart().addItem(apple, 1);
    expect(cart().deliveryCharge()).toBe(0);
    expect(cart().getFinalTotal()).toBe(cart().getSubtotal());
  });

  it('a free-delivery slot is free; an empty cart charges nothing', async () => {
    expect(cart().getDeliveryCharge()).toBe(0);
    await cart().addItem(tomato, 1);
    expect(cart().getFinalTotal()).toBe(300);
    expect(cart().getFinalTotal(true)).toBe(200);
    expect(cart().total()).toBe(300);
  });

  it('settings come from the server; a failure keeps safe defaults', async () => {
    await cart().loadDeliverySettings();
    expect(cart()).toMatchObject({ deliveryBaseCharge: 150, deliveryFreeThreshold: 1000, deliverySlotCutoffPercent: 70 });
    (global as { fetch?: unknown }).fetch = jest.fn(async () => { throw new Error('offline'); });
    await cart().loadDeliverySettings();
    expect(cart()).toMatchObject({ deliveryBaseCharge: 100, deliveryFreeThreshold: 500, deliverySlotCutoffPercent: 60 });
  });

  it('an office charge or free limit of 0 stays 0 — the server bills 0, not Rs 100 (I22)', async () => {
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ json: async () => ({ data: { base_charge: 0, free_delivery_threshold: '0' } }) }));
    await cart().loadDeliverySettings();
    expect(cart()).toMatchObject({ deliveryBaseCharge: 0, deliveryFreeThreshold: 0 });
  });
});

describe('a cart per city', () => {
  it('switching city keeps each city\'s cart', async () => {
    await cart().addItem(tomato, 1);
    cart().switchCity('city-2');
    expect(cart().items).toEqual([]);
    await cart().addItem(apple, 2);
    cart().switchCity('city-1');
    expect(cart().items.map((i) => i.product.id)).toEqual(['tomato']);
    expect(cart().cartsByCity['city-2'].map((i) => i.product.id)).toEqual(['apple']);
  });

  it('loadCart shows the saved city cart', async () => {
    useCartStore.setState({ activeCityId: null, items: [], cartsByCity: { 'city-1': [{ product: tomato, quantity: 3, unit: 'full', quality: 'A' }] } as never });
    await cart().loadCart();
    expect(cart().getItemQuantity('tomato')).toBe(3);
    expect(cart().isLoading).toBe(false);
  });
});

describe('syncing', () => {
  it('sync and merge report success; a throw is shown', async () => {
    await cart().addItem(tomato, 1);
    expect(await cart().syncWithBackend()).toBe(true);
    expect(cart().lastSyncedAt).not.toBeNull();
    mockCartService.syncCartWithBackend.mockRejectedValueOnce(new Error('500'));
    expect(await cart().syncWithBackend()).toBe(false);
    expect(cart().syncError).toMatch(/sync/);
    await cart().mergeWithServerCart();
    expect(cart().isLoading).toBe(false);
  });

  it('an empty cart syncs by clearing', async () => {
    expect(await cart().syncWithBackend()).toBe(true);
    expect(mockCartService.clearBackendCart).toHaveBeenCalled();
  });
});

// Owner decision Q5: the cart belongs to the account — the same cart on every
// device the customer signs in on (rules in lib/savedCart).
describe('the cart saved with the account', () => {
  const line = (productId: string, quantity: number, extra: Record<string, unknown> = {}) => ({ productId, quantity, unit: 'full', quality: 'A', cityId: 'city-1', ...extra });

  it('a new device shows the cart of the account after sign-in', async () => {
    mockCartService.fetchServerCart.mockResolvedValue([line('tomato', 2), line('apple', 1, { unit: 'half_kg' })]);
    mockProductService.getProductsByIds.mockResolvedValue([tomato, apple]);
    await cart().syncSavedCart();
    expect(mockProductService.getProductsByIds).toHaveBeenCalledWith(['tomato', 'apple'], 'city-1');
    expect(cart().items.map((i) => [i.product.id, i.quantity, i.unit])).toEqual([['tomato', 2, 'full'], ['apple', 1, 'half_kg']]);
    expect(cart().getSubtotal()).toBe(2 * 200 + 150);
    expect(cart().savedCityId).toBe('city-1');
    // Nothing changed on this device, so nothing is written back.
    expect(mockCartService.syncCartWithBackend).not.toHaveBeenCalled();
  });

  it('a guest cart is joined to the account cart at sign-in: every line, the larger quantity, never the sum', async () => {
    mockCartService.isSignedIn.mockResolvedValue(false);
    await cart().addItem(tomato, 1);
    await cart().addItem(chicken, 1);
    await flush();
    expect(cart().unsaved).toBe('guest');
    expect(mockCartService.syncCartWithBackend).not.toHaveBeenCalled();

    mockCartService.isSignedIn.mockResolvedValue(true);
    mockCartService.fetchServerCart.mockResolvedValue([line('tomato', 3), line('apple', 2)]);
    mockProductService.getProductsByIds.mockResolvedValue([tomato, apple]);
    await cart().syncSavedCart();
    const got = Object.fromEntries(cart().items.map((i) => [i.product.id, i.quantity]));
    expect(got).toEqual({ tomato: 3, chicken: 1, apple: 2 });
    expect(mockCartService.syncCartWithBackend).toHaveBeenCalledTimes(1);
    expect(cart().unsaved).toBeNull();
  });

  it('an emptied account cart (order placed on another device) empties this device too', async () => {
    await cart().addItem(tomato, 2);
    await flush();
    expect(cart().savedCityId).toBe('city-1');
    mockCartService.fetchServerCart.mockResolvedValue([]);
    await cart().syncSavedCart();
    expect(cart().items).toEqual([]);
  });

  it('a change the server never got is sent first — this device wins, nothing is pulled over it', async () => {
    mockCartService.syncCartWithBackend.mockResolvedValueOnce(false);
    await cart().addItem(tomato, 4);
    await flush();
    expect(cart().unsaved).toBe('pending');
    mockCartService.fetchServerCart.mockResolvedValue([line('apple', 9)]);
    await cart().syncSavedCart();
    expect(mockCartService.fetchServerCart).not.toHaveBeenCalled();
    expect(mockCartService.syncCartWithBackend).toHaveBeenCalledTimes(2);
    expect(cart().items.map((i) => i.product.id)).toEqual(['tomato']);
    expect(cart().unsaved).toBeNull();
  });

  it('a product no longer sold is left out; offline leaves the cart alone', async () => {
    mockCartService.fetchServerCart.mockResolvedValue([line('tomato', 1), line('gone', 5)]);
    mockProductService.getProductsByIds.mockResolvedValue([tomato]);
    await cart().syncSavedCart();
    expect(cart().items.map((i) => i.product.id)).toEqual(['tomato']);

    mockCartService.fetchServerCart.mockResolvedValue(null);
    await cart().syncSavedCart();
    expect(cart().items.map((i) => i.product.id)).toEqual(['tomato']);
    mockCartService.fetchServerCart.mockResolvedValue([line('apple', 1)]);
    mockProductService.getProductsByIds.mockRejectedValue(new Error('offline'));
    await cart().syncSavedCart();
    expect(cart().items.map((i) => i.product.id)).toEqual(['tomato']);
  });

  it('something added while the saved cart is being read is not overwritten', async () => {
    let release: (v: unknown[]) => void = () => undefined;
    mockCartService.fetchServerCart.mockReturnValue(new Promise<unknown[]>((res) => { release = res; }));
    const reading = cart().syncSavedCart();
    await flush();
    await cart().addItem(chicken, 1);
    release([line('apple', 2)]);
    await reading;
    expect(cart().items.map((i) => i.product.id)).toEqual(['chicken']);
  });

  it('adding right after sign-in, before the carts are joined, never overwrites the account cart', async () => {
    mockCartService.isSignedIn.mockResolvedValue(false);
    await cart().addItem(tomato, 1);
    await flush();
    mockCartService.isSignedIn.mockResolvedValue(true);
    let release: (v: unknown[]) => void = () => undefined;
    mockCartService.fetchServerCart.mockReturnValueOnce(new Promise<unknown[]>((res) => { release = res; }));
    mockCartService.fetchServerCart.mockResolvedValue([line('apple', 2)]);
    mockProductService.getProductsByIds.mockResolvedValue([apple]);
    const joining = cart().syncSavedCart();
    await flush();
    await cart().addItem(chicken, 1);
    await flush();
    // The guest cart was NOT sent over what the account had saved.
    expect(mockCartService.syncCartWithBackend).not.toHaveBeenCalled();
    release([line('apple', 2)]);
    await joining;
    for (let i = 0; i < 6; i++) await flush();
    expect(cart().items.map((i) => i.product.id).sort()).toEqual(['apple', 'chicken', 'tomato']);
    expect(mockCartService.syncCartWithBackend).toHaveBeenCalledTimes(1);
    expect(cart().unsaved).toBeNull();
  });

  it('nobody signed in: nothing is read or sent', async () => {
    mockCartService.isSignedIn.mockResolvedValue(false);
    await cart().syncSavedCart();
    expect(mockCartService.fetchServerCart).not.toHaveBeenCalled();
  });
});
