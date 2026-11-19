// W15 (round 10): search and category lists — results, empty states, the
// search waits for typing to pause.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

const mockRoute: { params: Record<string, unknown> } = { params: {} };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() }),
  useRoute: () => mockRoute,
  useFocusEffect: () => undefined,
}));
jest.mock('@/context/CityContext', () => ({
  useCityContext: () => ({ selectedCityId: 'city-1' }),
  useOptionalCityName: () => 'Gujrat',
}));
jest.mock('@components/shop/ProductFiltersToolbar', () => ({
  ...jest.requireActual('@components/shop/ProductFiltersToolbar'),
  ProductFiltersToolbar: () => null,
  default: () => null,
}));
jest.mock('@components/layout/MobileHeader', () => ({ MobileHeader: () => null, default: () => null }));
jest.mock('@services/product.service', () => ({
  __esModule: true,
  productService: { searchProducts: jest.fn(), getProductsByCategory: jest.fn() },
}));
jest.mock('@store', () => ({
  __esModule: true,
  useCartStore: (sel?: any) => {
    const state = { items: [], addItem: jest.fn(), updateQuantity: jest.fn(), removeItem: jest.fn(), getItemQuantity: () => 0 };
    return sel ? sel(state) : state;
  },
  useWishlistStore: (sel?: any) => {
    const state = { toggle: jest.fn(), isWishlisted: () => false, items: [] };
    return sel ? sel(state) : state;
  },
  useAuthStore: (sel?: any) => {
    const state = { isAuthenticated: false };
    return sel ? sel(state) : state;
  },
}));

import { SearchScreen } from '@screens/home/SearchScreen';
import { CategoryProductsScreen } from '@screens/category/CategoryProductsScreen';
const { productService } = require('@services/product.service');

const product = (id: string, name: string) => ({
  id, name, nameUrdu: name, price: 120, unit: 'kg', stock: 10, stockQuantity: 10, images: [], categoryId: 'veg',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.params = {};
});

describe('SearchScreen', () => {
  it('searches once typing pauses and lists the results', async () => {
    jest.useFakeTimers();
    try {
      productService.searchProducts.mockResolvedValue({ success: true, data: [product('p1', 'Aloo Desi')] });
      const s = render(<SearchScreen />);
      fireEvent.changeText(s.getByPlaceholderText('Search products...'), 'al');
      fireEvent.changeText(s.getByPlaceholderText('Search products...'), 'aloo');
      expect(productService.searchProducts).not.toHaveBeenCalled(); // still typing
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(productService.searchProducts).toHaveBeenCalledTimes(1);
      expect(productService.searchProducts).toHaveBeenCalledWith('aloo');
      jest.useRealTimers();
      expect(await s.findAllByText('Aloo Desi')).not.toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a slow answer for an older search never replaces the newer one (I25)', async () => {
    jest.useFakeTimers();
    try {
      let releaseOld: (v: unknown) => void = () => undefined;
      productService.searchProducts
        .mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }))
        .mockResolvedValueOnce({ success: true, data: [product('p2', 'Tamatar Lal')] });
      const s = render(<SearchScreen />);
      fireEvent.changeText(s.getByPlaceholderText('Search products...'), 'tam');
      await act(async () => { jest.advanceTimersByTime(600); });
      fireEvent.changeText(s.getByPlaceholderText('Search products...'), 'tamatar');
      await act(async () => { jest.advanceTimersByTime(600); });
      expect(s.getAllByText('Tamatar Lal').length).toBeGreaterThan(0);
      await act(async () => { releaseOld({ success: true, data: [product('p1', 'Purana Natija')] }); });
      expect(s.queryByText('Purana Natija')).toBeNull();
      expect(s.getAllByText('Tamatar Lal').length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('nothing found says so', async () => {
    productService.searchProducts.mockResolvedValue({ success: true, data: [] });
    mockRoute.params = { query: 'zzzz' };
    const s = render(<SearchScreen />);
    expect(await s.findByText('No Results Found', {}, { timeout: 3000 })).toBeTruthy();
  });
});

describe('CategoryProductsScreen', () => {
  it('lists the category\'s products', async () => {
    mockRoute.params = { categoryId: 'veg', categoryName: 'Vegetables' };
    productService.getProductsByCategory.mockResolvedValue({ success: true, data: [product('p1', 'Tamatar'), product('p2', 'Pyaz')] });
    const s = render(<CategoryProductsScreen />);
    expect(await s.findAllByText('Tamatar')).not.toHaveLength(0);
    expect(s.getAllByText('Pyaz')).not.toHaveLength(0);
    expect(productService.getProductsByCategory).toHaveBeenCalledWith('veg', expect.any(Object));
  });

  it('an empty category says so', async () => {
    mockRoute.params = { categoryId: 'empty', categoryName: 'Empty' };
    productService.getProductsByCategory.mockResolvedValue({ success: true, data: [] });
    const s = render(<CategoryProductsScreen />);
    expect(await s.findByText('No products found')).toBeTruthy();
  });
});
