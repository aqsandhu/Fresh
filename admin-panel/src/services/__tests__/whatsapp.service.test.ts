// W16 (round 10): the WhatsApp order service. B35: a discounted order that
// waits for the city admin (HTTP 202 → QueuedForApproval) was re-thrown as a
// plain "Failed to create WhatsApp order" — the page then showed a red error
// next to the green "sent for approval" toast and kept the form, so a second
// press queued a second request.
import { mockApi, resetApiMocks } from './testApiMock';
import { QueuedForApproval, isQueued } from '@/lib/approvalQueue';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { whatsappService } from '@/services/whatsapp.service';

beforeEach(() => {
  resetApiMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('whatsappService', () => {
  it('lookup returns the customer and saved addresses (none → null / [])', async () => {
    mockApi.get.mockResolvedValueOnce({ success: true, data: { customer: { id: 'u1', fullName: 'Ali' }, addresses: [{ id: 'a1' }] } });
    await expect(whatsappService.lookupCustomer('03001234567')).resolves.toEqual({ customer: { id: 'u1', fullName: 'Ali' }, addresses: [{ id: 'a1' }] });
    expect(mockApi.get).toHaveBeenCalledWith('/admin/customers/lookup', { phone: '03001234567' });
    mockApi.get.mockResolvedValueOnce({ success: true, data: {} });
    await expect(whatsappService.lookupCustomer('03000000000')).resolves.toEqual({ customer: null, addresses: [] });
  });

  it('creates the order and returns the server answer', async () => {
    mockApi.post.mockResolvedValueOnce({ success: true, data: { id: 'o1' } });
    await expect(whatsappService.createOrder({ whatsappNumber: '0300', items: [] } as any)).resolves.toEqual({ id: 'o1' });
    expect(mockApi.post).toHaveBeenCalledWith('/admin/whatsapp-orders', { whatsappNumber: '0300', items: [] });
  });

  it('a refusal keeps the server reason', async () => {
    mockApi.post.mockRejectedValueOnce({ response: { data: { message: 'Not enough stock for Aloo' } } });
    await expect(whatsappService.createOrder({} as any)).rejects.toThrow('Not enough stock for Aloo');
  });

  it('an order waiting for approval stays "queued" (not turned into a failure)', async () => {
    mockApi.post.mockRejectedValueOnce(new QueuedForApproval('Sent to the city admin for approval.', 'req-1'));
    const err = await whatsappService.createOrder({} as any).catch((e: unknown) => e);
    expect(isQueued(err)).toBe(true);
  });
});
