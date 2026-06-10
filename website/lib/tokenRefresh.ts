import axios from 'axios';
import { useAuthStore } from '@/store/cartStore';
import { usesHttpOnlyCookies } from '@/lib/authConfig';
import {
  clearTokens,
  getRefreshToken,
  storeTokens,
  getAccessToken,
} from '@/lib/secureTokens';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

let refreshPromise: Promise<boolean> | null = null;

function parseTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function tokenNeedsRefresh(
  token: string | null | undefined,
  bufferMs = 2 * 60 * 1000
): boolean {
  if (usesHttpOnlyCookies()) return false;
  if (!token) return true;
  const expMs = parseTokenExpiryMs(token);
  if (!expMs) return true;
  return Date.now() >= expMs - bufferMs;
}

/** Refresh session — HttpOnly cookies updated server-side when cookie auth is on. */
export async function refreshWebsiteAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  if (usesHttpOnlyCookies()) {
    if (!useAuthStore.getState().isAuthenticated) return false;

    refreshPromise = (async () => {
      try {
        await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: { 'X-Client-Platform': 'website' },
          }
        );
        return true;
      } catch {
        clearTokens();
        useAuthStore.getState().logout();
        return false;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  const stored = getRefreshToken() || useAuthStore.getState().refreshToken;
  if (!stored) return false;

  refreshPromise = (async () => {
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken: stored, refresh_token: stored },
        {
          withCredentials: true,
          headers: { 'X-Client-Platform': 'website' },
        }
      );
      const payload = data?.data ?? data;
      const tokens = payload?.tokens ?? payload;
      const accessToken = tokens?.accessToken || tokens?.access_token;
      const refreshToken = tokens?.refreshToken || tokens?.refresh_token;
      if (!accessToken) {
        clearTokens();
        useAuthStore.getState().logout();
        return false;
      }

      storeTokens(accessToken, refreshToken || stored);
      useAuthStore.setState({
        accessToken,
        refreshToken: refreshToken || stored,
        isAuthenticated: true,
      });

      return true;
    } catch {
      clearTokens();
      useAuthStore.getState().logout();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Bearer token for legacy dev mode only. */
export async function getValidAccessToken(): Promise<string | null> {
  if (usesHttpOnlyCookies()) return null;
  const current =
    useAuthStore.getState().accessToken || getAccessToken();
  if (!tokenNeedsRefresh(current)) return current;
  const ok = await refreshWebsiteAccessToken();
  if (!ok) return null;
  return useAuthStore.getState().accessToken || getAccessToken();
}

/** True when an authenticated API/socket session should be available. */
export async function ensureAuthSession(): Promise<boolean> {
  if (!useAuthStore.getState().isAuthenticated) return false;
  if (usesHttpOnlyCookies()) return true;
  return !!(await getValidAccessToken());
}
