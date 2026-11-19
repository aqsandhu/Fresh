// Owner decision Q5: the cart belongs to the account — the same cart in every
// browser / phone the customer signs in on. Rules: lib/savedCart.
const mockCartApi = {
  sync: jest.fn(async (_items: unknown[]) => ({})),
  clear: jest.fn(async () => ({})),
  getSaved: jest.fn(async (): Promise<unknown[]> => []),
};
const mockProductsApi = { getByIds: jest.fn(async (_ids: string[], _city: string): Promise<unknown[]> => []) };
jest.mock('@/lib/api', () => ({
  get cartApi() { return mockCartApi; },
  get productsApi() { return mockProductsApi; },
}));

import { useAuthStore, useCartStore } from '@/store/cartStore';
import { pushCart, resetSavedCartSyncForTests, syncSavedCart, watchCartChanges } from '@/lib/savedCartSync';
import { mergeCartLines, parseSavedCart } from '@/lib/savedCart';
import type { Product } from '@/types';

const product = (id: string, price: number): Product =>
  ({ id, name: id, nameEn: id, price, unit: 'kg', inStock: true, category: 'vegetables' } as unknown as Product);
const tomato = product('tomato', 200);
const apple = product('apple', 300);
const chicken = product('chicken', 800);
const saved = (product_id: string, quantity: number, extra: Record<string, unknown> = {}) =>
  ({ product_id, quantity, unit: 'full', quality: 'A', city_id: 'city-1', ...extra });

const cart = () => useCartStore.getState();
const signIn = (yes: boolean) => useAuthStore.setState({ isAuthenticated: yes });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const ids = () => cart().items.map((i) => i.product.id).sort();

let unwatch: () => void = () => undefined;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCartApi.sync.mockResolvedValue({});
  mockCartApi.clear.mockResolvedValue({});
  mockCartApi.getSaved.mockResolvedValue([]);
  mockProductsApi.getByIds.mockResolvedValue([]);
  resetSavedCartSyncForTests();
  useCartStore.setState({ items: [], cartsByCity: {}, activeCityId: 'city-1', unsaved: null, savedCityId: null, hasHydrated: true });
  signIn(true);
  unwatch = watchCartChanges();
});
afterEach(() => {
  unwatch();
  jest.useRealTimers();
});

/** Let the "a moment after the last change" send happen. */
const afterAMoment = async () => {
  jest.advanceTimersByTime(1000);
  await settle();
};

describe('pure rules', () => {
  it('reads the saved lines, leaving out anything malformed', () => {
    expect(parseSavedCart([saved('a', 2), { product_id: 'b', quantity: 0 }, { quantity: 3 }, saved('c', 1, { unit: 'weird', quality: 'Z' })]))
      .toEqual([
        { productId: 'a', quantity: 2, unit: 'full', quality: 'A', cityId: 'city-1' },
        { productId: 'c', quantity: 1, unit: 'full', quality: 'A', cityId: 'city-1' },
      ]);
    expect(parseSavedCart('nonsense')).toEqual([]);
  });

  it('joins two carts: every line, the larger quantity for a line in both', () => {
    const merged = mergeCartLines(
      [{ product: tomato, quantity: 1 }, { product: chicken, quantity: 1 }],
      [{ product: tomato, quantity: 3 }, { product: apple, quantity: 2 }]
    );
    expect(Object.fromEntries(merged.map((i) => [i.product.id, i.quantity]))).toEqual({ tomato: 3, chicken: 1, apple: 2 });
  });
});

