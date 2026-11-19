// W15 (round 10): the restaurant (B2B) checkout had no tests.
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { pktDateString } from '../src/lib/businessDate';

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
}));

const mockToast = { show: jest.fn() };
jest.mock('react-native-toast-message', () => ({ __esModule: true, get default() { return mockToast; } }));

const mockInfo = { value: { id: 'r1', business_name: 'Dhaba One', address: 'Main Bazar' } as any };
jest.mock('@services/restaurant.service', () => {
  const actual = jest.requireActual('@services/restaurant.service');
  return {
    __esModule: true,
    ...actual,
    getRestaurantInfo: jest.fn(),
    restaurantApi: {
      getDelivery: jest.fn(),
      getMe: jest.fn(),
      getTimeSlots: jest.fn(),
      placeOrder: jest.fn(),
      uploadFrontImage: jest.fn(),
    },
  };
});

const mockCart: any = {
  items: [{ key: 'k1', productId: 'p-onion', name: 'Onion', quality: 'A', unit: 'full', unitShort: 'kg', qty: 10, unitPrice: 150 }],
  subtotal: () => 1500,
  clear: jest.fn(),
};
jest.mock('@store/restaurantCartStore', () => ({ useRestaurantCart: () => mockCart }));
jest.mock('@components/checkout/CheckoutMapPicker', () => ({ CheckoutMapPicker: () => null }));
jest.mock('@/lib/geolocation', () => ({ getAccuratePosition: jest.fn() }));
jest.mock('@/lib/pickDoorPhoto', () => ({ pickDoorPhotoFromLibrary: jest.fn() }));

import { RestaurantCheckoutScreen } from '@screens/restaurant/RestaurantCheckoutScreen';
const svc = require('@services/restaurant.service');
const mockApi = svc.restaurantApi;

const slot = (id: string, extra: Record<string, unknown> = {}) => ({
  id, start_time: '10:00', end_time: '12:00', available_slots: 5, is_free_delivery_slot: false, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockInfo.value = { id: 'r1', business_name: 'Dhaba One', address: 'Main Bazar' };
  svc.getRestaurantInfo.mockImplementation(async () => mockInfo.value);
  mockApi.getDelivery.mockResolvedValue({ base_charge: 100, free_delivery_threshold: 2000, urgent_charge: 0, urgent_eta: '', slot_cutoff_percent: 60 });
  mockApi.getMe.mockResolvedValue({ address: 'Main Bazar', latitude: 32.57, longitude: 74.08 });
  mockApi.getTimeSlots.mockResolvedValue([slot('s-1')]);
  mockApi.placeOrder.mockResolvedValue({ id: 'ro-1' });
});

async function renderReady() {
  const screen = render(<RestaurantCheckoutScreen />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await waitFor(() => expect(mockApi.getTimeSlots).toHaveBeenCalled());
  return screen;
}

describe('RestaurantCheckoutScreen', () => {
  it('without a restaurant session it goes to the restaurant login', async () => {
    mockInfo.value = null;
    render(<RestaurantCheckoutScreen />);
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('RestaurantLogin'));
  });

  it('no slot chosen → message, nothing ordered', async () => {
    const screen = await renderReady();
    fireEvent.press(screen.getByText('Place Order'));
    expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Please select a delivery time slot' }));
    expect(mockApi.placeOrder).not.toHaveBeenCalled();
  });

  it('tomorrow\'s slot: sends lines, the Pakistan date, the pinned spot; clears the cart and opens the orders', async () => {
    const screen = await renderReady();
    fireEvent.press(screen.getByText('Tomorrow'));
    await waitFor(() => expect(mockApi.getTimeSlots).toHaveBeenLastCalledWith(pktDateString('tomorrow')));
    fireEvent.press(await screen.findByText('10:00 AM–12:00 PM'));
    fireEvent.press(screen.getByText('Place Order'));
    await waitFor(() => expect(mockApi.placeOrder).toHaveBeenCalledTimes(1));
    const [lines, opts] = mockApi.placeOrder.mock.calls[0];
    expect(lines).toEqual([{ product_id: 'p-onion', quantity: 10, unit: 'full', quality: 'A' }]);
    expect(opts).toMatchObject({
      time_slot_id: 's-1',
      requested_delivery_date: pktDateString('tomorrow'),
      urgent_delivery: false,
      address: 'Main Bazar',
      latitude: 32.57,
      longitude: 74.08,
    });
    expect(mockCart.clear).toHaveBeenCalled();
    expect(mockNav.navigate).toHaveBeenCalledWith('RestaurantOrders');
  });

  it('delivery: Rs 100 under the free threshold, FREE on a free slot', async () => {
    mockApi.getTimeSlots.mockResolvedValue([slot('s-1'), slot('s-free', { start_time: '14:00', end_time: '16:00', is_free_delivery_slot: true })]);
    const screen = await renderReady();
    fireEvent.press(screen.getByText('Tomorrow'));
    fireEvent.press(await screen.findByText('10:00 AM–12:00 PM'));
    expect(screen.getByText('Rs. 100')).toBeTruthy();
    expect(screen.getByText('Rs. 1,600')).toBeTruthy(); // 1,500 + 100
    fireEvent.press(screen.getByText('2:00 PM–4:00 PM'));
    expect(screen.getByText('FREE')).toBeTruthy();
  });

  it('a full slot cannot be chosen', async () => {
    mockApi.getTimeSlots.mockResolvedValue([slot('s-full', { available_slots: 0 })]);
    const screen = await renderReady();
    fireEvent.press(screen.getByText('Tomorrow'));
    fireEvent.press(await screen.findByText('10:00 AM–12:00 PM'));
    fireEvent.press(screen.getByText('Place Order'));
    expect(mockApi.placeOrder).not.toHaveBeenCalled();
  });

  it('urgent delivery: no slot, the urgent charge, urgent flag sent', async () => {
    mockApi.getDelivery.mockResolvedValue({ base_charge: 100, free_delivery_threshold: 2000, urgent_charge: 250, urgent_eta: '45 min', slot_cutoff_percent: 60 });
    const screen = await renderReady();
    fireEvent.press(await screen.findByText('Urgent delivery (45 min)'));
    fireEvent.press(screen.getByText('Place Order'));
    await waitFor(() => expect(mockApi.placeOrder).toHaveBeenCalledTimes(1));
    expect(mockApi.placeOrder.mock.calls[0][1]).toMatchObject({ urgent_delivery: true, time_slot_id: null });
  });

  it('a refused order keeps the cart and shows why', async () => {
    mockApi.placeOrder.mockRejectedValue(new Error('Restaurant account is under review'));
    const screen = await renderReady();
    fireEvent.press(screen.getByText('Tomorrow'));
    fireEvent.press(await screen.findByText('10:00 AM–12:00 PM'));
    fireEvent.press(screen.getByText('Place Order'));
    await waitFor(() => expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Restaurant account is under review' })));
    expect(mockCart.clear).not.toHaveBeenCalled();
  });
});
