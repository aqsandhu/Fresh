export interface TokenStorage {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  storeTokens(accessToken: string, refreshToken?: string | null): Promise<void>;
  setAccessToken?(accessToken: string): Promise<void>;
  clearTokens(): Promise<void>;
}

/** Minimal SecureStore surface — injected by Expo apps (no expo dependency here). */
export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface SessionHandlers {
  onClear: () => void;
  onTokenUpdate: (token: string) => void;
}

export interface ParsedTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface TokenRefreshConfig {
  apiBaseUrl: string;
  storage: TokenStorage;
  onTokenRefreshed?: (accessToken: string) => void;
  onRefreshFailed?: () => void;
  getExtraHeaders?: () => Record<string, string>;
  withCredentials?: boolean;
  /** Override refresh token source (e.g. in-memory auth store fallback). */
  resolveRefreshToken?: () => Promise<string | null> | string | null;
  /** Skip refresh when false (e.g. logged out or cookie-only guard). */
  shouldRefresh?: () => boolean | Promise<boolean>;
  /** POST with credentials only — tokens live in HttpOnly cookies. */
  cookieOnlyRefresh?: () => boolean;
  parseResponse?: (data: unknown) => ParsedTokens | null;
}

export interface TokenRefreshService {
  refreshAccessToken: () => Promise<string | null>;
  getValidAccessToken: () => Promise<string | null>;
  tokenNeedsRefresh: (
    token: string | null | undefined,
    bufferMs?: number
  ) => boolean;
  parseTokenExpiryMs: (token: string) => number | null;
}

export interface ExpoSecureStorageKeys {
  accessToken: string;
  refreshToken: string;
}

export interface BrowserSessionStorageOptions {
  accessKey: string;
  refreshKey: string;
  isStorageEnabled?: () => boolean;
  /** Extra keys cleared on logout (legacy localStorage entries). */
  legacyLocalStorageKeys?: string[];
}
