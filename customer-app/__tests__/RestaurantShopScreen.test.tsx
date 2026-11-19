// W15 (round 10): the restaurant (B2B) shop — session check, catalogue, the
// cart line carries the restaurant price, out-of-stock tiers can't be added.
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@screens/restaurant/RestaurantTabBar', () => ({ RestaurantTabBar: () => null }));
jest.mock('@services/restaurant.service', () => {
  const actual = jest.requireActual('@services/restaurant.service');
  return {
    __esModule: true,
    ...actual,
    getRestaurantInfo: jest.fn(),
    clearRestaurantSession: jest.fn(async () => undefined),
    restaurantApi: { getCategories: jest.fn(), getProducts: jest.fn(), getDelivery: jest.fn() },
  };
});
jest.mock('@store/restaurantCartStore', () => {
  const state = { add: jest.fn(), setDelivery: jest.fn(), totalItems: () => 0, total: () => 0 };
  return { useRestaurantCart: (sel: any) => sel(state), __state: state };
});

import { RestaurantShopScreen } from '@screens/restaurant/RestaurantShopScreen';
const svc = require('@services/restaurant.service');
const cart = require('@store/restaurantCartStore').__state;

const onion = {
  id: 'p-onion', name_en: 'Onion', name_ur: 'پیاز', price: 160, price_b: null, price_c: null,
  restaurant_price_a: 140, restaurant_enabled_a: true, stock_quantity: 50, unit_type: 'kg', allow_half_kg: false, allow_quarter_kg: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  svc.getRestaurantInfo.mockResolvedValue({ id: 'r1', business_name: 'Dhaba One' });
  svc.restaurantApi.getCategories.mockResolvedValue([{ id: 'veg', name_en: 'Vegetables' }]);
  svc.restaurantApi.getProducts.mockResolvedValue([onion]);
  svc.restaurantApi.getDelivery.mockResolvedValue({ base_charge: 100, free_delivery_threshold: 2000 });
});

describe('RestaurantShopScreen', () => {
  it('without a restaurant session it goes to the restaurant login', async () => {
    svc.getRestaurantInfo.mockResolvedValue(null);
    render(<RestaurantShopScreen />);
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('RestaurantLogin'));
  });

  it('adds a line at the RESTAURANT price (Rs 140, not the shop price Rs 160)', async () => {
    const s = render(<RestaurantShopScreen />);
    fireEvent.press(await s.findByText('Add to cart'));
    expect(cart.add).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p-onion', quality: 'A', unit: 'full', qty: 1, unitPrice: 140 }));
    expect(cart.setDelivery).toHaveBeenCalledWith(100, 2000);
  });

  it('a delivery charge of 0 (free delivery) reaches the cart as 0, not Rs 100 (I22)', async () => {
    svc.restaurantApi.getDelivery.mockResolvedValue({ base_charge: 0, free_delivery_threshold: '0' });
    const s = render(<RestaurantShopScreen />);
    await s.findByText('Add to cart');
    expect(cart.setDelivery).toHaveBeenCalledWith(0, 0);
  });

  it('an out-of-stock product cannot be added', async () => {
    svc.restaurantApi.getProducts.mockResolvedValue([{ ...onion, stock_quantity: 0 }]);
    const s = render(<RestaurantShopScreen />);
    const outs = await s.findAllByText('Out of stock'); // badge + disabled button
    outs.forEach((o) => fireEvent.press(o));
    expect(cart.add).not.toHaveBeenCalled();
  });

  it('an expired session while loading goes back to login', async () => {
    svc.restaurantApi.getProducts.mockRejectedValue({ status: 401, message: 'Session expired' });
    render(<RestaurantShopScreen />);
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('RestaurantLogin'));
  });
});
