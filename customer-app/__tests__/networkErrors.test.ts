// What the customer reads when a request fails, and the single automatic
// retry for reads (never for writes — an order must not be placed twice).
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import {
  friendlyErrorMessage,
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
  SERVER_MESSAGE,
  BUSY_MESSAGE,
} from '@/lib/networkErrors';
import apiClient, { handleApiError } from '@services/api';

const cfg = (method = 'get'): InternalAxiosRequestConfig => ({ method, url: '/x', headers: new AxiosHeaders() });
const noAnswer = (code?: string, message = 'Network Error') => new AxiosError(message, code, cfg());
const answered = (status: number, data?: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_RESPONSE', cfg(), null, {
    status, statusText: '', headers: {}, config: cfg(), data,
  });

describe('friendlyErrorMessage', () => {
  it.each([
    ['offline', noAnswer(), OFFLINE_MESSAGE],
    ['timeout', noAnswer('ECONNABORTED', 'timeout of 30000ms exceeded'), TIMEOUT_MESSAGE],
    ['server 500 (its text is not for customers)', answered(500, { message: 'Internal server error' }), SERVER_MESSAGE],
    ['429 with the server message', answered(429, { message: 'Too many order attempts' }), 'Too many order attempts'],
    ['429 without a message', answered(429), BUSY_MESSAGE],
    ['400 shows the server reason', answered(400, { message: 'Delivery address is not in the selected city.' }), 'Delivery address is not in the selected city.'],
  ])('%s', (_name, error, text) => {
    expect(friendlyErrorMessage(error)).toBe(text);
    expect(handleApiError(error).message).toBe(text);
  });
});

describe('automatic retry', () => {
  const original = apiClient.defaults.adapter;
  afterEach(() => {
    apiClient.defaults.adapter = original;
  });

  it('a read with no answer is tried once more', async () => {
    let calls = 0;
    apiClient.defaults.adapter = async (config) => {
      calls += 1;
      if (calls === 1) throw new AxiosError('Network Error', undefined, config);
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };
    const res = await apiClient.get('/products');
    expect(res.data).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('a write is never repeated automatically', async () => {
    let calls = 0;
    apiClient.defaults.adapter = async (config) => {
      calls += 1;
      throw new AxiosError('Network Error', undefined, config);
    };
    await expect(apiClient.post('/orders', {})).rejects.toBeTruthy();
    expect(calls).toBe(1);
  });
});
