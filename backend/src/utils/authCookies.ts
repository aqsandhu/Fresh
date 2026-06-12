import { Request, Response } from 'express';

const ACCESS_COOKIE = 'token';
const REFRESH_COOKIE = 'refreshToken';

type SameSiteOption = 'lax' | 'strict' | 'none';

/**
 * SameSite is env-configurable because the admin SPA may live on a different
 * site than the API (e.g. *.vercel.app → *.onrender.com). Cookie auth across
 * sites needs SameSite=None; same-site deployments should keep the stricter
 * Lax default. AUTH_COOKIE_DOMAIN lets subdomain deployments share the
 * cookie (e.g. ".freshbazar.pk" for admin. + api.).
 */
function resolveSameSite(): SameSiteOption {
  const raw = (process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase();
  return raw === 'strict' || raw === 'none' ? raw : 'lax';
}

function resolveCookieDomain(): string | undefined {
  return process.env.AUTH_COOKIE_DOMAIN || undefined;
}

function cookieOptions(maxAgeMs: number, path = '/') {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = resolveSameSite();
  return {
    httpOnly: true,
    // Browsers reject SameSite=None without Secure.
    secure: isProd || sameSite === 'none',
    sameSite,
    maxAge: maxAgeMs,
    path,
    ...(resolveCookieDomain() ? { domain: resolveCookieDomain() } : {}),
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
  const domain = resolveCookieDomain();
  res.clearCookie(ACCESS_COOKIE, { path: '/', ...(domain ? { domain } : {}) });
  res.clearCookie(REFRESH_COOKIE, {
    path: '/api/auth/refresh',
    ...(domain ? { domain } : {}),
  });
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

/**
 * Admin panel cookie mode is opt-in via ADMIN_AUTH_COOKIES=true (set the
 * matching VITE_AUTH_COOKIES=true on the panel). Kept behind its own flag so
 * the existing bearer-token deployment keeps working until the operator
 * aligns domains / SameSite for the cross-site SPA.
 */
export function adminCookiesEnabled(): boolean {
  return process.env.ADMIN_AUTH_COOKIES === 'true';
}

export function isAdminCookieClient(req: Pick<Request, 'get'>): boolean {
  return adminCookiesEnabled() && req.get('x-client-platform') === 'admin';
}

/** Any browser client whose session lives in HttpOnly cookies. */
export function isCookieAuthClient(req: Pick<Request, 'get'>): boolean {
  return isWebsiteCookieClient(req) || isAdminCookieClient(req);
}

/** Remove JWT strings from JSON when the browser uses HttpOnly cookies. */
export function stripTokensFromAuthData<T extends Record<string, unknown>>(
  req: Pick<Request, 'get'>,
  data: T
): T {
  if (!isCookieAuthClient(req)) return data;
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
