import type { BrowserSessionStorageOptions, TokenStorage } from './types';

function storageEnabled(options: BrowserSessionStorageOptions): boolean {
  if (typeof window === 'undefined') return false;
  return options.isStorageEnabled?.() ?? true;
}

export function createBrowserSessionTokenStorage(
  options: BrowserSessionStorageOptions
): TokenStorage {
  const { accessKey, refreshKey, legacyLocalStorageKeys = [] } = options;

  return {
    async getAccessToken() {
      if (!storageEnabled(options)) return null;
      return window.sessionStorage.getItem(accessKey);
    },

    async getRefreshToken() {
      if (!storageEnabled(options)) return null;
      return window.sessionStorage.getItem(refreshKey);
    },

    async storeTokens(accessToken: string, refreshToken?: string | null) {
      if (!storageEnabled(options)) return;
      window.sessionStorage.setItem(accessKey, accessToken);
      if (refreshToken) {
        window.sessionStorage.setItem(refreshKey, refreshToken);
      }
    },

    async clearTokens() {
      if (typeof window === 'undefined') return;
      window.sessionStorage.removeItem(accessKey);
      window.sessionStorage.removeItem(refreshKey);
      for (const key of legacyLocalStorageKeys) {
        window.localStorage.removeItem(key);
      }
    },
  };
}

/** Sync read helpers for Next.js callers that expect synchronous token access. */
export function readBrowserAccessToken(
  options: BrowserSessionStorageOptions
): string | null {
  if (!storageEnabled(options)) return null;
  return window.sessionStorage.getItem(options.accessKey);
}

export function readBrowserRefreshToken(
  options: BrowserSessionStorageOptions
): string | null {
  if (!storageEnabled(options)) return null;
  return window.sessionStorage.getItem(options.refreshKey);
}

export function writeBrowserTokens(
  options: BrowserSessionStorageOptions,
  accessToken: string,
  refreshToken?: string | null
): void {
  if (!storageEnabled(options)) return;
  window.sessionStorage.setItem(options.accessKey, accessToken);
  if (refreshToken) {
    window.sessionStorage.setItem(options.refreshKey, refreshToken);
  }
}

export function clearBrowserTokens(options: BrowserSessionStorageOptions): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(options.accessKey);
  window.sessionStorage.removeItem(options.refreshKey);
  for (const key of options.legacyLocalStorageKeys ?? []) {
    window.localStorage.removeItem(key);
  }
}
