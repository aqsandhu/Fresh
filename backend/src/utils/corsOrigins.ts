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
