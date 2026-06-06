import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { getStoredRefreshToken, storeTokens } from './secureTokens';

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refreshes the rider access token using the stored refresh token.
 * De-dupes concurrent calls so only one refresh request is in flight.
 */
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

      const { useAuthStore } = require('../store/authStore');
      useAuthStore.setState({ token: accessToken, isAuthenticated: true });

      return accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
