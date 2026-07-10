import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { settingsService } from '@/services/settings.service';

describe('settingsService', () => {
  beforeEach(() => resetApiMocks());

  it('getSettings unwraps the settings payload', async () => {
    const settings = { baseCharge: 50, freeDeliveryThreshold: 500 };
    mockApi.get.mockResolvedValue({ success: true, data: settings });

    expect(await settingsService.getSettings()).toEqual(settings);
    expect(mockApi.get).toHaveBeenCalledWith('/admin/settings');
  });

  it('getSettings maps backend failures to a friendly error', async () => {
    mockApi.get.mockRejectedValue({ response: { data: { message: 'forbidden' } } });
    await expect(settingsService.getSettings()).rejects.toThrow('forbidden');

    mockApi.get.mockRejectedValue(new Error('boom'));
    await expect(settingsService.getSettings()).rejects.toThrow('Failed to fetch settings');
  });

  it('updateDeliverySettings PUTs to /admin/settings/delivery', async () => {
    const delivery = { baseCharge: 60, freeDeliveryThreshold: 800 };
    mockApi.put.mockResolvedValue({ success: true, data: delivery });

    expect(await settingsService.updateDeliverySettings(delivery as never)).toEqual(delivery);
    expect(mockApi.put).toHaveBeenCalledWith('/admin/settings/delivery', delivery);
  });

  it('time slot CRUD hits the expected endpoints', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: [{ id: 't1' }] });
    expect(await settingsService.getTimeSlots()).toEqual([{ id: 't1' }]);
    expect(mockApi.get).toHaveBeenCalledWith('/admin/settings/time-slots');

    const slot = { startTime: '09:00', endTime: '12:00', maxOrders: 20, isActive: true };
    mockApi.post.mockResolvedValue({ success: true, data: { id: 't2', ...slot } });
    await settingsService.createTimeSlot(slot as never);
    expect(mockApi.post).toHaveBeenCalledWith('/admin/settings/time-slots', slot);

    mockApi.put.mockResolvedValue({ success: true, data: { id: 't2', maxOrders: 25 } });
    await settingsService.updateTimeSlot('t2', { maxOrders: 25 } as never);
    expect(mockApi.put).toHaveBeenCalledWith('/admin/settings/time-slots/t2', { maxOrders: 25 });

    mockApi.delete.mockResolvedValue({ success: true });
    await settingsService.deleteTimeSlot('t2');
    expect(mockApi.delete).toHaveBeenCalledWith('/admin/settings/time-slots/t2');
  });

  it('deleteTimeSlot maps failures to a friendly error', async () => {
    mockApi.delete.mockRejectedValue({ response: { data: { message: 'slot has bookings' } } });

    await expect(settingsService.deleteTimeSlot('t1')).rejects.toThrow('slot has bookings');
  });
});
