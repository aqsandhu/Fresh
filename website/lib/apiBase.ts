/**
 * API base URL resolution.
 *
 * Browser code must call the same-origin `/api` path — next.config.js (and
 * vercel.json) rewrite it to the backend. That keeps requests first-party, so
 * CORS never applies and the HttpOnly SameSite=Lax auth cookies are stored and
 * sent. Calling the backend host directly from the browser is cross-site
 * (onrender.com is a different site than freshbazar.pk), where browsers refuse
 * to store or send Lax cookies — login breaks silently.
 *
 * Server-side code (SSR, route handlers) cannot fetch a relative path, so it
 * keeps the absolute backend URL. The `/api` rewrite also does not cover
 * non-API assets (/uploads images) or WebSockets — those must keep using the
 * absolute host (see lib/utils.ts BACKEND_HOST and lib/socket.ts).
 */
export const ABSOLUTE_API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

export function getApiBaseUrl(): string {
  return typeof window === 'undefined' ? ABSOLUTE_API_URL : '/api'
}
