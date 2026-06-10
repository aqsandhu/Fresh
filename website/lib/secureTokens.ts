import { usesHttpOnlyCookies } from '@/lib/authConfig';

const ACCESS_KEY = 'freshbazar_token';
const REFRESH_KEY = 'freshbazar_refresh_token';

/** Legacy dev fallback only — not used when HttpOnly cookies are enabled. */
export function getAccessToken(): string | null {
  if (usesHttpOnlyCookies()) return null;
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (usesHttpOnlyCookies()) return null;
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(REFRESH_KEY);
}

export function storeTokens(accessToken: string, refreshToken?: string | null): void {
  if (usesHttpOnlyCookies()) return;
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) {
    sessionStorage.setItem(REFRESH_KEY, refreshToken);
  }
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
}
