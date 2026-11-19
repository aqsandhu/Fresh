// W16 (round 10): the panel's HTTP client end to end (a fake network adapter,
// the real interceptors): auth + city headers, snake/camel case both ways,
// "waiting for approval" (202), each error kind's message, and a silent token
// refresh + retry on 401 (FormData bodies included).
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', AUTH_COOKIES_ENABLED: false, CLIENT_PLATFORM: 'admin' }));
const mockRefresh = jest.fn();
jest.mock('@/lib/adminTokenRefresh', () => {
  const actual = jest.requireActual('@/lib/adminTokenRefresh');
  return { ...actual, refreshAdminAccessToken: () => mockRefresh() };
});

import type { AxiosRequestConfig } from 'axios';
import { api, apiClient, unwrap, toCamelCase } from '@/services/api';
import { isQueued } from '@/lib/approvalQueue';

const toast = require('react-hot-toast').default;

type Reply = { status: number; data?: unknown } | { network: true };
let replies: Reply[];
const seen: AxiosRequestConfig[] = [];
const store = new Map<string, string>();
const ls = localStorage as unknown as Record<'getItem' | 'setItem' | 'removeItem', jest.Mock>;

beforeEach(() => {
  replies = [];
  seen.length = 0;
  store.clear();
  ls.getItem.mockImplementation((k: string) => (store.has(k) ? store.get(k) : null));
  ls.setItem.mockImplementation((k: string, v: string) => void store.set(k, String(v)));
  ls.removeItem.mockImplementation((k: string) => void store.delete(k));
  window.history.replaceState({}, '', '/admin/orders');
  apiClient.defaults.adapter = async (config) => {
    seen.push({ ...config, headers: { ...(config.headers as object) } } as AxiosRequestConfig);
    const r = replies.shift() ?? { status: 200, data: { success: true, data: {} } };
    if ('network' in r) {
      const err: any = new Error('Network Error');
      err.isAxiosError = true;
      err.config = config;
      err.request = {};
      throw err;
    }
    const response = { data: r.data, status: r.status, statusText: '', headers: {}, config };
    if (r.status >= 400) {
      const err: any = new Error(`Request failed with status code ${r.status}`);
      err.isAxiosError = true;
      err.config = config;
      err.response = response;
      throw err;
    }
    return response;
  };
});

describe('requests', () => {
  it('send the token, the chosen city, the platform, and snake_case body + query', async () => {
    store.set('admin_token', 'tok');
    store.set('admin_selected_city_id', 'city-1');
    replies.push({ status: 200, data: { success: true, data: { order_number: 'ORD-1', line_items: [{ unit_price: 5 }] } } });
    const res = await api.post<any>('/admin/things', { fullName: 'Ali', nested: { houseNumber: '12' } });
    const sent = seen[0];
    expect((sent.headers as any).Authorization).toBe('Bearer tok');
    expect((sent.headers as any)['X-City-Id']).toBe('city-1');
    expect((sent.headers as any)['X-Client-Platform']).toBe('admin');
    expect(JSON.parse(sent.data as string)).toEqual({ full_name: 'Ali', nested: { house_number: '12' } });
    expect(res.data).toEqual({ orderNumber: 'ORD-1', lineItems: [{ unitPrice: 5 }] });
    await api.get('/admin/list', { pageSize: 10 });
    expect(seen[1].params).toEqual({ page_size: 10 });
  });

  it('a file upload keeps its FormData and lets the browser set the boundary', async () => {
    const fd = new FormData();
    fd.append('name_en', 'Aloo');
    await api.postForm('/admin/products', fd);
    expect(seen[0].data).toBeInstanceOf(FormData);
    expect((seen[0].headers as any)['Content-Type']).not.toBe('application/json'); // the JSON default is dropped
  });

  it('delete with a body sends it snake_cased', async () => {
    await api.delete('/admin/x', { productIds: ['a'] });
    expect(JSON.parse(seen[0].data as string)).toEqual({ product_ids: ['a'] });
  });
});

