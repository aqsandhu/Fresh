// W15 (round 10): the checkout screen — the screen that turns a cart into an
// order — had no tests. These drive it the way a customer does and check
// what reaches the server.
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn(), getParent: jest.fn(() => ({ navigate: jest.fn() })) };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const ReactLib = jest.requireActual('react');
  return {
    ...actual,
    useNavigation: () => mockNav,
    useFocusEffect: (cb: () => void) => ReactLib.useEffect(() => cb(), []),
    useIsFocused: () => true,
  };
});

const mockToast = { show: jest.fn() };
jest.mock('react-native-toast-message', () => ({ __esModule: true, get default() { return mockToast; } }));

const mockApi = { post: jest.fn(), get: jest.fn() };
jest.mock('@services/api', () => ({ __esModule: true, get default() { return mockApi; } }));

const mockAddressService = { getAddresses: jest.fn() };
jest.mock('@services/address.service', () => ({ get addressService() { return mockAddressService; } }));

const mockOrderService = { getDeliverySettings: jest.fn(), getDeliverySlots: jest.fn() };
jest.mock('@services/order.service', () => ({ get orderService() { return mockOrderService; } }));

jest.mock('@services/cart.service', () => ({
  cartService: {
    applyCoupon: jest.fn(async () => ({ success: false, message: 'n/a' })),
    removeCoupon: jest.fn(async () => undefined),
    getMyCoupons: jest.fn(async () => ({ coupons: [] })),
  },
}));

jest.mock('@/lib/cityStorage', () => ({
  getSelectedCityId: jest.fn(async () => 'city-gujrat'),
  addressMatchesSelectedCity: () => true,
}));
jest.mock('@/context/CityContext', () => ({ useOptionalCityName: () => 'Gujrat' }));
jest.mock('@/lib/timeSlots', () => ({ getSlotAvailability: () => ({ unavailable: false }) }));
jest.mock('@components/common/GuidanceTips', () => ({ GuidanceTips: () => null }));
jest.mock('@components/checkout/CheckoutAuthPanel', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { CheckoutAuthPanel: () => <T>SIGN IN PANEL</T> };
});

const mockClearCart = jest.fn(async () => undefined);
const mockCart: any = {
  items: [{ product: { id: 'p-aloo', name: 'Aloo', price: 100, unit: 'kg' }, quantity: 2, unit: 'full', quality: 'A' }],
  subtotal: () => 200,
  getDeliveryCharge: () => 50,
  loadDeliverySettings: jest.fn(),
  clearCart: mockClearCart,
  hasHydrated: true,
  deliverySlotCutoffPercent: 50,
  syncWithBackend: jest.fn(),
};
const mockAuth = { isAuthenticated: true };
jest.mock('@store', () => ({
  useCartStore: () => mockCart,
  useAuthStore: () => mockAuth,
}));

import { CheckoutScreen } from '@screens/checkout/CheckoutScreen';

const slot = (id: string, extra: Record<string, unknown> = {}) => ({
  id, startTime: '10:00', endTime: '12:00', slot_name: 'Morning', available_slots: 5, isFreeDelivery: false, ...extra,
});

const ordersPosted = () => mockApi.post.mock.calls.filter(([url]) => url === '/orders');

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.isAuthenticated = true;
  mockOrderService.getDeliverySettings.mockResolvedValue({ data: { urgent_charge: 0 } });
  mockOrderService.getDeliverySlots.mockResolvedValue({ success: true, data: [slot('slot-1')] });
  mockAddressService.getAddresses.mockResolvedValue({
    success: true,
    data: [{ id: 'addr-1', city: 'Gujrat', writtenAddress: 'House 5, Model Town', isDefault: true, addressType: 'home' }],
  });
  mockApi.post.mockImplementation(async (url: string) => {
    if (url === '/orders') return { data: { data: { order: { id: 'ord-1', order_number: 'ORD-77', total_amount: '250' } } } };
    if (url === '/cart/delivery-charge') return { data: { data: { delivery_charge: 50 } } };
    return { data: { data: { cart: { subtotal: 200 } } } };
  });
});

