// ============================================================================
// ADMIN COOKIE → ONLY FROM THE ADMIN PANEL (N8, session 10)
//
// The admin panel's session lives in HttpOnly SameSite=Strict cookies on the
// API host. The website (freshbazar.pk) and the API (api.freshbazar.pk) are the
// same *site*, so a browser that is signed in to the panel also sends those
// cookies on a request made from the website — and CORS lets the website read
// the answer. Harmless while the website runs only our code; but one injected
// script there (XSS) could then act as the admin, or fetch a socket token.
//
// With ADMIN_PANEL_ORIGIN set (e.g. https://admin.freshbazar.pk, comma-separate
// more than one), a request that asks for the admin cookie session
// (X-Client-Platform: admin-cookie) is refused when the browser says it came
// from anywhere else. Not set = the old behaviour, nothing changes.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { isAdminCookieClient } from '../utils/authCookies';
import logger from '../utils/logger';

const normalise = (o: string): string => o.trim().toLowerCase().replace(/\/+$/, '');

/** The admin panel address(es) from ADMIN_PANEL_ORIGIN; [] when not set. */
export function allowedAdminOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return String(env.ADMIN_PANEL_ORIGIN || '')
    .split(',')
    .map(normalise)
    .filter(Boolean);
}

/** "https://a.b/c?d" → "https://a.b"; anything unparseable → null. */
function originOfUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function adminCookieOriginGuard(req: Request, res: Response, next: NextFunction): void {
  const allowed = allowedAdminOrigins();
  if (allowed.length === 0 || !isAdminCookieClient(req)) return next();
  // A browser always sends Origin on the panel's cross-origin calls. No Origin
  // and no Referer = not a browser page (curl, a server) — the cookie threat
  // this guards against does not exist there, and such a caller could fake the
  // header anyway.
  const origin = req.get('origin') || originOfUrl(req.get('referer'));
  if (!origin) return next();
  if (allowed.includes(normalise(origin))) return next();
  logger.warn('Admin cookie request from another origin refused', { origin, path: req.originalUrl, requestId: req.requestId });
  res.status(403).json({ success: false, message: 'This request did not come from the admin panel.' });
}
