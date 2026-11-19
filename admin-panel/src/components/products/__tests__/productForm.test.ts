// The product form's data rules on their own (W21 moved them out of the
// Products page): the blank form, loading a product, validation and what is
// sent on save.
jest.mock('@/services/product.service', () => ({
  productService: { getProductById: jest.fn() },
}));

import { productService } from '@/services/product.service';
import type { Product } from '@/types';
import {
  emptyProductForm,
  loadProductForm,
  productSubmitData,
  validateProductForm,
} from '../productForm';

const getById = productService.getProductById as jest.Mock;

const listRow = {
  id: 'p1',
  nameEn: 'Tomato',
  nameUr: '',
  price: 200,
  stockQuantity: 5,
  unitType: 'kg',
  categoryId: 'c1',
  isActive: true,
  isFeatured: false,
  tags: ['tamatar'],
  images: ['/uploads/a.jpg'],
} as unknown as Product;

describe('blank form', () => {
  it('starts in kg with only Quality A, no restaurant sale and half/quarter allowed', () => {
    const f = emptyProductForm();
    expect(f).toMatchObject({ unitType: 'kg', price: 0, priceB: null, priceC: null, allowHalfKg: true, allowQuarterKg: true });
    expect(f.restaurantEnabledA).toBe(false);
    expect(f.consumerEnabledA).toBe(true);
    expect(emptyProductForm()).not.toBe(f); // a fresh object every time
  });
});

describe('loading a product', () => {
  it('uses the full product (B price, pictures) when it loads', async () => {
    getById.mockResolvedValueOnce({ ...listRow, priceB: 150, tags: ['t1'], images: ['/uploads/b.jpg', '/uploads/c.jpg'] });
    const { formData, existingImages } = await loadProductForm(listRow);
    expect(formData.priceB).toBe(150);
    expect(formData.tags).toEqual(['t1']);
    expect(existingImages).toEqual(['/uploads/b.jpg', '/uploads/c.jpg']);
  });

  it('falls back to the list row when the full product cannot be loaded', async () => {
    getById.mockRejectedValueOnce(new Error('offline'));
    const { formData, existingImages } = await loadProductForm({ ...listRow, images: [], primaryImage: '/uploads/p.jpg' } as Product);
    expect(formData.nameEn).toBe('Tomato');
    expect(formData.tags).toEqual(['tamatar']);
    expect(formData.allowHalfKg).toBe(true); // legacy products keep ½ / ¼
    expect(existingImages).toEqual(['/uploads/p.jpg']);
  });
});

describe('validation', () => {
  const valid = () => ({ ...emptyProductForm(), nameEn: 'Tomato', price: 200, categoryId: 'c1' });

  it('a complete form has no errors', () => {
    expect(validateProductForm(valid())).toEqual({});
  });

  it('names every missing or wrong field', () => {
    const errors = validateProductForm({ ...emptyProductForm(), nameUr: 'ٹ', priceB: 0 });
    expect(Object.keys(errors).sort()).toEqual(['categoryId', 'nameEn', 'nameUr', 'price', 'priceB']);
    // An original (strike-through) price must be above the price.
    expect(validateProductForm({ ...valid(), compareAtPrice: 150 }).compareAtPrice).toMatch(/higher than regular price/);
    expect(validateProductForm({ ...valid(), compareAtPrice: 250 })).toEqual({});
  });

  it('a 0 in an optional price box is refused — blank means automatic (B37)', () => {
    expect(validateProductForm({ ...valid(), halfKgPrice: 0 }).optionalPrices).toMatch(/Quality A ½ kg price must be greater than 0/);
    expect(validateProductForm({ ...valid(), halfKgPrice: null })).toEqual({});
  });
});

describe('what is sent on save', () => {
  it('never sends stock, and restaurant sale follows the category', () => {
    const form = { ...emptyProductForm(), nameEn: 'Tomato', price: 200, categoryId: 'c1', restaurantEnabledB: true };
    const allowed = productSubmitData(form, true);
    expect(allowed).not.toHaveProperty('stockQuantity');
    expect(allowed).not.toHaveProperty('stockQuantityB');
    expect(allowed.availableForRestaurants).toBe(true);

    const refused = productSubmitData(form, false);
    expect(refused.availableForRestaurants).toBe(false);
    expect(refused).toMatchObject({ restaurantEnabledA: false, restaurantEnabledB: false, restaurantEnabledC: false });
    expect(form.stockQuantity).toBe(0); // the form itself is untouched
  });
});