async function renderReady() {
  const screen = render(<CheckoutScreen />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await waitFor(() => expect(mockAddressService.getAddresses).toHaveBeenCalled());
  return screen;
}

describe('CheckoutScreen', () => {
  it('a guest stays on checkout and sees the sign-in panel (no bounce to a login screen)', async () => {
    mockAuth.isAuthenticated = false;
    const screen = render(<CheckoutScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('SIGN IN PANEL')).toBeTruthy();
    expect(mockAddressService.getAddresses).not.toHaveBeenCalled();
  });

  it('places the order with the default address, the first open slot and the selected city', async () => {
    const screen = await renderReady();
    fireEvent.press(await screen.findByText('Place Order'));
    await waitFor(() => expect(ordersPosted()).toHaveLength(1));
    const body = ordersPosted()[0][1];
    expect(body).toMatchObject({
      address_id: 'addr-1',
      time_slot_id: 'slot-1',
      city_id: 'city-gujrat',
      payment_method: 'cash_on_delivery',
    });
    expect(body.requested_delivery_date).toBeUndefined(); // today = no date sent
    // The cart is pushed to the server right before the order (atomic sync).
    const syncIdx = mockApi.post.mock.calls.findIndex(([u]) => u === '/cart/sync');
    expect(syncIdx).toBeGreaterThanOrEqual(0);
    expect(await screen.findByText('Order placed successfully!')).toBeTruthy();
    expect(screen.getByText('ORD-77')).toBeTruthy();
    expect(mockClearCart).toHaveBeenCalled();
  });

  it('"Tomorrow" sends tomorrow\'s date with the slot', async () => {
    const screen = await renderReady();
    fireEvent.press(screen.getByText('Tomorrow'));
    await waitFor(() => expect(mockOrderService.getDeliverySlots).toHaveBeenCalledTimes(2));
    fireEvent.press(await screen.findByText('Place Order'));
    await waitFor(() => expect(ordersPosted()).toHaveLength(1));
    expect(ordersPosted()[0][1].requested_delivery_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('no open slot → a clear message and nothing is sent', async () => {
    mockOrderService.getDeliverySlots.mockResolvedValue({ success: true, data: [] });
    const screen = await renderReady();
    fireEvent.press(await screen.findByText('Place Order'));
    expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Please select a delivery time slot' }));
    expect(ordersPosted()).toHaveLength(0);
  });

  it('a full slot is not sent as the order\'s slot', async () => {
    mockOrderService.getDeliverySlots.mockResolvedValue({ success: true, data: [slot('slot-full', { available_slots: 0 })] });
    const screen = await renderReady();
    fireEvent.press(await screen.findByText('Place Order'));
    expect(ordersPosted()).toHaveLength(0);
    expect(mockToast.show).toHaveBeenCalled();
  });

  it('a full slot is never pre-selected — the first open one is (I9)', async () => {
    mockOrderService.getDeliverySlots.mockResolvedValue({
      success: true,
      data: [slot('slot-full', { available_slots: 0 }), slot('slot-open', { startTime: '14:00', endTime: '16:00' })],
    });
    const screen = await renderReady();
    fireEvent.press(await screen.findByText('Place Order'));
    await waitFor(() => expect(ordersPosted()).toHaveLength(1));
    expect(ordersPosted()[0][1].time_slot_id).toBe('slot-open');
  });

  it('an address saved offline (local_ id) is refused before any order is sent', async () => {
    mockAddressService.getAddresses.mockResolvedValue({
      success: true,
      data: [{ id: 'local_123', city: 'Gujrat', writtenAddress: 'Offline house', isDefault: true, addressType: 'home' }],
    });
    const screen = await renderReady();
    fireEvent.press(await screen.findByText('Place Order'));
    await waitFor(() => expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: expect.stringMatching(/saved offline/) })));
    expect(ordersPosted()).toHaveLength(0);
  });

  it('a refused order shows the server\'s own reason and keeps the cart', async () => {
    mockApi.post.mockImplementation(async (url: string) => {
      if (url === '/orders') throw { response: { data: { message: 'Slot just filled up' } } };
      return { data: { data: { cart: { subtotal: 200 } } } };
    });
    const screen = await renderReady();
    fireEvent.press(await screen.findByText('Place Order'));
    await waitFor(() => expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Slot just filled up' })));
    expect(mockClearCart).not.toHaveBeenCalled();
  });

  it('urgent delivery sends no slot and the urgent flag', async () => {
    mockOrderService.getDeliverySettings.mockResolvedValue({ data: { urgent_charge: 150, urgent_eta: '45 min' } });
    const screen = await renderReady();
    fireEvent.press(await screen.findByText('Urgent delivery'));
    fireEvent.press(screen.getByText('Place Order'));
    await waitFor(() => expect(ordersPosted()).toHaveLength(1));
    const body = ordersPosted()[0][1];
    expect(body.urgent_delivery).toBe('true');
    expect(body.time_slot_id).toBeUndefined();
  });

  it('an empty cart sends the customer back instead of showing checkout', async () => {
    const saved = mockCart.items;
    mockCart.items = [];
    try {
      render(<CheckoutScreen />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockNav.goBack).toHaveBeenCalled();
    } finally {
      mockCart.items = saved;
    }
  });
});

// Keep the Text import used (react-native mock components above).
void Text;
