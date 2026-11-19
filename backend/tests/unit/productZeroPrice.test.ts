import { productSchemas } from '../../src/middleware/validation';

// B37 (W16, round 10): an optional price box (½ kg, ¼ kg, ½ dozen, Quality
// B / C, every restaurant price) accepted 0 — and the price resolver treats 0
// as a real price, so that unit sold for Rs. 0. Blank still means "automatic /
// not offered"; 0 is refused with a reason.
const OPTIONAL_PRICES = [
  'half_kg_price', 'quarter_kg_price', 'half_dozen_price', 'price_b', 'price_c',
  'restaurant_price_a', 'restaurant_price_b', 'restaurant_price_c',
  'half_kg_price_b', 'quarter_kg_price_b', 'half_dozen_price_b',
  'half_kg_price_c', 'quarter_kg_price_c', 'half_dozen_price_c',
  'restaurant_half_kg_price_a', 'restaurant_quarter_kg_price_a', 'restaurant_half_dozen_price_a',
  'restaurant_half_kg_price_b', 'restaurant_quarter_kg_price_b', 'restaurant_half_dozen_price_b',
  'restaurant_half_kg_price_c', 'restaurant_quarter_kg_price_c', 'restaurant_half_dozen_price_c',
];
const base = {
  create: { name_en: 'Onion', category_id: '7c0dae27-85fa-4453-95d0-2f275af5f140', price: 90, unit_type: 'kg' },
  update: { name_en: 'Onion' },
};
const check = (kind: 'create' | 'update', body: Record<string, unknown>) =>
  productSchemas[kind].validate({ ...base[kind], ...body }, { stripUnknown: true, abortEarly: false });

describe('optional product prices are blank or above 0 — never Rs. 0', () => {
  for (const kind of ['create', 'update'] as const) {
    for (const field of OPTIONAL_PRICES) {
      it(`${kind}: ${field} = 0 is refused, naming the field`, () => {
        const { error } = check(kind, { [field]: 0 });
        expect(error?.message).toMatch(new RegExp(`${field}.*greater than 0`));
      });
    }

    it(`${kind}: blank / null / a real price are still fine`, () => {
      const body = Object.fromEntries(OPTIONAL_PRICES.map((f, i) => [f, i % 3 === 0 ? null : i % 3 === 1 ? '' : 45.5]));
      const { error } = check(kind, body);
      expect(error).toBeUndefined();
    });
  }

  it('a "remove the original price" 0 is still allowed (0 = no strike-through)', () => {
    expect(check('update', { compare_at_price: 0 }).error).toBeUndefined();
  });
});
