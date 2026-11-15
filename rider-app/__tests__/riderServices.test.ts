// Rider auth + task services: what the API answers is mapped into what the
// screens show (stats, cash in hand, reviews, uploads), and every refusal turns
// into an error with the server's reason.
const mockApi = { get: jest.fn(), post: jest.fn(), put: jest.fn() };
jest.mock('../src/services/api', () => {
  class ApiError extends Error {
    status: number | null;
    constructor(message: string, status: number | null) {
      super(message);
      this.status = status;
    }
  }
  return { __esModule: true, ApiError, get default() { return mockApi; } };
});
const mockRefresh = jest.fn();
jest.mock('../src/lib/secureTokens', () => ({ getStoredRefreshToken: () => mockRefresh() }));

import { authService, mapRiderProfile } from '../src/services/auth.service';
import { taskService } from '../src/services/task.service';

beforeEach(() => jest.resetAllMocks());

describe('auth service', () => {
  it('login maps the rider and both tokens', async () => {
    mockApi.post.mockResolvedValue({
      success: true,
      data: { user: { id: 'u1', rider_id: 'r1', full_name: 'Ali', phone: '+923', rider_status: 'busy' }, tokens: { access_token: 'a', refresh_token: 'r' } },
    });
    const res = await authService.login({ phone: '0300', password: 'x' } as never);
    expect(res).toMatchObject({ token: 'a', refreshToken: 'r', rider: { id: 'r1', userId: 'u1', name: 'Ali', status: 'busy' } });
  });

  it('a refused login carries the server reason', async () => {
    mockApi.post.mockResolvedValue({ success: false, message: 'Wrong password' });
    await expect(authService.login({} as never)).rejects.toThrow('Wrong password');
  });

  it('profile mapping is defensive (unknown status → offline, numbers from strings)', () => {
    expect(mapRiderProfile({ id: 7, status: 'flying', total_deliveries: '12', rating: '4.5' })).toMatchObject({
      id: '7', status: 'offline', totalDeliveries: 12, rating: 4.5,
    });
  });

  it('logout revokes THIS session (sends the refresh token)', async () => {
    mockRefresh.mockResolvedValue('refresh-1');
    mockApi.post.mockResolvedValue({ success: true });
    await authService.logout();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'refresh-1' });
  });

  it('duty, location and push token calls; refusals throw', async () => {
    mockApi.put.mockResolvedValue({ success: true });
    await authService.updateDutyStatus(true);
    await authService.updateLocation(32.1, 74.2, 10);
    await authService.registerPushToken('tok');
    expect(mockApi.put.mock.calls.map((c) => c[0])).toEqual(['/rider/status', '/rider/location', '/rider/fcm-token']);
    expect(mockApi.put.mock.calls[0][1]).toEqual({ status: 'available' });
    mockApi.put.mockResolvedValue({ success: false, message: 'Not verified' });
    await expect(authService.updateDutyStatus(false)).rejects.toThrow('Not verified');
    await expect(authService.updateLocation(0, 0)).rejects.toThrow();
    await expect(authService.registerPushToken('t')).rejects.toThrow();
    mockApi.get.mockResolvedValue({ success: false });
    await expect(authService.getProfile()).rejects.toThrow('Failed to fetch profile');
  });
});

describe('task service', () => {
  it('today stats default the date and coerce numbers', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { totalDeliveries: '3', totalEarnings: '450' } });
    const s = await taskService.getTodayStats();
    expect(s).toMatchObject({ totalDeliveries: 3, totalEarnings: 450 });
    expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('my stats: cash still to hand over is cash in hand minus what the rider earned', async () => {
    mockApi.get.mockResolvedValue({
      success: true,
      data: { stats: { today: { orders: '2', earnings: '200' } }, payment: { cashInHand: '5000', unsettledEarned: '600', pendingOrders: 3, pendingAtta: 1 } },
    });
    const s = await taskService.getMyStats();
    expect(s.stats.today).toEqual({ orders: 2, earnings: 200, attaTasks: 0 });
    expect(s.payment).toMatchObject({ cashInHand: 5000, paymentPending: 4400, pendingLines: 4 });
  });

  it('cash hand-overs and reviews are mapped for the screens', async () => {
    mockApi.get.mockResolvedValueOnce({ success: true, data: [{ id: 1, amount: '1500', received_at: 'x', order_count: '3' }] });
    expect(await taskService.getCashSettlements()).toEqual([
      { id: '1', amount: 1500, status: 'received', note: null, receivedAt: 'x', receivedByName: null, orderCount: 3, attaCount: 0 },
    ]);
    mockApi.get.mockResolvedValueOnce({ success: true, data: { rating: '4.8', ratingCount: 9, reviews: [{ id: 2, rating: 5, comment: 'Fast', customer_first_name: 'Sara' }] } });
    const r = await taskService.getReviews();
    expect(r).toMatchObject({ rating: 4.8, ratingCount: 9 });
    expect(r.reviews[0]).toMatchObject({ id: '2', comment: 'Fast', customerFirstName: 'Sara' });
  });

  it('arrival, call request, pin', async () => {
    mockApi.post.mockResolvedValueOnce({ success: true, data: { notified: true, arrived_at: 't' } });
    expect(await taskService.markArrived('t1')).toEqual({ notified: true, arrivedAt: 't' });
    mockApi.post.mockResolvedValueOnce({ success: true, data: { call_request_id: 'c1', virtual_number: null } });
    expect(await taskService.requestCustomerCall('o1')).toEqual({ callRequestId: 'c1', number: null, notified: false });
    mockApi.put.mockResolvedValueOnce({ success: true, data: { latitude: 1, longitude: 2 } });
    expect(await taskService.pinLocation('t1', 1, 2)).toEqual({ latitude: 1, longitude: 2 });
  });

  it('photo uploads send multipart under the right field and return the URL', async () => {
    mockApi.post.mockResolvedValueOnce({ success: true, data: { url: 'https://cdn/p.jpg' } });
    expect(await taskService.uploadProof('t1', 'file://p.jpg', 'pickup')).toBe('https://cdn/p.jpg');
    const form = mockApi.post.mock.calls[0][1] as FormData;
    expect(form.get('stage')).toBe('pickup');
    mockApi.post.mockResolvedValueOnce({ success: true, data: { url: 'https://cdn/d.jpg' } });
    expect(await taskService.uploadDoorPicture('t1', 'file://d.jpg')).toBe('https://cdn/d.jpg');
    expect(mockApi.post.mock.calls[1][0]).toBe('/rider/tasks/t1/door-picture');
  });

  it('a refusal carries the server reason', async () => {
    mockApi.post.mockResolvedValue({ success: false, message: 'Phone number is hidden for this order' });
    await expect(taskService.requestCustomerCall('o1')).rejects.toThrow('Phone number is hidden for this order');
  });
});
