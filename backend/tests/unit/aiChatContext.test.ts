// ============================================================================
// AI CHAT — buildContext REAL-FACTS builder
// Locks in the business rules the owner requires:
//   * price/products ONLY from the user's selected city (never other cities)
//   * quote ONLY qualities (A/B/C) that are IN STOCK & enabled today
//   * Roman-Urdu fuzzy fallback lists the city's in-stock catalog for matching
//   * with no city selected, never quote — ask the user to pick a city
// ============================================================================

import { jest } from '@jest/globals';

jest.mock('@/utils/siteSettings', () => ({
  fetchGlobalSettings: jest.fn<any>().mockResolvedValue({}),
}));

import { query } from '@/config/database';
import { buildContext, generateReply } from '@/services/aiChat.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: any[]) => ({ rows: r, rowCount: r.length, command: 'SELECT', oid: 0, fields: [] }) as any;
const originalFetch = global.fetch;

const PRODUCT_COLS = [
  'id', 'name_en', 'name_ur', 'unit_type', 'price', 'price_b', 'price_c',
  'stock_quantity', 'stock_quantity_b', 'stock_quantity_c',
  'reserved_quantity', 'reserved_quantity_b', 'reserved_quantity_c',
  'consumer_enabled_a', 'consumer_enabled_b', 'consumer_enabled_c',
  'half_kg_price', 'quarter_kg_price', 'half_dozen_price',
  'half_kg_price_b', 'quarter_kg_price_b', 'half_dozen_price_b',
  'half_kg_price_c', 'quarter_kg_price_c', 'half_dozen_price_c',
  'allow_half_kg', 'allow_quarter_kg',
  'is_featured', 'tags', 'is_active', 'city_id',
];

// Almond: A in stock (3800); B priced but 0 stock; C disabled though priced+stock.
const ALMOND = {
  id: 'p-almond', name_en: 'Almond', name_ur: 'بادام', unit_type: 'kg',
  price: 3800, price_b: 3200, price_c: 2500,
  stock_quantity: 10, stock_quantity_b: 0, stock_quantity_c: 5,
  reserved_quantity: 0, reserved_quantity_b: 0, reserved_quantity_c: 0,
  consumer_enabled_a: true, consumer_enabled_b: true, consumer_enabled_c: false,
  half_kg_price: 2000, quarter_kg_price: null, half_dozen_price: null,
  half_kg_price_b: null, quarter_kg_price_b: null, half_dozen_price_b: null,
  half_kg_price_c: null, quarter_kg_price_c: null, half_dozen_price_c: null,
  allow_half_kg: true, allow_quarter_kg: true,
};
// Onion: A out of stock; B in stock (60).
const ONION = {
  id: 'p-onion', name_en: 'Onion', name_ur: 'پیاز', unit_type: 'kg',
  price: 80, price_b: 60, price_c: null,
  stock_quantity: 0, stock_quantity_b: 20, stock_quantity_c: 0,
  reserved_quantity: 0, reserved_quantity_b: 0, reserved_quantity_c: 0,
  consumer_enabled_a: true, consumer_enabled_b: true, consumer_enabled_c: false,
  half_kg_price: null, quarter_kg_price: null, half_dozen_price: null,
  half_kg_price_b: null, quarter_kg_price_b: null, half_dozen_price_b: null,
  half_kg_price_c: null, quarter_kg_price_c: null, half_dozen_price_c: null,
  allow_half_kg: true, allow_quarter_kg: true,
};
// Spinach: nothing buyable (A fully reserved, B/C no stock).
const SPINACH = {
  id: 'p-spinach', name_en: 'Spinach', name_ur: 'پالک', unit_type: 'kg',
  price: 50, price_b: null, price_c: null,
  stock_quantity: 4, stock_quantity_b: 0, stock_quantity_c: 0,
  reserved_quantity: 4, reserved_quantity_b: 0, reserved_quantity_c: 0,
  consumer_enabled_a: true, consumer_enabled_b: false, consumer_enabled_c: false,
  half_kg_price: null, quarter_kg_price: null, half_dozen_price: null,
  half_kg_price_b: null, quarter_kg_price_b: null, half_dozen_price_b: null,
  half_kg_price_c: null, quarter_kg_price_c: null, half_dozen_price_c: null,
  allow_half_kg: true, allow_quarter_kg: true,
};
const EGGS = {
  id: 'p-eggs', name_en: 'Eggs', name_ur: 'Eggs Urdu', unit_type: 'dozen',
  price: 360, price_b: null, price_c: null,
  stock_quantity: 15, stock_quantity_b: 0, stock_quantity_c: 0,
  reserved_quantity: 0, reserved_quantity_b: 0, reserved_quantity_c: 0,
  consumer_enabled_a: true, consumer_enabled_b: false, consumer_enabled_c: false,
  half_kg_price: null, quarter_kg_price: null, half_dozen_price: 190,
  half_kg_price_b: null, quarter_kg_price_b: null, half_dozen_price_b: null,
  half_kg_price_c: null, quarter_kg_price_c: null, half_dozen_price_c: null,
  allow_half_kg: true, allow_quarter_kg: true,
};

