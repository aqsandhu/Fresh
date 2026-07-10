import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { productService } from '@/services/product.service';

describe('productService', () => {
  beforeEach(() => resetApiMocks());

  it('getProducts maps frontend filter names onto backend query params', async () => {
    mockApi.get.mockResolvedValue({
      success: true,
      data: [{ id: 'p1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await productService.getProducts({
      page: 1,
      limit: 20,
      categoryId: 'cat1',
      search: 'apple',
      isActive: true,
    } as never);

    expect(mockApi.get).toHaveBeenCalledWith('/admin/products', {
      page: 1,
      limit: 20,
      category: 'cat1',
      search: 'apple',
      is_active: true,
    });
    expect(result.products).toEqual([{ id: 'p1' }]);
    expect(result.pagination.total).toBe(1);
  });

  it('getProducts maps failures to a friendly error', async () => {
    mockApi.get.mockRejectedValue({ response: { data: { message: 'city missing' } } });

    await expect(productService.getProducts()).rejects.toThrow('city missing');
  });

  it('getProductById unwraps the product', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { id: 'p2' } });

    expect(await productService.getProductById('p2')).toEqual({ id: 'p2' });
    expect(mockApi.get).toHaveBeenCalledWith('/admin/products/p2');
  });

  it('createProduct posts multipart form data with snake_case fields', async () => {
    mockApi.postForm.mockResolvedValue({ success: true, data: { id: 'p3' } });

    await productService.createProduct({
      nameEn: 'Fresh Apples',
      price: 250,
      categoryId: 'cat1',
      unitType: 'kg',
    } as never);

    expect(mockApi.postForm).toHaveBeenCalledTimes(1);
    const [url, form] = mockApi.postForm.mock.calls[0];
    expect(url).toBe('/admin/products');
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('name_en')).toBe('Fresh Apples');
    expect(form.get('price')).toBe('250');
  });

  it('moveProductsToCategory PATCHes ids + target category', async () => {
    mockApi.patch.mockResolvedValue({ success: true, data: { moved: 2 } });

    const result = await productService.moveProductsToCategory(['p1', 'p2'], 'cat9');

    expect(mockApi.patch).toHaveBeenCalledWith('/admin/products/move-category', {
      product_ids: ['p1', 'p2'],
      category_id: 'cat9',
    });
    expect(result).toEqual({ moved: 2 });
  });

  it('toggleProductStatus PATCHes the toggle-active endpoint', async () => {
    mockApi.patch.mockResolvedValue({ success: true, data: { id: 'p1', isActive: false } });

    const result = await productService.toggleProductStatus('p1');

    expect(mockApi.patch).toHaveBeenCalledWith('/admin/products/p1/toggle-active');
    expect(result).toEqual({ id: 'p1', isActive: false });
  });
});
