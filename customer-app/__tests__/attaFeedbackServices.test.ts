// Atta chakki requests and reviews / complaints: what is sent, how answers are
// shown (milling rate per kg from the totals), and errors reach the screen.
const mockApi = { get: jest.fn(), post: jest.fn(), put: jest.fn() };
jest.mock('@services/api', () => ({ __esModule: true, get default() { return mockApi; }, handleApiError: (e: Error) => e }));

import { attaService } from '@services/atta.service';
import { feedbackService } from '@services/feedback.service';
import { setCachedCityId } from '@/lib/apiHelpers';

beforeEach(() => {
  jest.resetAllMocks();
  setCachedCityId('city-1');
});

describe('atta chakki', () => {
  it('charges are numbers; a failure is shown', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: { service_charge: '50', milling_charge_per_kg: '6', delivery_charge: '100', free_delivery_threshold_kg: '40' } } });
    expect(await attaService.getCharges()).toEqual({ serviceCharge: 50, millingChargePerKg: 6, deliveryCharge: 100, freeDeliveryThresholdKg: 40 });
    mockApi.get.mockRejectedValueOnce(new Error('down'));
    await expect(attaService.getCharges()).rejects.toThrow('down');
  });

  it('a request is sent with defaults and mapped back (rate per kg from the totals)', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { id: 'a1', status: 'pending_pickup', wheat_quantity_kg: '20', milling_charge: '120', total_amount: '270', pickup_address: 'House 5', latitude: '32.5', longitude: '74.1' } } });
    const res = await attaService.createRequest({ addressId: 'ad1', wheatQuantityKg: 20 } as never);
    expect(mockApi.post).toHaveBeenCalledWith('/atta-requests', expect.objectContaining({ address_id: 'ad1', wheat_quantity_kg: 20, wheat_quality: 'desi', flour_type: 'fine' }));
    expect(res.data).toMatchObject({ id: 'a1', wheatWeight: 20, pricePerKg: 6, totalPrice: 270, status: 'pending_pickup' });
    expect(res.data!.pickupAddress.fullAddress).toBe('House 5');
  });

  it('list, detail, cancel, track', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: [{ id: 'a1', wheat_quantity_kg: 0 }], meta: { total: 1 } } });
    const list = (await attaService.getRequests()).data!;
    expect(list.data[0].pricePerKg).toBe(0);
    mockApi.get.mockResolvedValueOnce({ data: { data: { id: 'a2' } } });
    expect((await attaService.getRequestById('a2')).data!.id).toBe('a2');
    mockApi.put.mockResolvedValueOnce({ data: { success: true } });
    await attaService.cancelRequest('a2', 'no longer needed');
    expect(mockApi.put).toHaveBeenCalledWith('/atta-requests/a2/cancel', { reason: 'no longer needed' });
    mockApi.get.mockResolvedValueOnce({ data: { success: true, data: { status: 'milling' } } });
    expect((await attaService.trackRequest('a2')).data.status).toBe('milling');
    expect((await attaService.getPricePerKg()).data.price).toBeGreaterThan(0);
  });
});

describe('reviews and complaints', () => {
  it('a review is sent as the API expects', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { id: 'r1' } } });
    await feedbackService.submitReview({ targetType: 'product', orderId: 'o1', productId: 'p1', rating: 5, comment: 'Fresh' } as never);
    expect(mockApi.post).toHaveBeenCalledWith('/reviews', { targetType: 'product', orderId: 'o1', productId: 'p1', rating: 5, comment: 'Fresh' });
  });

  it('reviewables, mine, product reviews', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: { products: [] } } });
    await feedbackService.getOrderReviewables('o1');
    mockApi.get.mockResolvedValueOnce({ data: { data: [{ id: 'r1' }] } });
    expect((await feedbackService.getMyReviews()).data).toHaveLength(1);
    mockApi.get.mockResolvedValueOnce({ data: { data: { summary: { average: 4, count: 2 }, reviews: [] } } });
    expect((await feedbackService.getProductReviews('p1')).data!.summary.count).toBe(2);
    expect(mockApi.get.mock.calls.map((c) => c[0])).toEqual(['/reviews/order/o1', '/reviews/mine', '/reviews/product/p1']);
  });

  it('a complaint goes with the city; my complaints list', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { data: { id: 'c1' } } });
    await feedbackService.fileComplaint({ subject: 'Late', message: 'Very late' } as never);
    expect(mockApi.post).toHaveBeenCalledWith('/complaints', { subject: 'Late', message: 'Very late' }, { params: { city_id: 'city-1' } });
    mockApi.get.mockResolvedValueOnce({ data: { data: [] } });
    expect((await feedbackService.getMyComplaints()).data).toEqual([]);
  });

  it('errors reach the screen', async () => {
    mockApi.post.mockRejectedValue(new Error('Already reviewed'));
    await expect(feedbackService.submitReview({} as never)).rejects.toThrow('Already reviewed');
    await expect(feedbackService.fileComplaint({} as never)).rejects.toThrow();
    mockApi.get.mockRejectedValue(new Error('down'));
    await expect(feedbackService.getMyReviews()).rejects.toThrow('down');
  });
});