/** Route mocked queries by SQL shape so call-order doesn't matter. */
function installDb(opts: { keyword?: any[]; catalog?: any[] }) {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('information_schema.columns')) {
      return rows(PRODUCT_COLS.map((c) => ({ column_name: c })));
    }
    if (s.includes('FROM service_cities') && s.includes('is_active')) {
      return rows([{ name: 'Lahore' }, { name: 'Karachi' }]);
    }
    if (s.includes('FROM service_cities') && s.includes('WHERE id')) {
      return rows([{ name: 'Lahore' }]);
    }
    if (s.includes('FROM products') && s.includes('ILIKE')) {
      return rows(opts.keyword ?? []);
    }
    if (s.includes('FROM products')) {
      return rows(opts.catalog ?? []);
    }
    return rows([]);
  });
}

function mockProviderReply(text: string) {
  process.env.AI_CHAT_API_KEY = 'test-key';
  (global as any).fetch = jest.fn<any>().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ text }] }),
  });
}

describe('aiChat buildContext', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    delete process.env.AI_CHAT_API_KEY;
    (global as any).fetch = originalFetch;
  });

  it('quotes ONLY in-stock, enabled qualities for the selected city', async () => {
    installDb({ keyword: [ALMOND] });
    const ctx = await buildContext('almond ka rate kya hai', { cityId: 'city-lhr' });

    expect(ctx).toContain('/product/p-almond');
    expect(ctx).toContain('Quality A: 1 kg Rs.3800'); // A is in stock
    expect(ctx).toContain('half kg Rs.2000'); // explicit fraction override
    expect(ctx).toContain('quarter kg Rs.950'); // derived fraction
    expect(ctx).not.toContain('Quality B'); // B has 0 stock
    expect(ctx).not.toContain('Quality C'); // C is disabled for consumers
  });

  it('falls back to the highest in-stock quality when A is out of stock', async () => {
    installDb({ keyword: [ONION] });
    const ctx = await buildContext('pyaz rate', { cityId: 'city-lhr' });

    expect(ctx).toContain('/product/p-onion');
    expect(ctx).toContain('Quality B: 1 kg Rs.60');
    expect(ctx).not.toContain('Quality A'); // A out of stock
  });

  it('includes half-dozen pricing for dozen products', async () => {
    installDb({ keyword: [EGGS] });
    const ctx = await buildContext('anday ka rate', { cityId: 'city-lhr' });

    expect(ctx).toContain('/product/p-eggs');
    expect(ctx).toContain('Quality A: dozen Rs.360');
    expect(ctx).toContain('half dozen Rs.190');
  });

  it('omits products that have nothing buyable today', async () => {
    installDb({ keyword: [SPINACH] });
    const ctx = await buildContext('spinach price', { cityId: 'city-lhr' });

    expect(ctx).not.toContain('/product/p-spinach');
    expect(ctx).toContain('in stock'); // falls through to honest "no products in stock" wording
  });

  it('uses Roman-Urdu aliases in keyword search (badam -> Almond)', async () => {
    installDb({ keyword: [ALMOND] });
    const ctx = await buildContext('badam ka rate kya hai', { cityId: 'city-lhr' });

    expect(ctx).toContain('/product/p-almond'); // Almond available
    expect(ctx).not.toContain('/product/p-onion');
  });

  it('lists catalog only for generic browse/menu questions', async () => {
    installDb({ keyword: [], catalog: [ALMOND, ONION, SPINACH] });
    const ctx = await buildContext('sabzi menu dikhao', { cityId: 'city-lhr' });

    expect(ctx).toContain('/product/p-almond'); // Almond available
    expect(ctx).toContain('/product/p-onion'); // Onion available (B)
    expect(ctx).not.toContain('/product/p-spinach'); // nothing buyable
  });

  it('does not dump catalog or invent alternatives for a specific no-match product', async () => {
    installDb({ keyword: [], catalog: [ALMOND, ONION] });
    const ctx = await buildContext('kiwi ka rate kya hai', { cityId: 'city-lhr' });

    expect(ctx).toContain('No matching product was found');
    expect(ctx).not.toContain('/product/p-almond');
    expect(ctx).not.toContain('/product/p-onion');
  });

  it('never quotes a price when no city is selected — asks to pick one', async () => {
    installDb({ keyword: [ALMOND], catalog: [ALMOND] });
    const ctx = await buildContext('tamatar ka rate', { cityId: null });

    expect(ctx).not.toContain('Quality');
    expect(ctx).not.toContain('/product/');
    expect(ctx.toLowerCase()).toContain('city');
  });

  it('answers product prices from live catalog without calling the provider', async () => {
    installDb({ keyword: [ALMOND] });
    mockProviderReply('[Mango](/product/p-fake)\nQuality A: 1 kg Rs.999');

    const reply = await generateReply(
      [{ role: 'user', content: 'almond ka rate kya hai' }],
      { cityId: 'city-lhr' }
    );

    expect(reply).toContain('/product/p-almond');
    expect(reply).toContain('Quality A: 1 kg Rs.3800');
    expect(reply).toContain('half kg Rs.2000');
    expect(reply).toContain('quarter kg Rs.950');
    expect(reply).not.toContain('Mango');
    expect(reply).not.toContain('/product/p-fake');
    expect(reply).not.toContain('Rs.999');
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('answers browse/menu questions with verified catalog facts only', async () => {
    installDb({ keyword: [], catalog: [ALMOND, ONION] });
    mockProviderReply('[Mango](/product/p-fake) Quality A Rs.999');

    const reply = await generateReply(
      [{ role: 'user', content: 'sabzi menu dikhao' }],
      { cityId: 'city-lhr' }
    );

    expect(reply).toContain('/product/p-almond');
    expect(reply).toContain('/product/p-onion');
    expect(reply).toContain('Quality A: 1 kg Rs.3800');
    expect(reply).toContain('Quality B: 1 kg Rs.60');
    expect(reply).not.toContain('/product/p-fake');
    expect(reply).not.toContain('Rs.999');
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('does not invent a link or price for a no-match product', async () => {
    installDb({ keyword: [], catalog: [ALMOND] });
    mockProviderReply('Kiwi available hai, app se order kar lein.');

    const reply = await generateReply(
      [{ role: 'user', content: 'kiwi ka rate kya hai' }],
      { cityId: 'city-lhr' }
    );

    expect(reply).toContain('live catalog');
    expect(reply).not.toContain('available hai');
    expect(reply).not.toContain('/product/');
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('asks for city before quoting product prices without calling the provider', async () => {
    installDb({ keyword: [ALMOND] });
    mockProviderReply('[Almond](/product/p-almond)\nQuality A: 1 kg Rs.3800');

    const reply = await generateReply(
      [{ role: 'user', content: 'almond ka rate kya hai' }],
      { cityId: null }
    );

    expect(reply.toLowerCase()).toContain('city');
    expect(reply).not.toContain('/product/');
    expect(reply).not.toContain('Rs.3800');
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('asks for a product name when the user asks for a rate too generally', async () => {
    installDb({ keyword: [], catalog: [ALMOND] });
    mockProviderReply('[Mango](/product/p-fake)\nQuality A: 1 kg Rs.999');

    const reply = await generateReply(
      [{ role: 'user', content: 'rate kya hai' }],
      { cityId: 'city-lhr' }
    );

    expect(reply).toContain('Kis product');
    expect(reply).not.toContain('/product/');
    expect(reply).not.toContain('Rs.999');
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('keeps non-catalog product support questions on the provider path', async () => {
    installDb({ keyword: [], catalog: [ALMOND] });
    mockProviderReply('Link reload kar ke dobara try karen; masla rahe to support se rabta karen.');

    const reply = await generateReply(
      [{ role: 'user', content: 'product link open nahi ho raha' }],
      { cityId: 'city-lhr' }
    );

    expect(reply).toContain('Link reload');
    expect(reply).not.toContain('Kis product');
    expect(reply).not.toContain('live catalog');
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  // Regression: a product the user names with NO price/availability trigger word
  // (e.g. just "kiwi") is NOT flagged as product-intent, so the provider IS
  // called. The model used to be free to fabricate a /product/ link + rate with
  // zero validation. Validation now keys off the reply content, so the fake link
  // and price must be stripped even though intent detection missed.
  it('blocks a fabricated product link/price even when intent detection misses', async () => {
    installDb({ keyword: [], catalog: [ALMOND] });
    mockProviderReply('[Kiwi](/product/p-fake)\nQuality A: 1 kg Rs.999');

    const reply = await generateReply(
      [{ role: 'user', content: 'kiwi' }],
      { cityId: 'city-lhr' }
    );

    expect((global as any).fetch).toHaveBeenCalledTimes(1); // provider WAS used
    expect(reply).not.toContain('/product/p-fake'); // fake link stripped
    expect(reply).not.toContain('Rs.999'); // fake price stripped
    expect(reply).not.toContain('Kiwi'); // no invented product claim
    expect(reply.toLowerCase()).toContain('verified'); // safe fallback
  });

  it('lets a genuine non-product reply pass through unchanged', async () => {
    installDb({ keyword: [], catalog: [ALMOND] });
    mockProviderReply('Assalam-o-Alaikum! Aap ki kaise madad kar sakta hoon?');

    const reply = await generateReply(
      [{ role: 'user', content: 'salam' }],
      { cityId: 'city-lhr' }
    );

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(reply).toContain('Assalam-o-Alaikum'); // not blocked, no false positive
  });
});
