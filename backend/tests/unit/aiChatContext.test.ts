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
import { buildContext } from '@/services/aiChat.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: any[]) => ({ rows: r, rowCount: r.length, command: 'SELECT', oid: 0, fields: [] }) as any;

const PRODUCT_COLS = [
  'id', 'name_en', 'name_ur', 'unit_type', 'price', 'price_b', 'price_c',
  'stock_quantity', 'stock_quantity_b', 'stock_quantity_c',
  'reserved_quantity', 'reserved_quantity_b', 'reserved_quantity_c',
  'consumer_enabled_a', 'consumer_enabled_b', 'consumer_enabled_c',
  'is_featured', 'tags', 'is_active', 'city_id',
];

// Almond: A in stock (3800); B priced but 0 stock; C disabled though priced+stock.
const ALMOND = {
  id: 'p-almond', name_en: 'Almond', name_ur: 'بادام', unit_type: 'kg',
  price: 3800, price_b: 3200, price_c: 2500,
  stock_quantity: 10, stock_quantity_b: 0, stock_quantity_c: 5,
  reserved_quantity: 0, reserved_quantity_b: 0, reserved_quantity_c: 0,
  consumer_enabled_a: true, consumer_enabled_b: true, consumer_enabled_c: false,
};
// Onion: A out of stock; B in stock (60).
const ONION = {
  id: 'p-onion', name_en: 'Onion', name_ur: 'پیاز', unit_type: 'kg',
  price: 80, price_b: 60, price_c: null,
  stock_quantity: 0, stock_quantity_b: 20, stock_quantity_c: 0,
  reserved_quantity: 0, reserved_quantity_b: 0, reserved_quantity_c: 0,
  consumer_enabled_a: true, consumer_enabled_b: true, consumer_enabled_c: false,
};
// Spinach: nothing buyable (A fully reserved, B/C no stock).
const SPINACH = {
  id: 'p-spinach', name_en: 'Spinach', name_ur: 'پالک', unit_type: 'kg',
  price: 50, price_b: null, price_c: null,
  stock_quantity: 4, stock_quantity_b: 0, stock_quantity_c: 0,
  reserved_quantity: 4, reserved_quantity_b: 0, reserved_quantity_c: 0,
  consumer_enabled_a: true, consumer_enabled_b: false, consumer_enabled_c: false,
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

describe('aiChat buildContext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('quotes ONLY in-stock, enabled qualities for the selected city', async () => {
    installDb({ keyword: [ALMOND] });
    const ctx = await buildContext('almond ka rate kya hai', { cityId: 'city-lhr' });

    expect(ctx).toContain('/product/p-almond');
    expect(ctx).toContain('Quality A Rs.3800/kg'); // A is in stock
    expect(ctx).not.toContain('Quality B'); // B has 0 stock
    expect(ctx).not.toContain('Quality C'); // C is disabled for consumers
  });

  it('falls back to the highest in-stock quality when A is out of stock', async () => {
    installDb({ keyword: [ONION] });
    const ctx = await buildContext('pyaz rate', { cityId: 'city-lhr' });

    expect(ctx).toContain('/product/p-onion');
    expect(ctx).toContain('Quality B Rs.60/kg');
    expect(ctx).not.toContain('Quality A'); // A out of stock
  });

  it('omits products that have nothing buyable today', async () => {
    installDb({ keyword: [SPINACH] });
    const ctx = await buildContext('spinach price', { cityId: 'city-lhr' });

    expect(ctx).not.toContain('/product/p-spinach');
    expect(ctx).toContain('in stock'); // falls through to honest "no products in stock" wording
  });

  it('uses the city in-stock catalog for Roman-Urdu fuzzy matching (badam → Almond)', async () => {
    installDb({ keyword: [], catalog: [ALMOND, ONION, SPINACH] });
    const ctx = await buildContext('badam ka rate kya hai', { cityId: 'city-lhr' });

    expect(ctx).toContain('/product/p-almond'); // Almond available
    expect(ctx).toContain('/product/p-onion'); // Onion available (B)
    expect(ctx).not.toContain('/product/p-spinach'); // nothing buyable
  });

  it('never quotes a price when no city is selected — asks to pick one', async () => {
    installDb({ keyword: [ALMOND], catalog: [ALMOND] });
    const ctx = await buildContext('tamatar ka rate', { cityId: null });

    expect(ctx).not.toContain('Quality');
    expect(ctx).not.toContain('/product/');
    expect(ctx.toLowerCase()).toContain('city');
  });
});