describe('answers', () => {
  it('202 "waiting for approval" is not success: it rejects as queued and says so in green', async () => {
    replies.push({ status: 202, data: { success: true, message: 'Sent to the city admin for approval.', data: { queued: true, request_id: 'rq1' } } });
    const err = await api.post('/admin/expenses', { amount: 5000 }).catch((e) => e);
    expect(isQueued(err)).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Sent to the city admin for approval.', expect.objectContaining({ id: 'queued-rq1' }));
  });

  it.each([
    [{ status: 403, data: { message: 'Only the super admin can add a city' } }, 'Only the super admin can add a city'],
    [{ status: 403, data: {} }, 'You do not have permission to perform this action'],
    [{ status: 500, data: { message: 'secret stack' } }, 'Server error. Please try again later.'],
    [{ status: 503, data: { message: 'Picture storage is not set up' } }, 'Picture storage is not set up'],
    [{ status: 400, data: { message: 'Amount must be above 0' } }, 'Amount must be above 0'],
    [{ status: 422, data: {} }, 'Something went wrong'],
  ])('%j shows "%s"', async (reply, message) => {
    replies.push(reply);
    await expect(api.get('/admin/x')).rejects.toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(message);
  });

  it('no answer at all says the server cannot be reached', async () => {
    replies.push({ network: true });
    await expect(api.get('/admin/x')).rejects.toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/reach/i), { id: 'server-unreachable' });
  });
});

describe('401 and the session', () => {
  it('with a session: refresh once, retry with the new token (FormData restored)', async () => {
    store.set('admin_token', 'old');
    store.set('admin_refresh_token', 'rt');
    // Like the real refresh: the new token is stored, then returned.
    mockRefresh.mockImplementationOnce(async () => { store.set('admin_token', 'fresh'); return 'fresh'; });
    replies.push({ status: 401, data: { message: 'jwt expired' } }, { status: 200, data: { success: true, data: { id: 'p1' } } });
    const fd = new FormData();
    fd.append('price', '100');
    const res = await api.putForm<any>('/admin/products/p1', fd);
    expect(res.data).toEqual({ id: 'p1' });
    expect(seen).toHaveLength(2);
    expect((seen[1].headers as any).Authorization).toBe('Bearer fresh');
    expect((seen[1].data as FormData).get('price')).toBe('100');
  });

  it('a refused refresh ends the session and goes to login', async () => {
    store.set('admin_token', 'old');
    store.set('admin_refresh_token', 'rt');
    store.set('admin_user', '{}');
    mockRefresh.mockResolvedValueOnce(null);
    replies.push({ status: 401, data: {} });
    jest.spyOn(console, 'error').mockImplementation(() => undefined); // jsdom: navigation not implemented
    await expect(api.get('/admin/orders')).rejects.toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith('Session expired. Please login again.');
    expect(store.has('admin_token')).toBe(false);
    expect(store.has('admin_user')).toBe(false);
  });

  it('on the login page a 401 is just an answer (no refresh, no redirect)', async () => {
    window.history.replaceState({}, '', '/admin/login');
    replies.push({ status: 401, data: { message: 'Invalid credentials' } });
    await expect(api.post('/admin/login', { phone: '0300', password: 'x' })).rejects.toBeTruthy();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('unwrap returns data or throws the message', () => {
    expect(unwrap({ data: 0 as unknown as number })).toBe(0);
    expect(() => unwrap({ message: 'Not found' })).toThrow('Not found');
    expect(() => unwrap({})).toThrow('Empty API response');
  });

  it('toCamelCase leaves dates and files alone', () => {
    const d = new Date(0);
    expect(toCamelCase<any>({ created_at: d, list_items: [{ item_id: 1 }] })).toEqual({ createdAt: d, listItems: [{ itemId: 1 }] });
  });
});
