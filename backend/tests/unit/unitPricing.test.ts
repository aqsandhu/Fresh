// ============================================================================
// UNIT PRICING (Catalog v2) — per-quality enable flags + explicit fractions.
// ============================================================================

import {
  consumerQualities,
  restaurantQualities,
  isQualityOffered,
  resolveConsumerUnitPrice,
  resolveRestaurantUnitPrice,
} from '@/utils/unitPricing';

describe('consumerQualities', () => {
  it('offers A by default; B/C only when priced; respects disable flags', () => {
    expect(consumerQualities({ price: 100, price_b: 80, price_c: null })).toEqual(['A', 'B']);
    // A disabled for consumers -> not offered even though priced.
    expect(consumerQualities({ price: 100, price_b: 80, consumer_enabled_a: false })).toEqual(['B']);
    // B priced but disabled.
    expect(consumerQualities({ price: 100, price_b: 80, consumer_enabled_b: false })).toEqual(['A']);
  });
});

describe('restaurantQualities', () => {
  it('offers nothing unless the per-quality restaurant flag is on', () => {
    expect(restaurantQualities({ price: 100, price_b: 80 })).toEqual([]); // default off
    expect(restaurantQualities({ price: 100, price_b: 80, restaurant_enabled_a: true, restaurant_enabled_b: true })).toEqual(['A', 'B']);
    // Enabled but the tier has no base price -> not offered.
    expect(restaurantQualities({ price: 100, restaurant_enabled_a: true, restaurant_enabled_b: true })).toEqual(['A']);
  });
});

describe('isQualityOffered', () => {
  it('gates per channel', () => {
    const p = { price: 100, price_b: 80, consumer_enabled_b: false, restaurant_enabled_a: true };
    expect(isQualityOffered(p, 'A', 'consumer')).toBe(true);
    expect(isQualityOffered(p, 'B', 'consumer')).toBe(false); // disabled for consumer
    expect(isQualityOffered(p, 'A', 'restaurant')).toBe(true);
    expect(isQualityOffered(p, 'B', 'restaurant')).toBe(false); // restaurant B not enabled
  });
});

describe('resolveConsumerUnitPrice — explicit B/C fractions', () => {
  it('uses an explicit half/quarter price when set, else derives 50%/25%', () => {
    const p = { price: 100, price_b: 80, half_kg_price_b: 50, quarter_kg_price_b: null };
    expect(resolveConsumerUnitPrice(p, 'B', 'full')).toBe(80);
    expect(resolveConsumerUnitPrice(p, 'B', 'half_kg')).toBe(50); // explicit override
    expect(resolveConsumerUnitPrice(p, 'B', 'quarter_kg')).toBe(20); // derived 25%
  });

  it('returns null when the tier is not priced', () => {
    expect(resolveConsumerUnitPrice({ price: 100 }, 'C', 'full')).toBeNull();
  });
});

describe('resolveRestaurantUnitPrice — explicit restaurant fractions', () => {
  it('honours explicit restaurant fraction prices, else derives from the restaurant base', () => {
    const p = { price: 100, restaurant_price_a: 90, restaurant_half_kg_price_a: 40 };
    expect(resolveRestaurantUnitPrice(p, 'A', 'full')).toBe(90);
    expect(resolveRestaurantUnitPrice(p, 'A', 'half_kg')).toBe(40); // explicit
    expect(resolveRestaurantUnitPrice(p, 'A', 'quarter_kg')).toBe(22.5); // derived from 90
  });

  it('falls back to the consumer base when no restaurant price is set', () => {
    expect(resolveRestaurantUnitPrice({ price: 100 }, 'A', 'full')).toBe(100);
  });
});
