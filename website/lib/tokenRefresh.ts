import {
  createTokenRefreshService,
  tokenNeedsRefresh as coreTokenNeedsRefresh,
} from '@freshbazar/core-auth';
import { useAuthStore } from '@/store/cartStore';
import { usesHttpOnlyCookies } from '@/lib/authConfig';
import { clearTokens, getAccessToken, getRefreshToken, tokenStorage } from '@/lib/secureTokens';
import { getApiBaseUrl } from '@/lib/apiBase';

// Same-origin '/api' in the browser so the refresh cookie (SameSite=Lax,
// path=/api/auth/refresh) is actually sent. See lib/apiBase.ts.
const API_BASE_URL = getApiBaseUrl();

function handleRefreshFailed(): void {
  clearTokens();
  useAuthStore.getState().logout();
}

function handleTokensRefreshed(accessToken: string): void {
  if (usesHttpOnlyCookies() || !accessToken) return;

  const refreshToken =
    useAuthStore.getState().refreshToken || getRefreshToken() || undefined;
  useAuthStore.setState({
    accessToken,
    refreshToken,
    isAuthenticated: true,
  });
}

const refreshService = createTokenRefreshService({
  apiBaseUrl: API_BASE_URL,
  storage: tokenStorage,
  withCredentials: true,
  getExtraHeaders: () => ({ 'X-Client-Platform': 'website' }),
  cookieOnlyRefresh: usesHttpOnlyCookies,
  shouldRefresh: () => {
    if (usesHttpOnlyCookies()) {
      return useAuthStore.getState().isAuthenticated;
    }
    return !!(getRefreshToken() || useAuthStore.getState().refreshToken);
  },
  resolveRefreshToken: () =>
    getRefreshToken() || useAuthStore.getState().refreshToken,
  onTokenRefreshed: handleTokensRefreshed,
  onRefreshFailed: handleRefreshFailed,
});

export function tokenNeedsRefresh(
  token: string | null | undefined,
  bufferMs = 2 * 60 * 1000
): boolean {
  if (usesHttpOnlyCookies()) return false;
  return coreTokenNeedsRefresh(token, bufferMs);
}

/** Refresh session — HttpOnly cookies updated server-side when cookie auth is on. */
export async function refreshWebsiteAccessToken(): Promise<boolean> {
  if (usesHttpOnlyCookies() && !useAuthStore.getState().isAuthenticated) {
    return false;
  }

  const result = await refreshService.refreshAccessToken();
  return result !== null;
}

/** Bearer token for legacy dev mode only. */
export async function getValidAccessToken(): Promise<string | null> {
  if (usesHttpOnlyCookies()) return null;
  const current = useAuthStore.getState().accessToken || getAccessToken();
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
