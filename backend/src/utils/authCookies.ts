import { Request, Response } from 'express';

const ACCESS_COOKIE = 'token';
const REFRESH_COOKIE = 'refreshToken';

function cookieOptions(maxAgeMs: number, path = '/') {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    maxAge: maxAgeMs,
    path,
  };
}

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// The website assumes HttpOnly-cookie auth in production (see
// website/lib/authConfig.ts), so cookies must default ON there — otherwise a
// missing env var silently breaks login. Explicit env always wins:
// AUTH_HTTPONLY_COOKIES (specific) over CORS_CREDENTIALS (general).
export function shouldUseAuthCookies(): boolean {
  if (process.env.AUTH_HTTPONLY_COOKIES !== undefined) {
    return process.env.AUTH_HTTPONLY_COOKIES === 'true';
  }
  if (process.env.CORS_CREDENTIALS !== undefined) {
    return process.env.CORS_CREDENTIALS === 'true';
  }
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string }
): void {
  if (!shouldUseAuthCookies()) return;

  res.cookie(ACCESS_COOKIE, tokens.accessToken, cookieOptions(ACCESS_MAX_AGE_MS, '/'));
  res.cookie(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(REFRESH_MAX_AGE_MS, '/api/auth/refresh')
  );
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth/refresh' });
}

export function getRefreshTokenFromRequest(req: {
  body?: { refreshToken?: string; refresh_token?: string };
  cookies?: Record<string, string>;
}): string | undefined {
  return (
    req.body?.refreshToken ||
    req.body?.refresh_token ||
    req.cookies?.[REFRESH_COOKIE]
  );
}

export function isWebsiteCookieClient(req: Pick<Request, 'get'>): boolean {
  return shouldUseAuthCookies() && req.get('x-client-platform') === 'website';
}

/** Remove JWT strings from JSON when the browser uses HttpOnly cookies. */
export function stripTokensFromAuthData<T extends Record<string, unknown>>(
  req: Pick<Request, 'get'>,
  data: T
): T {
  if (!isWebsiteCookieClient(req)) return data;
  if (!('tokens' in data)) return data;
  const { tokens: _removed, ...rest } = data;
  return rest as T;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (key) acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}
