// I8 (round 8): the app signed the customer out whenever a refresh returned
// nothing — a weak mobile signal when the 15-minute token ran out was enough.
// Only a refusal from the server may end the session.
jest.mock('axios', () => {
  const post = jest.fn();
  const instance = { post, get: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { ...instance, create: () => instance, isAxiosError: (e: any) => !!e?.isAxiosError }, ...instance, isAxiosError: (e: any) => !!e?.isAxiosError };
});
jest.mock('../src/lib/secureTokens', () => ({
  tokenStorage: {
    getAccessToken: jest.fn(async () => 'old'),
    getRefreshToken: jest.fn(async () => 'refresh-1'),
    storeTokens: jest.fn(async () => undefined),
    clearTokens: jest.fn(async () => undefined),
  },
}));

import axios from 'axios';
import { refreshAccessTokenWithReason } from '../src/lib/tokenRefresh';

const post = (axios as unknown as { post: jest.Mock }).post;
const axiosError = (status?: number) =>
  Object.assign(new Error('failed'), { isAxiosError: true, response: status ? { status } : undefined });

beforeEach(() => post.mockReset());

it('weak signal (no answer) → no token, but NOT a refusal: stay signed in', async () => {
  post.mockRejectedValueOnce(axiosError());
  await expect(refreshAccessTokenWithReason()).resolves.toEqual({ token: null, refused: false });
});

it('server restarting (503) → not a refusal either', async () => {
  post.mockRejectedValueOnce(axiosError(503));
  await expect(refreshAccessTokenWithReason()).resolves.toEqual({ token: null, refused: false });
});

it('refresh token refused (401) → a real sign-out', async () => {
  post.mockRejectedValueOnce(axiosError(401));
  await expect(refreshAccessTokenWithReason()).resolves.toEqual({ token: null, refused: true });
});

it('a good refresh gives the new token', async () => {
  post.mockResolvedValueOnce({ data: { data: { tokens: { accessToken: 'new-a', refreshToken: 'new-r' } } } });
  await expect(refreshAccessTokenWithReason()).resolves.toEqual({ token: 'new-a', refused: false });
});
