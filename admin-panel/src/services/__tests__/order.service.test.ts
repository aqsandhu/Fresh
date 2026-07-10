import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { orderService } from '@/services/order.service';

describe('orderService', () => {
  beforeEach(() => resetApiMocks());

  it('getOrders passes filters through to /admin/orders and unwraps data', async () => {
    const page = { orders: [{ id: 'o1' }], pagination: { total: 1 } };
    mockApi.get.mockResolvedValue({ success: true, data: page });

    const result = await orderService.getOrders({ page: 2, status: 'pending' });

    expect(mockApi.get).toHaveBeenCalledWith('/admin/orders', { page: 2, status: 'pending' });
    expect(result).toEqual(page);
  });

  it('getOrders surfaces the backend message on failure', async () => {
    mockApi.get.mockRejectedValue({ response: { data: { message: 'Not allowed' } } });

    await expect(orderService.getOrders()).rejects.toThrow('Not allowed');
  });

  it('getOrders falls back to a generic message when the error is opaque', async () => {
    mockApi.get.mockRejectedValue(new Error('network down'));

    await expect(orderService.getOrders()).rejects.toThrow('Failed to fetch orders');
  });

  it('getOrderById requests the specific order', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { id: 'o9' } });

    const order = await orderService.getOrderById('o9');

    expect(mockApi.get).toHaveBeenCalledWith('/admin/orders/o9');
    expect(order).toEqual({ id: 'o9' });
  });

  it('updateOrderStatus PUTs status + reason to the status endpoint', async () => {
    mockApi.put.mockResolvedValue({ success: true, data: { id: 'o1', status: 'cancelled' } });

    const order = await orderService.updateOrderStatus('o1', 'cancelled' as never, 'customer asked');

    expect(mockApi.put).toHaveBeenCalledWith('/admin/orders/o1/status', {
      status: 'cancelled',
      reason: 'customer asked',
    });
    expect(order).toEqual({ id: 'o1', status: 'cancelled' });
  });

  it('updateOrderStatus rejects with the backend message when the transition is refused', async () => {
    mockApi.put.mockRejectedValue({ response: { data: { message: 'Cannot cancel a delivered order' } } });

    await expect(orderService.updateOrderStatus('o1', 'cancelled' as never)).rejects.toThrow(
      'Cannot cancel a delivered order'
    );
  });

  it('assignRider PUTs the rider id to the assign endpoint', async () => {
    mockApi.put.mockResolvedValue({ success: true, data: { id: 'o1', riderId: 'r1' } });

    await orderService.assignRider('o1', 'r1');

    expect(mockApi.put).toHaveBeenCalledWith('/admin/orders/o1/assign-rider', { riderId: 'r1' });
  });

  it('throws on an empty API envelope instead of returning undefined', async () => {
    mockApi.get.mockResolvedValue({ success: true });

    await expect(orderService.getOrderById('o1')).rejects.toThrow();
  });
});
