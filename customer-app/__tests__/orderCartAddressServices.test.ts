// Checkout plumbing: an order is never placed without a city, the cart sync is
// one request with the newest snapshot (edits made mid-sync are not lost),
// coupon errors reach the screen, and addresses go up with their door photo.
const mockApi = { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), patch: jest.fn() };
jest.mock('@services/api', () => ({ __esModule: true, get default() { return mockApi; }, handleApiError: (e: Error) => e }));
const mockCity = { id: 'city-1' as string | null };
jest.mock('@/lib/cityStorage', () => ({ getSelectedCityId: async () => mockCity.id }));
const mockToken = { value: 'tok' as string | null };
jest.mock('@/lib/secureTokens', () => ({ getStoredToken: async () => mockToken.value }));

import { orderService } from '@services/order.service';
import { cartService } from '@services/cart.service';
import { addressService } from '@services/address.service';
import { setCachedCityId } from '@/lib/apiHelpers';

const item = (id: string, quantity = 1) => ({ product: { id }, quantity, unit: 'full', quality: 'A' }) as never;

beforeEach(() => {
  jest.resetAllMocks();
  mockCity.id = 'city-1';
  mockToken.value = 'tok';
  setCachedCityId('city-1');
});

describe('orders', () => {
  it('places an order with the city; refuses without one', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { order: { id: 'o1', order_number: 'ORD-1', status: 'pending', total_amount: '950' } } } });
    const res = await orderService.createOrder({ addressId: 'a1', deliverySlotId: 's1', paymentMethod: 'cash_on_delivery', requestedDeliveryDate: '2026-11-16' } as never);
    expect(mockApi.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ address_id: 'a1', time_slot_id: 's1', city_id: 'city-1', requested_delivery_date: '2026-11-16' }));
    expect(res.data!.order.id).toBe('o1');
    mockCity.id = null;
    await expect(orderService.createOrder({ addressId: 'a1' } as never)).rejects.toThrow(/select a service city/);
  });

  it('order list with paging; nothing before a city is chosen', async () => {
    mockApi.get.mockResolvedValue({ data: { data: { orders: [{ id: 'o1', status: 'delivered' }], pagination: { total: 11, page: 2, limit: 10, totalPages: 2 } } } });
    expect((await orderService.getOrders('delivered' as never)).data).toMatchObject({ total: 11, page: 2, totalPages: 2 });
    expect(mockApi.get.mock.calls[0][1].params).toEqual({ status: 'delivered', city_id: 'city-1' });
    setCachedCityId(null);
    expect((await orderService.getOrders()).data!.data).toEqual([]);
  });

  it('detail, cancel, track', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: { id: 'o2', status: 'pending' } } });
    expect((await orderService.getOrderById('o2')).data!.id).toBe('o2');
    mockApi.put.mockResolvedValueOnce({ data: { success: true } });
    await orderService.cancelOrder('o2', 'changed mind');
    expect(mockApi.put).toHaveBeenCalledWith('/orders/o2/cancel', { reason: 'changed mind' });
    mockApi.get.mockResolvedValueOnce({ data: { success: true, data: { status: 'out_for_delivery' } } });
    expect((await orderService.trackOrder('o2')).data.status).toBe('out_for_delivery');
    mockApi.get.mockRejectedValueOnce(new Error('404'));
    await expect(orderService.getOrderById('x')).rejects.toThrow('404');
  });

  it('time slots: free / express flags and how many places are left', async () => {
    mockApi.get.mockResolvedValue({ data: { data: [{ id: 's1', start_time: '10:00:00', end_time: '14:00:00', available_slots: '3', is_free_delivery_slot: true }, { id: 's2', slot_name: 'Evening', available_slots: 0, is_express_slot: true }] } });
    const slots = (await orderService.getDeliverySlots('2026-11-16')).data!;
    expect(slots[0]).toMatchObject({ available: true, available_slots: 3, isFreeDelivery: true, date: '2026-11-16' });
    expect(slots[1]).toMatchObject({ label: 'Evening', available: false, isExpress: true });
    // Every city has its own slots (A30): the selected city goes with the request.
    expect(mockApi.get).toHaveBeenCalledWith('/orders/time-slots', { params: { date: '2026-11-16', city_id: 'city-1' } });
  });

  it('time slots without a date ask for TODAY IN PAKISTAN (the UTC date is yesterday before 5 am)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-16T21:30:00Z')); // 02:30 on 17 Nov in Pakistan
    mockApi.get.mockResolvedValue({ data: { data: [] } });
    await orderService.getDeliverySlots();
    expect(mockApi.get).toHaveBeenCalledWith('/orders/time-slots', { params: { date: '2026-11-17', city_id: 'city-1' } });
    jest.useRealTimers();
  });

  it('delivery settings: server values, safe defaults on failure', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: { base_charge: '150', free_delivery_threshold: '800', urgent_eta: '45 min' } } });
    expect((await orderService.getDeliverySettings()).data).toMatchObject({ base_charge: 150, free_delivery_threshold: 800, urgent_eta: '45 min' });
    mockApi.get.mockRejectedValueOnce(new Error('down'));
    expect((await orderService.getDeliverySettings()).data).toMatchObject({ base_charge: 100, free_delivery_threshold: 500 });
  });
});

