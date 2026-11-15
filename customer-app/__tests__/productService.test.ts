// Catalogue reads: what the API sends becomes what the shop shows (prices,
// fraction prices, quality B/C, stock), the whole catalogue is paged (never cut
// at 100), and settings fall back safely when the server is unreachable.
const mockApi = { get: jest.fn() };
jest.mock('@services/api', () => ({
  __esModule: true,
  get default() { return mockApi; },
  handleApiError: (e: Error) => e,
}));

import { productService } from '@services/product.service';
import { setCachedCityId } from '@/lib/apiHelpers';

const raw = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name_en: `P${id}`, name_ur: 'پ', price: '200', compare_at_price: '250', unit_type: 'kg',
  primary_image: '/uploads/p.jpg', stock_quantity: '10', category_slug: 'vegetables', ...extra,
});

beforeEach(() => {
  jest.resetAllMocks();
  setCachedCityId('city-1');
});

describe('product mapping', () => {
  it('prices, sale price, images, fraction and quality prices', async () => {
    mockApi.get.mockResolvedValue({
      data: { data: raw('1', { half_kg_price: '95', quarter_kg_price: '', price_b: '150', stock_quantity_b: '4', allow_quarter_kg: false, is_variable_weight: true, review_count: '7' }) },
    });
    const p = (await productService.getProductById('1')).data!;
    expect(p).toMatchObject({
      name: 'P1', price: 200, originalPrice: 250, unit: 'kg', inStock: true, halfKgPrice: 95, quarterKgPrice: null,
      priceB: 150, stockQuantityB: 4, allowQuarterKg: false, allowHalfKg: true, isVariableWeight: true, reviewCount: 7,
    });
    expect(p.images[0]).toMatch(/^https?:\/\/.*\/uploads\/p\.jpg$/);
    expect(mockApi.get).toHaveBeenCalledWith('/products/1', { params: { city_id: 'city-1' } });
  });

  it('out of stock only when no quality the customer can buy has stock', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: raw('2', { stock_quantity: '0', price_b: '150', stock_quantity_b: '3' }) } });
    expect((await productService.getProductBySlug('p2')).data!.inStock).toBe(true);
    mockApi.get.mockResolvedValueOnce({ data: { data: raw('3', { stock_quantity: '0', price_b: '150', stock_quantity_b: '3', consumer_enabled_b: false }) } });
    expect((await productService.getProductBySlug('p3')).data!.inStock).toBe(false);
  });
});

