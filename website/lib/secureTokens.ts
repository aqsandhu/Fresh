import {
  clearBrowserTokens,
  createBrowserSessionTokenStorage,
  readBrowserAccessToken,
  readBrowserRefreshToken,
  writeBrowserTokens,
  type BrowserSessionStorageOptions,
} from '@freshbazar/core-auth';
import { usesHttpOnlyCookies } from '@/lib/authConfig';

const BROWSER_STORAGE_OPTIONS: BrowserSessionStorageOptions = {
  accessKey: 'freshbazar_token',
  refreshKey: 'freshbazar_refresh_token',
  isStorageEnabled: () => !usesHttpOnlyCookies(),
  legacyLocalStorageKeys: ['token', 'refreshToken'],
};

export const tokenStorage = createBrowserSessionTokenStorage(BROWSER_STORAGE_OPTIONS);

/** Legacy dev fallback only — not used when HttpOnly cookies are enabled. */
export function getAccessToken(): string | null {
  return readBrowserAccessToken(BROWSER_STORAGE_OPTIONS);
}

export function getRefreshToken(): string | null {
  return readBrowserRefreshToken(BROWSER_STORAGE_OPTIONS);
}

export function storeTokens(accessToken: string, refreshToken?: string | null): void {
  writeBrowserTokens(BROWSER_STORAGE_OPTIONS, accessToken, refreshToken);
}

export function clearTokens(): void {
  clearBrowserTokens(BROWSER_STORAGE_OPTIONS);
}
