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

  // I22: the cart page / header cart read the delivery charge without the city
  // (so they quoted the general charge, not this city's), and an office charge
  // or free-delivery limit of 0 turned into Rs 100 / Rs 500 (the `|| default`).
  // The server bills the city's own figures, 0 included.
  describe('delivery settings follow the selected city (I22)', () => {
    const fetchMock = () => (global as unknown as { fetch: jest.Mock }).fetch;
    const answer = (data: Record<string, unknown>) =>
      fetchMock().mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ data }) }));
    const getItem = window.localStorage.getItem as jest.Mock;
    afterEach(() => getItem.mockReset());

    it("asks for the selected city's charge", async () => {
      getItem.mockImplementation((k: string) => (k === 'website_selected_city_id' ? 'city-lhr' : null));
      answer({ base_charge: 150, free_delivery_threshold: 1000 });
      await useCartStore.getState().loadDeliverySettings();
      expect(String(fetchMock().mock.calls[0][0])).toContain('city_id=city-lhr');
      expect(useCartStore.getState().deliveryBaseCharge).toBe(150);
      expect(useCartStore.getState().deliveryFreeThreshold).toBe(1000);
    });

    it('a charge of 0 stays 0 (free delivery) — not Rs 100', async () => {
      answer({ base_charge: 0, free_delivery_threshold: 0 });
      await useCartStore.getState().loadDeliverySettings();
      expect(useCartStore.getState().deliveryBaseCharge).toBe(0);
      expect(useCartStore.getState().deliveryFreeThreshold).toBe(0);
    });

    it('a missing or broken answer keeps the defaults', async () => {
      answer({});
      await useCartStore.getState().loadDeliverySettings();
      expect(useCartStore.getState().deliveryBaseCharge).toBe(100);
      fetchMock().mockImplementation(() => Promise.reject(new Error('down')));
      await useCartStore.getState().loadDeliverySettings();
      expect(useCartStore.getState().deliveryFreeThreshold).toBe(500);
    });

    it('switching city reloads that city\'s charge', async () => {
      answer({ base_charge: 70, free_delivery_threshold: 800 });
      useCartStore.getState().switchCity('city-2');
      await new Promise((r) => setTimeout(r, 0));
      expect(useCartStore.getState().deliveryBaseCharge).toBe(70);
    });
  });
});
