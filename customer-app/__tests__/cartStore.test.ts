// The customer's cart: lines per product + size + quality, prices from the real
// unit-pricing rules, the delivery rule (vegetables/fruit toward the free
// threshold), a cart per city, and the server copy kept in step.
const mockCartService = { syncCartWithBackend: jest.fn(async () => true), clearBackendCart: jest.fn(async () => true) };
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
  useCartStore.setState({ items: [], cartsByCity: {}, activeCityId: 'city-1', deliveryBaseCharge: 100, deliveryFreeThreshold: 500, syncError: null });
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
