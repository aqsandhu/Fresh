import { describe, it, expect } from 'vitest';
import {
  getVegFruitSubtotal,
  calculateClientDeliveryCharge,
  isVegOrFruitCategory,
} from '@/lib/deliveryRules';

describe('deliveryRules', () => {
  it('counts fresh fruit slug toward veg/fruit minimum', () => {
    expect(isVegOrFruitCategory('fruit')).toBe(true);
    expect(
      getVegFruitSubtotal([
        { product: { category: 'fruit', price: 250 }, quantity: 2 },
      ])
    ).toBe(500);
  });

  it('does not count dry-fruit toward free delivery (regression)', () => {
    expect(isVegOrFruitCategory('dry-fruit')).toBe(false);
    const items = [{ product: { category: 'dry-fruit', price: 600 }, quantity: 1 }];
    expect(getVegFruitSubtotal(items)).toBe(0);
    expect(calculateClientDeliveryCharge(items, 100, 500)).toBe(100);
  });

  it('dry-fruit plus fruit only counts fresh fruit portion', () => {
    const items = [
      { product: { category: 'dry-fruit', price: 600 }, quantity: 1 },
      { product: { category: 'fruit', price: 200 }, quantity: 1 },
    ];
    expect(getVegFruitSubtotal(items)).toBe(200);
    expect(calculateClientDeliveryCharge(items, 100, 500)).toBe(100);
  });
});
