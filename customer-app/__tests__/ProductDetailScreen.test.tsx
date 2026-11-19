// W15 (round 10): product page — the right line (unit + quality) goes into
// the cart, each quality's own stock is respected, links by slug work.
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockRoute = { params: { productId: '11111111-1111-4111-8111-111111111111' } };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), push: jest.fn(), getParent: jest.fn() }),
  useRoute: () => mockRoute,
}));
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCityId: 'city-1' }) }));
jest.mock('@services/order.service', () => ({
  __esModule: true,
  orderService: { getDeliverySettings: jest.fn(async () => ({ success: true, data: { free_delivery_threshold: 500 } })) },
}));
jest.mock('@services/product.service', () => ({
  __esModule: true,
  productService: { getProductById: jest.fn(), getProductBySlug: jest.fn(), getProductsByCategory: jest.fn() },
}));
jest.mock('@store', () => {
  const cart = { addItem: jest.fn(async () => undefined), items: [] as any[] };
  return {
    __esModule: true,
    useCartStore: () => cart,
    useWishlistStore: () => ({ toggle: jest.fn(), isWishlisted: () => false }),
    useAuthStore: (sel?: any) => (sel ? sel({ isAuthenticated: false }) : { isAuthenticated: false }),
    __cart: cart,
  };
});
jest.mock('@services/feedback.service', () => ({
  __esModule: true,
  feedbackService: { getProductReviews: jest.fn(async () => ({ success: true, data: { reviews: [], summary: { count: 0, average: 0 } } })), reportReview: jest.fn() },
}));
jest.mock('@store/variableWeightNotice', () => {
  const notify = jest.fn();
  return { useVariableWeightNotice: (sel: any) => sel({ notify }), __notify: notify };
});

import { ProductDetailScreen } from '@screens/category/ProductDetailScreen';
const { productService } = require('@services/product.service');
const cart = require('@store').__cart;
const notify = require('@store/variableWeightNotice').__notify;

const product = (extra: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Tamatar',
  nameUrdu: 'ٹماٹر',
  price: 200,
  priceB: 150,
  unit: 'kg',
  stock: 20,
  stockQuantity: 20,
  stockQuantityB: 0,
  allowHalfKg: true,
  allowQuarterKg: true,
  categoryId: 'cat-1',
  images: [],
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.params.productId = '11111111-1111-4111-8111-111111111111';
  productService.getProductById.mockResolvedValue({ success: true, data: product() });
  productService.getProductBySlug.mockResolvedValue({ success: true, data: product() });
  productService.getProductsByCategory.mockResolvedValue({ success: true, data: [] });
});

describe('ProductDetailScreen', () => {
  it('adds one full kilo of quality A by default', async () => {
    const s = render(<ProductDetailScreen />);
    fireEvent.press(await s.findByText('Add to Cart'));
    await waitFor(() => expect(cart.addItem).toHaveBeenCalledWith(expect.objectContaining({ id: product().id }), 1, 'full', 'A'));
  });

  it('a quality with no stock of its own shows "Out of Stock" and cannot be added', async () => {
    const s = render(<ProductDetailScreen />);
    fireEvent.press(await s.findByText('Quality B'));
    expect(await s.findByText('Out of Stock')).toBeTruthy();
    expect(s.queryByText('Add to Cart')).toBeNull();
    expect(cart.addItem).not.toHaveBeenCalled();
  });

  it('a link by name (slug) loads the product by slug', async () => {
    mockRoute.params.productId = 'tamatar';
    const s = render(<ProductDetailScreen />);
    await s.findByText('Add to Cart');
    expect(productService.getProductBySlug).toHaveBeenCalledWith('tamatar');
    expect(productService.getProductById).not.toHaveBeenCalled();
  });

  it('a variable-weight product tells the customer the final weight may differ', async () => {
    productService.getProductById.mockResolvedValue({
      success: true,
      data: product({ isVariableWeight: true, variableWeightNote: 'Weighed at packing' }),
    });
    const s = render(<ProductDetailScreen />);
    fireEvent.press(await s.findByText('Add to Cart'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(product().id, 'Weighed at packing'));
  });

  it('a missing product says so', async () => {
    productService.getProductById.mockResolvedValue({ success: false });
    const s = render(<ProductDetailScreen />);
    expect(await s.findByText('Product not found')).toBeTruthy();
  });
});
