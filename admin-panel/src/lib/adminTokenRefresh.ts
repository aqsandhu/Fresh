import axios from 'axios';
import { API_BASE_URL } from '@/config/env';

let refreshPromise: Promise<string | null> | null = null;

function parseTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when access token is missing or expires within `bufferMs`. */
export function tokenNeedsRefresh(
  token: string | null | undefined,
  bufferMs = 2 * 60 * 1000
): boolean {
  if (!token) return true;
  const expMs = parseTokenExpiryMs(token);
  if (!expMs) return true;
  return Date.now() >= expMs - bufferMs;
}

/** Refresh admin access token using the stored refresh token. */
export async function refreshAdminAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const stored = localStorage.getItem('admin_refresh_token');
  if (!stored) return null;

  refreshPromise = (async () => {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken: stored,
        refresh_token: stored,
      });
      const payload = data?.data ?? data;
      const tokens = payload?.tokens ?? payload;
      const accessToken = tokens?.accessToken || tokens?.access_token;
      const refreshToken = tokens?.refreshToken || tokens?.refresh_token;
      if (!accessToken) return null;

      localStorage.setItem('admin_token', accessToken);
      if (refreshToken) {
        localStorage.setItem('admin_refresh_token', refreshToken);
      }
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

/** Return a valid access token, refreshing proactively when near expiry. */
export async function getValidAdminAccessToken(): Promise<string | null> {
  const current = localStorage.getItem('admin_token');
  if (!tokenNeedsRefresh(current)) return current;
  return refreshAdminAccessToken();
}
