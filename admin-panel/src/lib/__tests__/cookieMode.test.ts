// Owner decision Q2: the admin session moves from localStorage to HttpOnly
// cookies when the panel and the API are on the same site.
import axios from 'axios';
import { isSameSiteAsApi, resolveCookieMode } from '@/config/env';
import { adoptCookieSession } from '@/lib/adminTokenRefresh';

jest.mock('axios');
const mockPost = axios.post as jest.Mock;

describe('which mode the panel runs in', () => {
  it('cookie mode when the panel and the API share a site', () => {
    expect(isSameSiteAsApi('admin.freshbazar.pk', 'https://api.freshbazar.pk/api')).toBe(true);
    expect(resolveCookieMode('', 'admin.freshbazar.pk', 'https://api.freshbazar.pk/api')).toBe(true);
  });

  it('bearer mode on another site (Vercel preview), on localhost and for odd URLs', () => {
    expect(isSameSiteAsApi('freshbazar-admin.vercel.app', 'https://api.freshbazar.pk/api')).toBe(false);
    expect(isSameSiteAsApi('localhost', 'http://localhost:3000/api')).toBe(false);
    expect(isSameSiteAsApi('127.0.0.1', 'http://127.0.0.1:3000/api')).toBe(false);
    expect(isSameSiteAsApi('admin.freshbazar.pk', 'not a url')).toBe(false);
    // "a.pk" and "b.pk" share only the public suffix — not a site.
    expect(isSameSiteAsApi('a.pk', 'https://b.pk/api')).toBe(false);
  });

  it('the build flag forces it either way', () => {
    expect(resolveCookieMode('true', 'localhost', 'http://localhost:3000/api')).toBe(true);
    expect(resolveCookieMode('false', 'admin.freshbazar.pk', 'https://api.freshbazar.pk/api')).toBe(false);
    expect(resolveCookieMode(undefined, undefined, 'https://api.freshbazar.pk/api')).toBe(false);
  });
});

describe('moving an old localStorage session into cookies', () => {
  // setupTests replaces localStorage with jest.fn()s — give it a real store here.
  const store = new Map<string, string>();
  const ls = window.localStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock };
  beforeEach(() => {
    store.clear();
    ls.getItem.mockImplementation((k: string) => (store.has(k) ? store.get(k)! : null));
    ls.setItem.mockImplementation((k: string, v: string) => void store.set(k, v));
    ls.removeItem.mockImplementation((k: string) => void store.delete(k));
    mockPost.mockReset();
  });

  it('trades the stored refresh token for a cookie session and leaves no token in localStorage', async () => {
    store.set('admin_token', 'old.access.jwt');
    store.set('admin_refresh_token', 'old.refresh.jwt');
    mockPost.mockResolvedValue({ data: { success: true } });
    await adoptCookieSession(true, 'admin-cookie');
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { refreshToken: 'old.refresh.jwt' },
      { withCredentials: true, headers: { 'X-Client-Platform': 'admin-cookie' } }
    );
    expect(store.has('admin_token')).toBe(false);
    expect(store.has('admin_refresh_token')).toBe(false);
  });

  it('an expired old token just leaves the browser clean (login follows)', async () => {
    store.set('admin_refresh_token', 'dead');
    mockPost.mockRejectedValue(new Error('401'));
    await expect(adoptCookieSession(true, 'admin-cookie')).resolves.toBeUndefined();
    expect(store.has('admin_refresh_token')).toBe(false);
  });

  it('does nothing in bearer mode', async () => {
    store.set('admin_refresh_token', 'keep');
    await adoptCookieSession(false, 'admin');
    expect(mockPost).not.toHaveBeenCalled();
    expect(store.get('admin_refresh_token')).toBe('keep');
  });
});
