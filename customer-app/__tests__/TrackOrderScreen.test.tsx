// W15 (round 10): live order tracking — events for THIS order act, events for
// someone else's order are ignored, and leaving the screen removes listeners.
import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { orderId: 'ord-1' } }),
}));
jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  const Map = ({ children }: any) => <View>{children}</View>;
  return { __esModule: true, default: Map, Marker: () => null, Polyline: () => null, PROVIDER_GOOGLE: 'google' };
});
jest.mock('@components/OrderChat', () => ({ __esModule: true, default: () => null }));
jest.mock('@components/common/GuidanceTips', () => ({ GuidanceTips: () => null }));
jest.mock('@services/order.service', () => ({ __esModule: true, orderService: { trackOrder: jest.fn() } }));
jest.mock('@services/socket.service', () => {
  const handlers: Record<string, ((d: any) => void)[]> = {};
  return {
    __esModule: true,
    socketService: {
      __handlers: handlers,
      connect: jest.fn(async () => undefined),
      isConnected: jest.fn(() => true),
      subscribeToOrder: jest.fn(),
      unsubscribeFromOrder: jest.fn(),
      on: jest.fn((e: string, cb: (d: any) => void) => { (handlers[e] ||= []).push(cb); }),
      off: jest.fn((e: string, cb: (d: any) => void) => { handlers[e] = (handlers[e] || []).filter((h) => h !== cb); }),
    },
  };
});

import { TrackOrderScreen } from '@screens/orders/TrackOrderScreen';
const { orderService } = require('@services/order.service');
const { socketService } = require('@services/socket.service');

const emit = (event: string, data: any) =>
  act(async () => {
    (socketService.__handlers[event] || []).forEach((h: (d: any) => void) => h(data));
  });

const tracking = {
  order: { id: 'ord-1', order_number: 'ORD-55', status: 'out_for_delivery', delivery_location: { latitude: 32.57, longitude: 74.08 } },
  rider: { id: 'rider-1', name: 'Asif', phone: '03001112233', location: { latitude: 32.5, longitude: 74.0 } },
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(socketService.__handlers).forEach((k) => delete socketService.__handlers[k]);
  orderService.trackOrder.mockResolvedValue({ success: true, data: tracking });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

async function renderReady() {
  const s = render(<TrackOrderScreen />);
  await waitFor(() => expect(s.getByText('Order Status')).toBeTruthy());
  await waitFor(() => expect(socketService.on).toHaveBeenCalledWith('order:rider_arrived', expect.any(Function)));
  return s;
}

describe('TrackOrderScreen', () => {
  it('a failed load shows the reason (with retry), not a blank screen', async () => {
    orderService.trackOrder.mockRejectedValue(new Error('Order not found'));
    const s = render(<TrackOrderScreen />);
    expect(await s.findByText('Order not found')).toBeTruthy();
  });

  it('"rider at your door" for THIS order shows the banner and an alert', async () => {
    const s = await renderReady();
    await emit('order:rider_arrived', { orderId: 'ord-1', arrivedAt: new Date().toISOString() });
    expect(Alert.alert).toHaveBeenCalledWith('Rider aa gaya hai', expect.any(String));
    expect(s.getByText('Rider aap ke darwaze par hai')).toBeTruthy();
  });

  it('events for someone else\'s order are ignored', async () => {
    const s = await renderReady();
    const loadsBefore = orderService.trackOrder.mock.calls.length;
    await emit('order:rider_arrived', { orderId: 'ord-OTHER' });
    await emit('order:delivered', { orderId: 'ord-OTHER' });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(orderService.trackOrder.mock.calls.length).toBe(loadsBefore);
    expect(s.queryByText('Rider aap ke darwaze par hai')).toBeNull();
  });

  it('"delivered" for this order reloads it and tells the customer', async () => {
    await renderReady();
    const loadsBefore = orderService.trackOrder.mock.calls.length;
    await emit('order:delivered', { orderId: 'ord-1', message: 'Enjoy!' });
    expect(Alert.alert).toHaveBeenCalledWith('Delivered!', 'Enjoy!');
    expect(orderService.trackOrder.mock.calls.length).toBe(loadsBefore + 1);
  });

  it('leaving the screen removes every live listener', async () => {
    const s = await renderReady();
    s.unmount();
    expect(socketService.unsubscribeFromOrder).toHaveBeenCalledWith('ord-1', expect.any(Function));
    for (const e of ['order:rider_assigned', 'order:status_changed', 'order:delivered', 'order:rider_arrived', 'rider:location']) {
      expect(socketService.__handlers[e] || []).toHaveLength(0);
    }
  });
});
