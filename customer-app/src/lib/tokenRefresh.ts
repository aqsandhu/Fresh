import axios from 'axios';
import { API_BASE_URL } from '@utils/constants';
import {
  getStoredToken,
  getStoredRefreshToken,
  storeTokens,
} from '@/lib/secureTokens';

let refreshPromise: Promise<string | null> | null = null;

function parseTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function tokenNeedsRefresh(
  token: string | null | undefined,
  bufferMs = 2 * 60 * 1000
): boolean {
  if (!token) return true;
  const expMs = parseTokenExpiryMs(token);
  if (!expMs) return true;
  return Date.now() >= expMs - bufferMs;
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const stored = await getStoredRefreshToken();
      if (!stored) return null;

      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken: stored,
        refresh_token: stored,
      });
      const payload = data?.data ?? data;
      const tokens = payload?.tokens ?? payload;
      const accessToken = tokens?.accessToken || tokens?.access_token;
      const refreshToken = tokens?.refreshToken || tokens?.refresh_token;
      if (!accessToken) return null;

      await storeTokens(accessToken, refreshToken);

      const { useAuthStore } = require('@store/authStore');
      useAuthStore.setState({
        token: accessToken,
        isAuthenticated: true,
      });

      return accessToken;
    } catch {
      return null;
    } finally {
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();

  return refreshPromise;
}

export async function getValidAccessToken(): Promise<string | null> {
  const current = await getStoredToken();
  if (!tokenNeedsRefresh(current)) return current;
  return refreshAccessToken();
}
