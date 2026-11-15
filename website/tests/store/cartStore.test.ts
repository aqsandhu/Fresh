// ============================================================================
// CART STORE — tests of the REAL store (store/cartStore.ts).
//
// The file that used to live here built its own pretend cart inside the test
// and checked that — 28 tests that would have stayed green with the real store
// broken. Every behaviour it described is now checked against the real one,
// with the real price and delivery rules.
// ============================================================================
import { useCartStore } from '@/store/cartStore';
import type { Product } from '@/types';

const product = (id: string, price: number, extra: Record<string, unknown> = {}): Product =>
  ({ id, name: id, nameEn: id, price, unit: 'kg', inStock: true, category: 'vegetables', ...extra } as unknown as Product);

const tomato = product('tomato', 200, { qualifiesForFreeDelivery: true });
const apple = product('apple', 300, { qualifiesForFreeDelivery: true, category: 'fruits' });
const chicken = product('chicken', 800, { qualifiesForFreeDelivery: false, category: 'chicken' });

const store = () => useCartStore.getState();

beforeEach(() => {
  useCartStore.setState({ items: [], cartsByCity: {}, activeCityId: 'city-1', deliveryBaseCharge: 100, deliveryFreeThreshold: 500 });
});

describe('addItem', () => {
  it('adds a new line', () => {
    store().addItem(tomato, 2);
    expect(store().items).toHaveLength(1);
    expect(store().items[0]).toMatchObject({ quantity: 2 });
  });

  it('raises the quantity of the same product, size and quality', () => {
    store().addItem(tomato, 1);
    store().addItem(tomato, 2);
    expect(store().items).toHaveLength(1);
    expect(store().items[0].quantity).toBe(3);
  });

  it('keeps a different size or quality on its own line', () => {
    store().addItem(tomato, 1, 'full', 'A');
    store().addItem(tomato, 1, 'half_kg', 'A');
    store().addItem(tomato, 1, 'full', 'B');
    expect(store().items).toHaveLength(3);
  });

  it('defaults to one unit', () => {
    store().addItem(apple);
    expect(store().items[0].quantity).toBe(1);
  });
});

describe('removeItem / updateQuantity / clearCart', () => {
  it('removes only the matching line', () => {
    store().addItem(tomato, 1);
    store().addItem(apple, 1);
    store().removeItem('tomato');
    expect(store().items.map((i) => i.product.id)).toEqual(['apple']);
  });

  it('removing something that is not there changes nothing', () => {
    store().addItem(tomato, 1);
    store().removeItem('nothing');
    expect(store().items).toHaveLength(1);
  });

  it('sets a new quantity', () => {
    store().addItem(tomato, 1);
    store().updateQuantity('tomato', 5);
    expect(store().items[0].quantity).toBe(5);
  });

  it('a quantity of zero or below removes the line', () => {
    store().addItem(tomato, 1);
    store().addItem(apple, 1);
    store().updateQuantity('tomato', 0);
    store().updateQuantity('apple', -2);
    expect(store().items).toEqual([]);
  });

  it('clearCart empties the cart of the current city', () => {
    store().addItem(tomato, 1);
    store().clearCart();
    expect(store().items).toEqual([]);
    expect(store().cartsByCity['city-1']).toEqual([]);
  });
});

describe('totals', () => {
  it('counts units and prices with the line unit price', () => {
    store().addItem(tomato, 2); // 2 × 200
    store().addItem(apple, 1); // 1 × 300
    expect(store().getTotalItems()).toBe(3);
    expect(store().getTotalPrice()).toBe(700);
    expect(store().getSubtotal()).toBe(700);
  });

  it('a half-kg line is priced at half the kilo price when no half-kg price is set', () => {
    store().addItem(tomato, 2, 'half_kg');
    expect(store().getTotalPrice()).toBe(200);
  });

  it('an empty cart totals 0 and has no delivery charge', () => {
    expect(store().getTotalItems()).toBe(0);
    expect(store().getTotalPrice()).toBe(0);
    expect(store().getDeliveryCharge()).toBe(0);
  });
});

describe('delivery charge (vegetables / fruits towards the free threshold)', () => {
  it('free once vegetables and fruits reach the threshold', () => {
    store().addItem(tomato, 3); // 600
    expect(store().getDeliveryCharge()).toBe(0);
  });

  it('charged below the threshold', () => {
    store().addItem(tomato, 1); // 200
    expect(store().getDeliveryCharge()).toBe(100);
  });

  it('chicken never counts towards the threshold, however much', () => {
    store().addItem(chicken, 10); // 8000
    expect(store().getDeliveryCharge()).toBe(100);
  });

  it('a mixed cart is free only when the vegetables/fruits part alone reaches it', () => {
    store().addItem(chicken, 5);
    store().addItem(tomato, 1);
    expect(store().getDeliveryCharge()).toBe(100);
    store().addItem(apple, 1); // veg/fruit 500
    expect(store().getDeliveryCharge()).toBe(0);
  });

  it('a free-delivery slot is always free', () => {
    store().addItem(chicken, 1);
    expect(store().getDeliveryCharge(true)).toBe(0);
  });

  it('final total = subtotal + delivery', () => {
    store().addItem(tomato, 1);
    expect(store().getFinalTotal()).toBe(300);
    expect(store().getFinalTotal(true)).toBe(200);
  });
});

describe('hasOnlyChicken', () => {
  it('true only for a cart of nothing but chicken', () => {
    expect(store().hasOnlyChicken()).toBe(false);
    store().addItem(chicken, 1);
    expect(store().hasOnlyChicken()).toBe(true);
    store().addItem(tomato, 1);
    expect(store().hasOnlyChicken()).toBe(false);
  });
});
