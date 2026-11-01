import { productSchemas } from '../../src/middleware/validation';

// Regression: stripUnknown used to silently drop every catalog-v2 field, so
// "Allow for restaurants" never saved and the restaurant shop stayed empty.
const v2 = {
  consumer_enabled_b: false,
  restaurant_enabled_a: true,
  restaurant_enabled_b: 'true',
  half_kg_price_b: '35',
  restaurant_half_kg_price_a: 44,
  quarter_kg_price_c: '',
};

describe('product schemas keep catalog-v2 fields', () => {
  for (const kind of ['create', 'update'] as const) {
    it(`${kind}: restaurant/consumer flags and fraction prices survive validation`, () => {
      const base = kind === 'create'
        ? { name_en: 'Onion', category_id: '7c0dae27-85fa-4453-95d0-2f275af5f140', price: 90, unit_type: 'kg' }
        : { name_en: 'Onion' };
      const { value, error } = productSchemas[kind].validate({ ...base, ...v2 }, { stripUnknown: true, abortEarly: false });
      expect(error).toBeUndefined();
      expect(value.restaurant_enabled_a).toBe(true);
      expect(value.restaurant_enabled_b).toBe(true);
      expect(value.consumer_enabled_b).toBe(false);
      expect(value.half_kg_price_b).toBe(35);
      expect(value.restaurant_half_kg_price_a).toBe(44);
      expect(value.quarter_kg_price_c).toBe('');
    });
  }
});
