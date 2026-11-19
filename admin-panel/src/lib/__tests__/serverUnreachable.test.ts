// G13 (round 7): a refresh that cannot reach the server must not look like a
// refused session (which signs the admin out).
jest.mock('@/config/env', () => ({ API_BASE_URL: 'http://api.test/api', AUTH_COOKIES_ENABLED: false, CLIENT_PLATFORM: 'admin' }));
jest.mock('axios', () => {
  const post = jest.fn();
  return { __esModule: true, default: { post, get: jest.fn() }, post };
});

import axios from 'axios';
import { refreshAdminAccessToken, isServerUnreachable, ServerUnreachableError } from '@/lib/adminTokenRefresh';

const post = (axios as unknown as { post: jest.Mock }).post;
const axiosError = (status?: number) =>
  Object.assign(new Error('request failed'), { isAxiosError: true, response: status ? { status } : undefined });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  // setupTests mocks localStorage with jest.fn()s.
  (localStorage.getItem as jest.Mock).mockImplementation((k: string) => (k === 'admin_refresh_token' ? 'refresh-1' : null));
  await flush(); // let the shared refresh promise reset between tests
});

it('no answer → ServerUnreachableError (session kept)', async () => {
  post.mockRejectedValueOnce(axiosError());
  await expect(refreshAdminAccessToken()).rejects.toBeInstanceOf(ServerUnreachableError);
});

it('a 503 while the server restarts → ServerUnreachableError', async () => {
  post.mockRejectedValueOnce(axiosError(503));
  await expect(refreshAdminAccessToken()).rejects.toBeInstanceOf(ServerUnreachableError);
});

it('a refused refresh token (401) → null, the normal sign-out', async () => {
  post.mockRejectedValueOnce(axiosError(401));
  await expect(refreshAdminAccessToken()).resolves.toBeNull();
});

it('a good refresh stores the new tokens', async () => {
  post.mockResolvedValueOnce({ data: { data: { tokens: { accessToken: 'a2', refreshToken: 'r2' } } } });
  await expect(refreshAdminAccessToken()).resolves.toBe('a2');
  expect(localStorage.setItem).toHaveBeenCalledWith('admin_refresh_token', 'r2');
});

it('isServerUnreachable tells the cases apart', () => {
  expect(isServerUnreachable(axiosError())).toBe(true);
  expect(isServerUnreachable(axiosError(502))).toBe(true);
  expect(isServerUnreachable(axiosError(401))).toBe(false);
  expect(isServerUnreachable(new Error('plain'))).toBe(false);
});