describe('cart sync', () => {
  it('signed out: nothing sent (counts as fine)', async () => {
    mockToken.value = null;
    expect(await cartService.syncCartWithBackend([item('p1')], 'city-1')).toBe(true);
    expect(await cartService.clearBackendCart()).toBe(true);
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('one request with the whole cart; never an empty list or a missing city', async () => {
    mockApi.post.mockResolvedValue({});
    expect(await cartService.syncCartWithBackend([item('p1', 2)], 'city-1')).toBe(true);
    expect(mockApi.post).toHaveBeenCalledWith('/cart/sync', { city_id: 'city-1', items: [{ product_id: 'p1', quantity: 2, unit: 'full', quality: 'A' }] });
    expect(await cartService.syncCartWithBackend([], 'city-1')).toBe(false);
    mockCity.id = null;
    expect(await cartService.syncCartWithBackend([item('p1')], null)).toBe(false);
  });

  it('an edit made while a sync is running is sent right after it (not lost)', async () => {
    let release: () => void = () => undefined;
    mockApi.post.mockImplementationOnce(() => new Promise((r) => { release = () => r({}); })).mockResolvedValue({});
    const first = cartService.syncCartWithBackend([item('p1', 1)], 'city-1');
    await new Promise((r) => setImmediate(r));
    expect(await cartService.syncCartWithBackend([item('p1', 5)], 'city-1')).toBe(true);
    release();
    await first;
    await new Promise((r) => setImmediate(r));
    expect(mockApi.post).toHaveBeenCalledTimes(2);
    expect(mockApi.post.mock.calls[1][1].items[0].quantity).toBe(5);
  });

  it('a failed sync or clear reports false', async () => {
    mockApi.post.mockRejectedValue(new Error('500'));
    expect(await cartService.syncCartWithBackend([item('p1')], 'city-1')).toBe(false);
    mockApi.delete.mockResolvedValueOnce({ data: { success: true } }).mockRejectedValueOnce(new Error('x'));
    expect(await cartService.clearBackendCart()).toBe(true);
    expect(await cartService.clearBackendCart()).toBe(false);
  });

  it('coupons: the refusal reason reaches the screen; my coupons default empty', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { data: { code: 'SAVE10', discount_amount: 50 } } });
    expect(await cartService.applyCoupon('SAVE10')).toMatchObject({ discount_amount: 50 });
    mockApi.post.mockRejectedValueOnce(new Error('Coupon expired'));
    await expect(cartService.applyCoupon('OLD')).rejects.toThrow('Coupon expired');
    mockApi.delete.mockRejectedValueOnce(new Error('x'));
    await expect(cartService.removeCoupon()).resolves.toBeUndefined();
    mockApi.get.mockResolvedValueOnce({ data: { data: { coupons: [{ code: 'A' }], unseen: [] } } });
    expect((await cartService.getMyCoupons()).coupons).toHaveLength(1);
    mockApi.get.mockRejectedValueOnce(new Error('x'));
    expect(await cartService.getMyCoupons()).toEqual({ coupons: [], unseen: [] });
    mockApi.patch.mockRejectedValueOnce(new Error('x'));
    await expect(cartService.markCouponsSeen()).resolves.toBeUndefined();
  });
});

describe('addresses', () => {
  const rawAddress = { id: 'a1', address_type: 'home', written_address: 'House 12', area_name: 'Model Town', city: 'Gujrat', latitude: '32.5', longitude: '74.1', is_default: true, door_picture_url: '/uploads/d.jpg' };

  it('list and detail are mapped', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { data: [rawAddress] } });
    const [a] = (await addressService.getAddresses()).data!;
    expect(a).toMatchObject({ id: 'a1', label: 'home', writtenAddress: 'House 12', city: 'Gujrat', latitude: 32.5, isDefault: true });
    mockApi.get.mockResolvedValueOnce({ data: { data: rawAddress } });
    expect((await addressService.getAddressById('a1')).data!.id).toBe('a1');
  });

  it('a new door photo goes up as multipart; otherwise plain JSON; unknown type → other', async () => {
    mockApi.post.mockResolvedValue({ data: { data: rawAddress } });
    await addressService.createAddress({ label: 'Office', fullAddress: 'Plaza 3', city: 'Gujrat', latitude: 1, longitude: 2, doorImage: 'file:///door.jpg' } as never);
    const form = mockApi.post.mock.calls[0][1] as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('address_type')).toBe('office');
    await addressService.createAddress({ label: 'Shop', fullAddress: 'Bazaar', city: 'Gujrat' } as never);
    expect(mockApi.post.mock.calls[1][1]).toMatchObject({ address_type: 'other', written_address: 'Bazaar' });
  });

  it('update, delete, default', async () => {
    mockApi.put.mockResolvedValue({ data: { data: rawAddress, success: true } });
    await addressService.updateAddress('a1', { landmark: 'Near mosque', doorImage: 'content://x' } as never);
    expect(mockApi.put.mock.calls[0][1]).toBeInstanceOf(FormData);
    await addressService.updateAddress('a1', { landmark: 'Near mosque' } as never);
    expect(mockApi.put.mock.calls[1][1]).toEqual({ landmark: 'Near mosque' });
    mockApi.delete.mockResolvedValueOnce({ data: { success: true, data: { message: 'deleted' } } });
    await addressService.deleteAddress('a1');
    await addressService.setDefaultAddress('a1');
    expect(mockApi.put).toHaveBeenLastCalledWith('/addresses/a1/set-default');
    mockApi.get.mockRejectedValueOnce(new Error('401'));
    await expect(addressService.getAddresses()).rejects.toThrow('401');
  });
});
