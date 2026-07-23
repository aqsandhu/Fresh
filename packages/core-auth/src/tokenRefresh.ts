import axios from 'axios';
import { parseTokenExpiryMs, tokenNeedsRefresh } from './tokenExpiry';
import type { ParsedTokens, TokenRefreshConfig, TokenRefreshService } from './types';

function defaultParseResponse(data: unknown): ParsedTokens | null {
  const payload = (data ?? {}) as Record<string, unknown>;
  const tokens = (payload.tokens ?? payload) as Record<string, unknown>;
  const accessToken = (tokens.accessToken || tokens.access_token) as string | undefined;
  const refreshToken = (tokens.refreshToken || tokens.refresh_token) as
    | string
    | undefined;
  if (!accessToken) return null;
  return { accessToken, refreshToken };
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/$/, '');
}

/**
 * Only a genuine auth rejection (401/403 from the refresh endpoint) should
 * trigger onRefreshFailed (forced logout). Transient failures — network
 * errors, timeouts, 5xx — must NOT log the user out; the caller just gets
 * null and can retry later.
 */
function isGenuineAuthFailure(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status === 401 || status === 403;
  }
  return false;
}

/**
 * Cookie-only refresh succeeds with an empty string (no bearer token in memory).
 * Bearer refresh returns the new access token, or null on failure.
 */
export function createTokenRefreshService(
  config: TokenRefreshConfig
): TokenRefreshService {
  let refreshPromise: Promise<string | null> | null = null;
  const parse = config.parseResponse ?? defaultParseResponse;

  async function refreshAccessToken(): Promise<string | null> {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        if (config.shouldRefresh) {
          const allowed = await config.shouldRefresh();
          if (!allowed) return null;
        }

        const cookieOnly = config.cookieOnlyRefresh?.() ?? false;
        const url = `${normalizeApiBaseUrl(config.apiBaseUrl)}/auth/refresh`;

        if (cookieOnly) {
          await axios.post(
            url,
            {},
            {
              withCredentials: config.withCredentials ?? true,
              headers: config.getExtraHeaders?.() ?? {},
            }
          );
          config.onTokenRefreshed?.('');
          return '';
        }

        const refreshToken = config.resolveRefreshToken
          ? await Promise.resolve(config.resolveRefreshToken())
          : await config.storage.getRefreshToken();

        if (!refreshToken) {
          config.onRefreshFailed?.();
          return null;
        }

        const { data } = await axios.post(
          url,
          { refreshToken, refresh_token: refreshToken },
          {
            withCredentials: config.withCredentials ?? false,
            headers: config.getExtraHeaders?.() ?? {},
          }
        );

        const parsed = parse(data?.data ?? data);
        if (!parsed?.accessToken) {
          config.onRefreshFailed?.();
          return null;
        }

        await config.storage.storeTokens(parsed.accessToken, parsed.refreshToken);
        config.onTokenRefreshed?.(parsed.accessToken);
        return parsed.accessToken;
      } catch (error) {
        if (isGenuineAuthFailure(error)) {
          config.onRefreshFailed?.();
        }
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function getValidAccessToken(): Promise<string | null> {
    if (config.cookieOnlyRefresh?.()) return null;

    const current = await config.storage.getAccessToken();
    if (!tokenNeedsRefresh(current)) return current;

    const refreshed = await refreshAccessToken();
    if (refreshed === '') {
      return config.storage.getAccessToken();
    }
    return refreshed;
  }

  return {
    refreshAccessToken,
    getValidAccessToken,
    tokenNeedsRefresh,
    parseTokenExpiryMs,
  };
}
