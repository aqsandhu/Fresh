import axios from 'axios';
import { API_BASE_URL, AUTH_COOKIES_ENABLED } from '@/config/env';

/** Non-JWT sentinel returned in cookie mode (the real token is HttpOnly). */
export const COOKIE_SESSION = 'cookie-session';

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

/**
 * Refresh the admin session.
 * - Bearer mode: rotates via the stored refresh token, returns the new JWT.
 * - Cookie mode: the refresh token is an HttpOnly cookie — POST with
 *   credentials and let the backend rotate the cookies. Returns the
 *   COOKIE_SESSION sentinel on success (there is no readable token).
 */
export async function refreshAdminAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  if (AUTH_COOKIES_ENABLED) {
    refreshPromise = (async () => {
      try {
        const { data } = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true, headers: { 'X-Client-Platform': 'admin' } }
        );
        return data?.success ? COOKIE_SESSION : null;
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

/**
 * Token usable for the Socket.IO handshake (and other JS-side consumers).
 * - Bearer mode: the access token from storage, refreshed when near expiry.
 * - Cookie mode: JS can't read the HttpOnly cookie, so mint a short-lived
 *   handshake token via the cookie-authenticated /auth/socket-token route
 *   (same flow the website uses). Retries once behind a cookie refresh.
 */
export async function getValidAdminAccessToken(): Promise<string | null> {
  if (AUTH_COOKIES_ENABLED) {
    const fetchSocketToken = async (): Promise<string | null> => {
      const { data } = await axios.get(`${API_BASE_URL}/auth/socket-token`, {
        withCredentials: true,
        headers: { 'X-Client-Platform': 'admin' },
      });
      return data?.data?.token ?? null;
    };
    try {
      return await fetchSocketToken();
    } catch {
      const refreshed = await refreshAdminAccessToken();
      if (!refreshed) return null;
      try {
        return await fetchSocketToken();
      } catch {
        return null;
      }
    }
  }

  const current = localStorage.getItem('admin_token');
  if (!tokenNeedsRefresh(current)) return current;
  return refreshAdminAccessToken();
}
