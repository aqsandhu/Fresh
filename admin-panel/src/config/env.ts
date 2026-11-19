/**
 * Runtime env for admin panel — works in Vite (via define) and Jest (via process.env).
 * Avoids import.meta in source so Jest can parse modules without Vite transforms.
 */
const RAW_API_URL = process.env.VITE_API_URL;

// Fail fast: a production bundle must never silently fall back to localhost —
// that misconfiguration used to ship and only surfaced as broken API calls.
if (!RAW_API_URL && process.env.NODE_ENV === 'production') {
  throw new Error(
    '[Fresh Bazar Admin] VITE_API_URL is not set. Set it to the deployed API ' +
      'base URL (e.g. https://api.example.com/api) and rebuild — production ' +
      'builds refuse to fall back to localhost.'
  );
}

export const API_BASE_URL = RAW_API_URL || 'http://localhost:3000/api';

export const IS_DEV = process.env.NODE_ENV !== 'production';

export const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export const BACKEND_HOST = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * Is the API on the same site as this page (admin.example.pk + api.example.pk)?
 * Only then does the browser send the API's SameSite cookies with our calls.
 * localhost is left out: local development keeps the simple bearer mode.
 */
export function isSameSiteAsApi(pageHost: string, apiUrl: string): boolean {
  let apiHost: string;
  try {
    apiHost = new URL(apiUrl).hostname;
  } catch {
    return false;
  }
  const local = (h: string) => h === 'localhost' || /^[0-9.]+$/.test(h) || !h.includes('.');
  if (local(pageHost) || local(apiHost)) return false;
  const parent = (h: string) => h.split('.').slice(1).join('.');
  const a = parent(pageHost);
  return a.includes('.') && a === parent(apiHost);
}

/**
 * HttpOnly-cookie auth mode: the session lives in HttpOnly cookies set by the
 * API, so no token is in localStorage for an injected script to steal.
 * - VITE_AUTH_COOKIES=true / false forces it.
 * - Otherwise it is ON when this page and the API share a site (production:
 *   admin.freshbazar.pk + api.freshbazar.pk) and OFF elsewhere (a Vercel
 *   preview on *.vercel.app, local development), where the cookies would not
 *   be sent and bearer tokens are used as before.
 */
export function resolveCookieMode(flag: string | undefined, pageHost: string | undefined, apiUrl: string): boolean {
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return pageHost ? isSameSiteAsApi(pageHost, apiUrl) : false;
}

export const AUTH_COOKIES_ENABLED = resolveCookieMode(
  process.env.VITE_AUTH_COOKIES,
  typeof window !== 'undefined' ? window.location.hostname : undefined,
  API_BASE_URL
);

/** Tells the API which kind of session this panel uses (it answers with cookies only for "admin-cookie"). */
export const CLIENT_PLATFORM = AUTH_COOKIES_ENABLED ? 'admin-cookie' : 'admin';
