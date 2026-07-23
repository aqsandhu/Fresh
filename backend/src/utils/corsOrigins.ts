/** Parse comma-separated CORS origins (trim slashes). */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/** Same origin list as HTTP CORS middleware (CORS_ORIGIN + CORS_EXTRA_ORIGINS). */
export function getAllowedOrigins(): string[] {
  return [
    ...parseOrigins(process.env.CORS_ORIGIN || 'http://localhost:3000'),
    ...parseOrigins(process.env.CORS_EXTRA_ORIGINS),
  ];
}

// Mirrors app.ts: the allowlist matches exactly, a '*' entry allows any origin,
// and non-production also accepts localhost/127.0.0.1 on any port.
const DEV_LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function isCorsOriginAllowed(origin: string): boolean {
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes('*')) return true;
  const normalized = origin.trim().replace(/\/$/, '');
  if (allowedOrigins.some((o) => o === normalized || o === origin)) return true;
  if ((process.env.NODE_ENV || 'development') !== 'production' && DEV_LOCALHOST.test(origin)) {
    return true;
  }
  return false;
}
