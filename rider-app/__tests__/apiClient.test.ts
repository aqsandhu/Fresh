// Rider API client: the token goes on every request, an expired token is
// refreshed once and the request repeated, a deactivated rider is signed out
// with the reason, and error text shown to the rider is never raw axios text.
import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

const mockAuthState = { token: 'access-1' as string | null, endSession: jest.fn() };
jest.mock('../src/store/authStore', () => ({ useAuthStore: { getState: () => mockAuthState } }));
jest.mock('../src/navigation/navigationUtils', () => ({ getCurrentTabName: () => 'Tasks', setPendingRedirect: jest.fn() }));
jest.mock('../src/lib/secureTokens', () => ({ getStoredToken: jest.fn(async () => null) }));
const mockRefresh = jest.fn();
jest.mock('../src/lib/tokenRefresh', () => ({ refreshAccessToken: () => mockRefresh() }));

import apiService, { ApiError, getApiErrorMessage, getApiErrorStatus, isNetworkError } from '../src/services/api';

const cfg = (): InternalAxiosRequestConfig => ({ url: '/x', method: 'get', headers: new AxiosHeaders() });
const answered = (status: number, data?: unknown, config = cfg()) =>
  new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, { status, statusText: '', headers: {}, config, data });

describe('error helpers', () => {
  it.each([
    ['server message wins', answered(400, { message: 'Task already picked up' }), 'Task already picked up'],
    ['no answer = connection problem', new AxiosError('Network Error', undefined, cfg()), 'Check your internet connection'],
    ['our own ApiError', new ApiError('Custom', 409), 'Custom'],
    ['a plain string', 'oops', 'oops'],
    ['anything else', 42, 'Something went wrong'],
  ])('%s', (_n, error, text) => {
    expect(getApiErrorMessage(error)).toBe(text);
  });

  it('status and network detection', () => {
    expect(getApiErrorStatus(answered(404))).toBe(404);
    expect(getApiErrorStatus(new ApiError('x', 418))).toBe(418);
    expect(getApiErrorStatus(new Error('x'))).toBeNull();
    expect(isNetworkError(new AxiosError('Network Error', undefined, cfg()))).toBe(true);
    expect(isNetworkError(answered(500))).toBe(false);
    expect(isNetworkError(new ApiError('x', null, true))).toBe(true);
  });
});

describe('client', () => {
  const client = apiService.getClient();
  const original = client.defaults.adapter;
  afterEach(() => {
    client.defaults.adapter = original;
    mockAuthState.token = 'access-1';
    jest.clearAllMocks();
  });

  it('sends the rider token and unwraps data', async () => {
    let seen = '';
    client.defaults.adapter = (async (config) => {
      seen = String(config.headers.Authorization);
      return { data: { ok: 1 }, status: 200, statusText: 'OK', headers: {}, config };
    }) as AxiosAdapter;
    expect(await apiService.get('/rider/tasks')).toEqual({ ok: 1 });
    expect(seen).toBe('Bearer access-1');
  });

  it('an expired token is refreshed once and the request repeated', async () => {
    // As in the app: a successful refresh puts the new token in the store
    // (tokenRefresh → notifyTokenRefreshed → auth store), then returns it.
    mockRefresh.mockImplementation(async () => {
      mockAuthState.token = 'access-2';
      return 'access-2';
    });
    const tokens: string[] = [];
    client.defaults.adapter = (async (config) => {
      tokens.push(String(config.headers.Authorization));
      if (tokens.length === 1) throw answered(401, { message: 'expired' }, config);
      return { data: { done: true }, status: 200, statusText: 'OK', headers: {}, config };
    }) as AxiosAdapter;
    expect(await apiService.post('/rider/tasks/t1/pickup')).toEqual({ done: true });
    expect(tokens).toEqual(['Bearer access-1', 'Bearer access-2']);
  });

  it('a failing refresh call ends the session', async () => {
    client.defaults.adapter = (async (config) => { throw answered(401, {}, config); }) as AxiosAdapter;
    await expect(apiService.post('/auth/refresh')).rejects.toBeTruthy();
    expect(mockAuthState.endSession).toHaveBeenCalled();
  });

  it('a deactivated rider is signed out with the reason; other 403s are not', async () => {
    client.defaults.adapter = (async (config) => { throw answered(403, { message: 'Your rider account is not active' }, config); }) as AxiosAdapter;
    await expect(apiService.get('/rider/tasks')).rejects.toBeTruthy();
    expect(mockAuthState.endSession).toHaveBeenCalledWith('Your rider account is not active');
    mockAuthState.endSession.mockClear();
    client.defaults.adapter = (async (config) => { throw answered(403, { message: 'Not your task' }, config); }) as AxiosAdapter;
    await expect(apiService.put('/rider/tasks/t9', {})).rejects.toBeTruthy();
    expect(mockAuthState.endSession).not.toHaveBeenCalled();
  });

  it('uploads let axios set the multipart boundary', async () => {
    let contentType: unknown = 'unset';
    client.defaults.adapter = (async (config) => {
      contentType = config.headers['Content-Type'];
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    }) as AxiosAdapter;
    const form = new FormData();
    form.append('a', 'b');
    await apiService.patch('/rider/profile', form);
    expect(contentType === undefined || !String(contentType).includes('application/json')).toBe(true);
    await apiService.delete('/rider/x');
  });
});

it('axios is the real library (sanity)', () => {
  expect(typeof axios.isAxiosError).toBe('function');
});
