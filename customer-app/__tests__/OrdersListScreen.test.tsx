// W15 (round 10): "My Orders" — tabs, the right button per status, cancel
// with confirmation, reorder; refunded orders count as finished (I12).
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCityId: 'city-1' }) }));
jest.mock('@components/layout/MobileHeader', () => ({ MobileHeader: () => null, default: () => null }));
jest.mock('@components/common/GuidanceTips', () => ({ GuidanceTips: () => null }));
jest.mock('@services/order.service', () => ({
  __esModule: true,
  orderService: { getOrders: jest.fn(), cancelOrder: jest.fn() },
}));
jest.mock('@services/product.service', () => ({ __esModule: true, productService: { getProductById: jest.fn() } }));
jest.mock('@/lib/reorder', () => ({ reorderItems: jest.fn() }));
jest.mock('@store', () => {
  const state = { isAuthenticated: true };
  return {
    __esModule: true,
    __auth: state,
    useAuthStore: () => state,
    useCartStore: () => ({ addItem: jest.fn() }),
  };
});

import { OrdersListScreen } from '@screens/orders/OrdersListScreen';
const { orderService } = require('@services/order.service');
const { reorderItems } = require('@/lib/reorder');
const auth = require('@store').__auth;
const Toast = require('react-native-toast-message').default;

const order = (id: string, status: string) => ({
  id,
  orderNumber: `ORD-${id}`,
  status,
  total: 500,
  createdAt: '2026-11-17T10:00:00Z',
  items: [{ productId: 'p1', productName: 'Aloo', quantity: 2, unit: 'full', quality: 'A', price: 250 }],
});

beforeEach(() => {
  jest.clearAllMocks();
  auth.isAuthenticated = true;
  orderService.getOrders.mockResolvedValue({
    success: true,
    data: { data: [order('1', 'pending'), order('2', 'out_for_delivery'), order('3', 'delivered'), order('4', 'refunded')] },
  });
  orderService.cancelOrder.mockResolvedValue({ success: true });
  (reorderItems as jest.Mock).mockResolvedValue(1);
});

describe('OrdersListScreen', () => {
  it('a guest is sent to log in and comes back to Orders', async () => {
    auth.isAuthenticated = false;
    render(<OrdersListScreen />);
    await waitFor(() =>
      expect(mockNav.navigate).toHaveBeenCalledWith('Auth', { screen: 'Login', params: { redirect: 'Orders' } })
    );
  });

  it('shows the right action for each status', async () => {
    const s = render(<OrdersListScreen />);
    await s.findByText('Order #ORD-1');
    expect(s.getAllByText('Cancel Order')).toHaveLength(1); // only the pending one
    expect(s.getAllByText('Track Order')).toHaveLength(1); // out for delivery
    expect(s.getAllByText('Reorder')).toHaveLength(1); // delivered
  });

  it('a refunded order is "Completed", not "Active" (I12)', async () => {
    const s = render(<OrdersListScreen />);
    await s.findByText('Order #ORD-4');
    fireEvent.press(s.getByText('Active'));
    await waitFor(() => expect(s.queryByText('Order #ORD-4')).toBeNull());
    expect(s.getByText('Order #ORD-1')).toBeTruthy();
    fireEvent.press(s.getByText('Completed'));
    expect(await s.findByText('Order #ORD-4')).toBeTruthy();
    expect(s.queryByText('Order #ORD-1')).toBeNull();
  });

  it('cancel asks first, then cancels and reloads', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: any[]) => {
      buttons?.find((b) => b.style === 'destructive' || /yes|cancel order/i.test(b.text))?.onPress?.();
    });
    const s = render(<OrdersListScreen />);
    fireEvent.press(await s.findByText('Cancel Order'));
    await waitFor(() => expect(orderService.cancelOrder).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Order cancelled successfully' })));
  });

  it('reorder puts the items back in the cart', async () => {
    const s = render(<OrdersListScreen />);
    fireEvent.press(await s.findByText('Reorder'));
    await waitFor(() => expect(reorderItems).toHaveBeenCalled());
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: '1 item added to cart!' }));
  });
});
