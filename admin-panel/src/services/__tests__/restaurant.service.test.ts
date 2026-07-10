import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { restaurantService } from '@/services/restaurant.service';

describe('restaurantService', () => {
  beforeEach(() => resetApiMocks());

  it('list passes the status filter and normalizes the shape', async () => {
    mockApi.get.mockResolvedValue({
      success: true,
      data: { restaurants: [{ id: 'rest1' }], counts: { pending: 2 } },
    });

    const result = await restaurantService.list('pending');

    expect(mockApi.get).toHaveBeenCalledWith('/admin/restaurants', { status: 'pending' });
    expect(result).toEqual({ restaurants: [{ id: 'rest1' }], counts: { pending: 2 } });
  });

  it('list returns safe defaults on an empty payload', async () => {
    mockApi.get.mockResolvedValue({ success: true });

    expect(await restaurantService.list()).toEqual({ restaurants: [], counts: {} });
    expect(mockApi.get).toHaveBeenCalledWith('/admin/restaurants', undefined);
  });

  it('lifecycle actions POST/DELETE to the expected endpoints', async () => {
    mockApi.post.mockResolvedValue({ success: true });
    mockApi.delete.mockResolvedValue({ success: true });

    await restaurantService.approve('rest1');
    expect(mockApi.post).toHaveBeenCalledWith('/admin/restaurants/rest1/approve');

    await restaurantService.disable('rest1');
    expect(mockApi.post).toHaveBeenCalledWith('/admin/restaurants/rest1/disable');

    await restaurantService.ban('rest1');
    expect(mockApi.post).toHaveBeenCalledWith('/admin/restaurants/rest1/ban');

    await restaurantService.remove('rest1');
    expect(mockApi.delete).toHaveBeenCalledWith('/admin/restaurants/rest1');
  });

  it('updateOrderStatus sends only the provided fields and maps riderId to rider_id', async () => {
    mockApi.put.mockResolvedValue({ success: true, data: { id: 'ro1', status: 'confirmed' } });

    await restaurantService.updateOrderStatus('ro1', { status: 'confirmed' });
    expect(mockApi.put).toHaveBeenCalledWith('/admin/restaurants/orders/ro1/status', { status: 'confirmed' });

    await restaurantService.updateOrderStatus('ro1', { riderId: 'r5' });
    expect(mockApi.put).toHaveBeenCalledWith('/admin/restaurants/orders/ro1/status', { rider_id: 'r5' });
  });

  it('getOrders defaults orders/counts when the payload is empty', async () => {
    mockApi.get.mockResolvedValue({ success: true });

    expect(await restaurantService.getOrders()).toEqual({ orders: [], counts: {} });
  });
});