describe('lists', () => {
  it('no city chosen yet: nothing is fetched', async () => {
    setCachedCityId(null);
    expect((await productService.getProducts()).data!.data).toEqual([]);
    expect((await productService.getCategories()).data).toEqual([]);
    expect((await productService.searchProducts('x')).data).toEqual([]);
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('the whole catalogue is paged through (and a repeated row is not doubled)', async () => {
    const page = (start: number, n: number) => Array.from({ length: n }, (_, i) => raw(String(start + i)));
    mockApi.get
      .mockResolvedValueOnce({ data: { data: page(0, 100), meta: { totalPages: 3 } } })
      .mockResolvedValueOnce({ data: { data: [raw('99'), ...page(100, 99)], meta: { totalPages: 3 } } })
      .mockResolvedValueOnce({ data: { data: page(199, 5), meta: { totalPages: 3 } } });
    const all = (await productService.getAllProducts()).data!;
    expect(all).toHaveLength(204);
    expect(mockApi.get).toHaveBeenCalledTimes(3);
  });

  it('a category without a limit means all of it; with a limit one request', async () => {
    mockApi.get.mockResolvedValue({ data: { data: [raw('1')], meta: { totalPages: 1 } } });
    expect((await productService.getProductsByCategory('cat-1')).data).toHaveLength(1);
    expect(mockApi.get.mock.calls[0][1].params).toMatchObject({ category: 'cat-1', page: 1, limit: 100 });
    await productService.getProductsByCategory('cat-1', { limit: 6 });
    expect(mockApi.get.mock.calls[1][1].params).toMatchObject({ category: 'cat-1', limit: 6 });
  });

  it('featured page, search and categories', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: [raw('1')], meta: { page: 2, totalPages: 4, total: 31 } } });
    expect(await productService.getFeaturedPage(2, 8)).toMatchObject({ page: 2, totalPages: 4, total: 31 });
    mockApi.get.mockResolvedValueOnce({ data: { data: [raw('5')] } });
    expect((await productService.searchProducts('tom')).data![0].id).toBe('5');
    mockApi.get.mockResolvedValueOnce({ data: { data: [{ id: 'c1', name_en: 'Fruits', slug: 'fruits' }] } });
    expect((await productService.getCategories()).data![0]).toMatchObject({ id: 'c1' });
    mockApi.get.mockResolvedValueOnce({ data: { data: { id: 'c2', name_en: 'Veg' } } });
    expect((await productService.getCategoryById('c2')).data!.id).toBe('c2');
    mockApi.get.mockResolvedValueOnce({ data: { data: [raw('1')], meta: { total: 40, page: 1, limit: 20, totalPages: 2 } } });
    expect((await productService.getProducts({ featured: true } as never)).data).toMatchObject({ total: 40, totalPages: 2 });
  });

  it('a failed list read is passed on to the screen', async () => {
    mockApi.get.mockRejectedValue(new Error('down'));
    await expect(productService.getProducts()).rejects.toThrow('down');
  });
});

describe('site settings with safe fallbacks', () => {
  it('banner: admin texts and ticker; never a placeholder phone number', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: { banner_left_text: ' 0311-2223344 ', banner_ticker_items: '["Fresh","Fast"]' } } });
    expect((await productService.getBannerSettings()).data).toMatchObject({ leftText: '0311-2223344', tickerItems: ['Fresh', 'Fast'] });
    mockApi.get.mockRejectedValueOnce(new Error('down'));
    expect((await productService.getBannerSettings()).data).toMatchObject({ leftText: '', middleText: '', tickerItems: [] });
  });

  it('feature flags default OFF, lists default empty, urls default blank on errors', async () => {
    mockApi.get.mockRejectedValue(new Error('down'));
    expect((await productService.getPublicConfig()).data).toEqual({ atta_chakki_enabled: false });
    expect((await productService.getBaskets()).data).toEqual([]);
    expect((await productService.getServiceArea()).data).toMatchObject({ enabled: false, polygons: [] });
    expect((await productService.getWhatsAppOrderUrl()).data).toEqual({ url: '' });
    expect((await productService.getHeroImage()).data).toEqual({ url: '' });
    expect((await productService.getBanners()).data).toEqual([]);
  });

  it('values come through when the server answers', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: { atta_chakki_enabled: true } } });
    expect((await productService.getPublicConfig()).data.atta_chakki_enabled).toBe(true);
    mockApi.get.mockResolvedValueOnce({ data: { data: [{ id: 'b1', name: 'Combo', total_price: 999, items: [] }] } });
    expect((await productService.getBaskets()).data).toHaveLength(1);
    mockApi.get.mockResolvedValueOnce({ data: { data: { enabled: true, polygons: [[[1, 2]]], message: { title: 'Not here' } } } });
    expect((await productService.getServiceArea()).data).toMatchObject({ enabled: true, message: { title: 'Not here' } });
    mockApi.get.mockResolvedValueOnce({ data: { data: { whatsapp_order_url: ' https://wa.me/1 ' } } });
    expect((await productService.getWhatsAppOrderUrl()).data.url).toBe('https://wa.me/1');
    mockApi.get.mockResolvedValueOnce({ data: { data: { hero_image_url: 'https://cdn/h.jpg' } } });
    expect((await productService.getHeroImage()).data.url).toBe('https://cdn/h.jpg');
  });
});
