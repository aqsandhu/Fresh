/**
 * Runtime env for admin panel — works in Vite (via define) and Jest (via process.env).
 * Avoids import.meta in source so Jest can parse modules without Vite transforms.
 */
export const API_BASE_URL =
  process.env.VITE_API_URL || 'http://localhost:3000/api';

export const IS_DEV = process.env.NODE_ENV !== 'production';

export const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export const BACKEND_HOST = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * HttpOnly-cookie auth mode (XSS-hardening): tokens never touch
 * localStorage; the session lives in HttpOnly cookies set by the backend.
 * Requires ADMIN_AUTH_COOKIES=true on the backend, and (when the panel and
 * API are on different sites) AUTH_COOKIE_SAMESITE=none there too.
 * Default off so existing bearer-token deployments keep working.
 */
export const AUTH_COOKIES_ENABLED = process.env.VITE_AUTH_COOKIES === 'true';