describe('the cart saved with the account', () => {
  it('a change made while signed in is sent to the account a moment later — once', async () => {
    cart().addItem(tomato, 1);
    cart().addItem(tomato, 1);
    expect(cart().unsaved).toBe('pending');
    expect(mockCartApi.sync).not.toHaveBeenCalled();
    await afterAMoment();
    expect(mockCartApi.sync).toHaveBeenCalledTimes(1);
    expect(mockCartApi.sync).toHaveBeenCalledWith([{ product_id: 'tomato', quantity: 2, unit: 'full', quality: 'A' }]);
    expect(cart().unsaved).toBeNull();
    expect(cart().savedCityId).toBe('city-1');
  });

  it('emptying the cart empties the saved one', async () => {
    cart().addItem(tomato, 1);
    await afterAMoment();
    cart().clearCart();
    await afterAMoment();
    expect(mockCartApi.clear).toHaveBeenCalledTimes(1);
  });

  it('another browser shows the account cart after sign-in', async () => {
    mockCartApi.getSaved.mockResolvedValue([saved('tomato', 2), saved('apple', 1)]);
    mockProductsApi.getByIds.mockResolvedValue([tomato, apple]);
    await syncSavedCart();
    expect(mockProductsApi.getByIds).toHaveBeenCalledWith(['tomato', 'apple'], 'city-1');
    expect(ids()).toEqual(['apple', 'tomato']);
    await afterAMoment();
    // Showing the saved cart is not a change: nothing is written back.
    expect(mockCartApi.sync).not.toHaveBeenCalled();
  });

  it('a guest cart is joined to the account cart at sign-in, then saved', async () => {
    signIn(false);
    cart().addItem(tomato, 1);
    cart().addItem(chicken, 1);
    await afterAMoment();
    expect(cart().unsaved).toBe('guest');
    expect(mockCartApi.sync).not.toHaveBeenCalled();

    signIn(true);
    mockCartApi.getSaved.mockResolvedValue([saved('tomato', 3), saved('apple', 2)]);
    mockProductsApi.getByIds.mockResolvedValue([tomato, apple]);
    await syncSavedCart();
    expect(Object.fromEntries(cart().items.map((i) => [i.product.id, i.quantity]))).toEqual({ tomato: 3, chicken: 1, apple: 2 });
    expect(mockCartApi.sync).toHaveBeenCalledTimes(1);
    expect(cart().unsaved).toBeNull();
  });

  it('adding right after sign-in, before the carts are joined, never overwrites the account cart', async () => {
    signIn(false);
    cart().addItem(tomato, 1);
    signIn(true);
    let release: (v: unknown[]) => void = () => undefined;
    mockCartApi.getSaved.mockReturnValueOnce(new Promise<unknown[]>((res) => { release = res; }));
    mockCartApi.getSaved.mockResolvedValue([saved('apple', 2)]);
    mockProductsApi.getByIds.mockResolvedValue([apple]);
    const joining = syncSavedCart();
    await settle();
    cart().addItem(chicken, 1);
    await afterAMoment();
    expect(mockCartApi.sync).not.toHaveBeenCalled();
    release([saved('apple', 2)]);
    await joining;
    await afterAMoment();
    await afterAMoment();
    expect(ids()).toEqual(['apple', 'chicken', 'tomato']);
    expect(mockCartApi.sync).toHaveBeenCalledTimes(1);
    expect(cart().unsaved).toBeNull();
  });

  it('an emptied account cart (order placed on the phone) empties this browser too', async () => {
    cart().addItem(tomato, 2);
    await afterAMoment();
    mockCartApi.getSaved.mockResolvedValue([]);
    await syncSavedCart();
    expect(cart().items).toEqual([]);
  });

  it('a change the server never got is sent first; nothing is pulled over it', async () => {
    mockCartApi.sync.mockRejectedValueOnce(new Error('offline'));
    cart().addItem(tomato, 4);
    await afterAMoment();
    expect(cart().unsaved).toBe('pending');
    mockCartApi.getSaved.mockResolvedValue([saved('apple', 9)]);
    await syncSavedCart();
    expect(mockCartApi.getSaved).not.toHaveBeenCalled();
    expect(ids()).toEqual(['tomato']);
    expect(cart().unsaved).toBeNull();
  });

  it('switching city shows that city’s cart and does not overwrite the saved one', async () => {
    cart().addItem(tomato, 1);
    await afterAMoment();
    mockCartApi.sync.mockClear();
    cart().switchCity('city-2');
    await afterAMoment();
    expect(mockCartApi.sync).not.toHaveBeenCalled();
    expect(mockCartApi.clear).not.toHaveBeenCalled();
  });

  it('signed out: nothing is read or sent; offline leaves the cart alone', async () => {
    signIn(false);
    await syncSavedCart();
    expect(await pushCart()).toBe(false);
    expect(mockCartApi.getSaved).not.toHaveBeenCalled();
    signIn(true);
    useCartStore.setState({ items: [{ product: tomato, quantity: 1 }], cartsByCity: { 'city-1': [{ product: tomato, quantity: 1 }] } });
    mockCartApi.getSaved.mockRejectedValue(new Error('offline'));
    await syncSavedCart();
    expect(ids()).toEqual(['tomato']);
  });
});
