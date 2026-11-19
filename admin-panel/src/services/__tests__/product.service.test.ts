import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { productService } from '@/services/product.service';

// The error-path tests make the service log its error (console.error) on
// purpose; keep that out of the test output so real warnings stand out.
let consoleErrorSpy: jest.SpyInstance;
beforeEach(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => consoleErrorSpy.mockRestore());

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

  // W16 (round 10)
  it('asking for more than one server page (Price Manager: 500) fetches the following pages too', async () => {
    const page = (n: number, count: number) => ({
      success: true,
      data: Array.from({ length: count }, (_, i) => ({ id: `p${n}-${i}` })),
      meta: { page: n, limit: 100, total: 230, totalPages: 3 },
    });
    mockApi.get.mockResolvedValueOnce(page(1, 100)).mockResolvedValueOnce(page(2, 100)).mockResolvedValueOnce(page(3, 30));
    const result = await productService.getProducts({ limit: 500, search: 'a' });
    expect(result.products).toHaveLength(230);
    expect(mockApi.get).toHaveBeenNthCalledWith(3, '/admin/products', { limit: 100, search: 'a', page: 3 });
    expect(result.pagination.limit).toBe(230);
  });

  it('an explicit page is never auto-extended; an empty later page stops the loop', async () => {
    mockApi.get.mockResolvedValueOnce({ success: true, data: [{ id: 'a' }], meta: { page: 2, limit: 100, total: 300, totalPages: 3 } });
    await productService.getProducts({ page: 2, limit: 500 });
    expect(mockApi.get).toHaveBeenCalledTimes(1);
    resetApiMocks();
    mockApi.get
      .mockResolvedValueOnce({ success: true, data: Array(100).fill({ id: 'x' }), meta: { page: 1, limit: 100, total: 300, totalPages: 3 } })
      .mockResolvedValueOnce({ success: true, data: [], meta: { page: 2, limit: 100, total: 300, totalPages: 3 } });
    const r = await productService.getProducts({ limit: 300 });
    expect(mockApi.get).toHaveBeenCalledTimes(2);
    expect(r.products).toHaveLength(100);
  });

  it('update sends ONLY the fields given; null clears a price ("" on the wire), kept images go as JSON', async () => {
    mockApi.putForm.mockResolvedValue({ success: true, data: { id: 'p1' } });
    await productService.updateProduct('p1', { price: 120, halfKgPrice: null, priceB: 80, restaurantHalfKgPriceA: null, existingImages: ['/a.jpg'], isActive: false });
    const [url, fd] = mockApi.putForm.mock.calls[0] as [string, FormData];
    expect(url).toBe('/admin/products/p1');
    expect(Object.fromEntries(fd.entries())).toEqual({
      price: '120', half_kg_price: '', price_b: '80', is_active: 'false',
      restaurant_half_kg_price_a: '', existing_images: '["/a.jpg"]',
    });
  });

  it('create sends the new pictures and the catalog-v2 switches', async () => {
    mockApi.postForm.mockResolvedValue({ success: true, data: { id: 'n' } });
    const img = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await productService.createProduct({ nameEn: 'Aloo', price: 100, categoryId: 'veg', unitType: 'kg', images: [img], restaurantEnabledA: true, halfKgPriceB: 45 } as any);
    const fd = mockApi.postForm.mock.calls[0][1] as FormData;
    expect(fd.getAll('images')).toHaveLength(1);
    expect(fd.get('restaurant_enabled_a')).toBe('true');
    expect(fd.get('half_kg_price_b')).toBe('45');
    expect(fd.get('consumer_enabled_b')).toBeNull(); // not given → not sent
  });

  it('soft delete, permanent delete, picture upload / removal hit the right endpoints', async () => {
    mockApi.delete.mockResolvedValue({ success: true });
    mockApi.postForm.mockResolvedValue({ success: true, data: { imageUrls: ['/u/1.jpg'] } });
    await productService.deleteProduct('p1');
    await productService.hardDeleteProduct('p1');
    await productService.deleteProductImage('p1', 2);
    await expect(productService.uploadProductImages('p1', [new File(['x'], 'b.png')])).resolves.toEqual(['/u/1.jpg']);
    expect(mockApi.delete.mock.calls.map((c) => c[0])).toEqual(['/admin/products/p1?soft=true', '/admin/products/p1', '/admin/products/p1/images/2']);
  });

  it.each([
    ['updateProduct', () => productService.updateProduct('p1', {}), 'putForm', 'Failed to update product'],
    ['deleteProduct', () => productService.deleteProduct('p1'), 'delete', 'Failed to delete product'],
    ['hardDeleteProduct', () => productService.hardDeleteProduct('p1'), 'delete', 'Failed to permanently delete product'],
    ['moveProductsToCategory', () => productService.moveProductsToCategory(['p1'], 'c'), 'patch', 'Failed to move products'],
    ['uploadProductImages', () => productService.uploadProductImages('p1', []), 'postForm', 'Failed to upload images'],
    ['deleteProductImage', () => productService.deleteProductImage('p1', 0), 'delete', 'Failed to delete image'],
  ] as const)('%s: the server reason wins, else a plain message', async (_name, run, method, fallback) => {
    (mockApi as any)[method].mockRejectedValueOnce({ response: { data: { message: 'Product is in an open order' } } });
    await expect(run()).rejects.toThrow('Product is in an open order');
    (mockApi as any)[method].mockRejectedValueOnce(new Error('network'));
    await expect(run()).rejects.toThrow(fallback);
  });
});
