import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { couponService } from '@/services/coupon.service';

describe('couponService', () => {
  beforeEach(() => resetApiMocks());

  it('list fetches all coupons and defaults to [] on empty data', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: [{ id: 'c1', code: 'SAVE10' }] });
    expect(await couponService.list()).toEqual([{ id: 'c1', code: 'SAVE10' }]);
    expect(mockApi.get).toHaveBeenCalledWith('/admin/coupons');

    mockApi.get.mockResolvedValue({ success: true });
    expect(await couponService.list()).toEqual([]);
  });

  it('create POSTs the coupon input', async () => {
    const input = { code: 'NEW5', discountType: 'fixed' as const, discountValue: 5 };
    mockApi.post.mockResolvedValue({ success: true, data: { id: 'c2', ...input } });

    const created = await couponService.create(input);

    expect(mockApi.post).toHaveBeenCalledWith('/admin/coupons', input);
    expect(created.id).toBe('c2');
  });

  it('update PUTs to the coupon id', async () => {
    const input = { code: 'NEW5', discountType: 'fixed' as const, discountValue: 8 };
    mockApi.put.mockResolvedValue({ success: true, data: { id: 'c2', ...input } });

    await couponService.update('c2', input);

    expect(mockApi.put).toHaveBeenCalledWith('/admin/coupons/c2', input);
  });

  it('toggle PATCHes the toggle endpoint', async () => {
    mockApi.patch.mockResolvedValue({ success: true, data: { id: 'c2', isActive: false } });

    const toggled = await couponService.toggle('c2');

    expect(mockApi.patch).toHaveBeenCalledWith('/admin/coupons/c2/toggle');
    expect(toggled.isActive).toBe(false);
  });

  it('remove DELETEs the coupon', async () => {
    mockApi.delete.mockResolvedValue({ success: true });

    await couponService.remove('c2');

    expect(mockApi.delete).toHaveBeenCalledWith('/admin/coupons/c2');
  });

  it('listRedemptions builds only the provided filters and normalizes totals', async () => {
    mockApi.get.mockResolvedValue({
      success: true,
      data: { redemptions: [{ id: 'r1' }], totalDiscount: '150.5', count: '1' },
    });

    const result = await couponService.listRedemptions({ dateFrom: '2026-07-01' });

    expect(mockApi.get).toHaveBeenCalledWith('/admin/coupons/redemptions', { dateFrom: '2026-07-01' });
    expect(result).toEqual({ redemptions: [{ id: 'r1' }], totalDiscount: 150.5, count: 1 });
  });

  it('listRedemptions returns safe defaults when the payload is empty', async () => {
    mockApi.get.mockResolvedValue({ success: true });

    expect(await couponService.listRedemptions()).toEqual({
      redemptions: [],
      totalDiscount: 0,
      count: 0,
    });
  });
});
