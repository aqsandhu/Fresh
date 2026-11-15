// Tests the REAL stores in store/cartStore.ts (the older cartStore.test.ts
// only exercises a stand-in object defined inside the test file).

import { useAuthStore, useCartStore } from '@/store/cartStore';
import type { Product } from '@/types';

const product = (id: string, price: number, extra: Partial<Product> = {}): Product =>
  ({ id, name: `Product ${id}`, nameEn: `Product ${id}`, price, unit: 'kg', inStock: true, ...extra } as unknown as Product);

describe('real cart store', () => {
  beforeEach(() => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    useCartStore.setState({ items: [], cartsByCity: {}, activeCityId: 'city-1' });
  });

  it('keeps one line per product + unit + quality', () => {
    const { addItem } = useCartStore.getState();
    addItem(product('p1', 200), 1, 'full', 'A');
    addItem(product('p1', 200), 2, 'full', 'A');
    addItem(product('p1', 200), 1, 'half_kg', 'A');
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items.find((i) => (i.unit || 'full') === 'full')?.quantity).toBe(3);
  });

  it('remembers each city\'s cart separately', () => {
    useCartStore.getState().addItem(product('p1', 200));
    useCartStore.getState().switchCity('city-2');
    expect(useCartStore.getState().items).toHaveLength(0);
    useCartStore.getState().addItem(product('p9', 50));
    useCartStore.getState().switchCity('city-1');
    expect(useCartStore.getState().items.map((i) => i.product.id)).toEqual(['p1']);
  });

  it('sign-out empties every city\'s cart so the next account does not inherit it', () => {
    useCartStore.getState().addItem(product('p1', 200));
    useCartStore.getState().switchCity('city-2');
    useCartStore.getState().addItem(product('p2', 300));
    useAuthStore.setState({ user: { id: 'u1' } as never, isAuthenticated: true });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().cartsByCity).toEqual({});
  });
});
