/**
 * Website uses HttpOnly cookies when enabled (default in production).
 * Tokens never touch sessionStorage/localStorage or in-memory auth state.
 * Set NEXT_PUBLIC_AUTH_COOKIES=false only for local dev without CORS_CREDENTIALS.
 */
export function usesHttpOnlyCookies(): boolean {
  if (process.env.NEXT_PUBLIC_AUTH_COOKIES === 'false') return false;
  if (process.env.NEXT_PUBLIC_AUTH_COOKIES === 'true') return true;
  return process.env.NODE_ENV === 'production';
}
