import axios from 'axios';
import { useAuthStore } from '@/store/cartStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

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

/** Refresh website access token using the stored refresh token. */
export async function refreshWebsiteAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const stored =
    (typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null) ||
    useAuthStore.getState().refreshToken;
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

      if (typeof window !== 'undefined') {
        localStorage.setItem('token', accessToken);
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }
      }

      useAuthStore.setState({
        accessToken,
        refreshToken: refreshToken || stored,
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

/** Return a valid access token, refreshing proactively when near expiry. */
export async function getValidAccessToken(): Promise<string | null> {
  const current =
    useAuthStore.getState().accessToken ||
    (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (!tokenNeedsRefresh(current)) return current;
  return refreshWebsiteAccessToken();
}
