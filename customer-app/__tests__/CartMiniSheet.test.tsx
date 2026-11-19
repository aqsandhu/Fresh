// W15 (round 10): the mini cart's +/− buttons act on the right line — a cart
// line is product + unit + QUALITY (I14: the quality was dropped, so the
// buttons changed or removed the quality-A line).
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn() }),
  useNavigationState: () => 'HomeMain',
}));
jest.mock('@store', () => {
  const aloo = { id: 'p-aloo', name: 'Aloo', price: 100, priceB: 80, unit: 'kg' };
  const cart = {
    items: [
      { product: aloo, quantity: 2, unit: 'full', quality: 'A' },
      { product: aloo, quantity: 1, unit: 'full', quality: 'B' },
    ],
    getTotalItems: () => 3,
    updateQuantity: jest.fn(),
    removeFromCart: jest.fn(),
    getSubtotal: () => 280,
    getDeliveryCharge: () => 50,
    getFinalTotal: () => 330,
    deliveryFreeThreshold: 500,
    loadDeliverySettings: jest.fn(),
    hasHydrated: true,
  };
  const ui = { isCartDropdownOpen: true, setCartDropdownOpen: jest.fn(), mobileHeaderBottomY: 0 };
  return { __esModule: true, useCartStore: () => cart, useCartUiStore: () => ui, __cart: cart };
});

import { CartMiniSheet } from '@components/cart/CartMiniSheet';
const cart = require('@store').__cart;

beforeEach(() => jest.clearAllMocks());

describe('CartMiniSheet', () => {
  it('"+" on the quality-B line changes the quality-B line', () => {
    const s = render(<CartMiniSheet />);
    const plus = s.getAllByLabelText('Increase quantity');
    fireEvent.press(plus[1]); // second line = quality B
    expect(cart.updateQuantity).toHaveBeenCalledWith('p-aloo', 2, 'full', 'B');
  });

  it('removing the last unit of the quality-B line removes THAT line', () => {
    const s = render(<CartMiniSheet />);
    fireEvent.press(s.getByLabelText('Remove item')); // only the B line has quantity 1
    expect(cart.removeFromCart).toHaveBeenCalledWith('p-aloo', 'full', 'B');
  });

  it('"−" on the quality-A line lowers the quality-A line', () => {
    const s = render(<CartMiniSheet />);
    fireEvent.press(s.getByLabelText('Decrease quantity'));
    expect(cart.updateQuantity).toHaveBeenCalledWith('p-aloo', 1, 'full', 'A');
  });
});
