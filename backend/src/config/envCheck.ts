// ============================================================================
// ENVIRONMENT CHECK — one place that reads the configuration at boot and says
// clearly what is wrong, before the server takes traffic.
//
// Why it matters here: most limits are read as `Number(process.env.X || n)`.
// A typo such as APPROVAL_VALUE_THRESHOLD=5k becomes NaN, every comparison
// with NaN is false, and the second-admin rule silently switches OFF. The same
// goes for the price-cut limit, ledger back-dating, watchdog thresholds …
//
//   production   any ERROR stops the boot (the process exits with the list)
//   other modes  errors are logged as warnings so local work is not blocked
// ============================================================================

import logger from '../utils/logger';

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

/** Settings that must be a number when they are set at all (min, and whether 0 is allowed). */
const NUMBERS: Record<string, { min?: number; integer?: boolean }> = {
  PORT: { min: 1, integer: true },
  APPROVAL_VALUE_THRESHOLD: { min: 0 },
  STOCK_APPROVAL_VALUE_THRESHOLD: { min: 0 },
  PRICE_CUT_LIMIT_PCT: { min: 0 },
  LEDGER_BACKDATE_DAYS: { min: 0 },
  WEIGHT_BIAS_ALERT_VALUE: { min: 0 },
  WEIGHT_BIAS_WINDOW_DAYS: { min: 1 },
  PURCHASE_WASTE_ALERT_PCT: { min: 0 },
  PURCHASE_RATE_ALERT_PCT: { min: 0 },
  STOCK_COUNT_ALERT_VALUE: { min: 0 },
  OCP_CASH_OVERDUE_DAYS: { min: 1 },
  COUPON_MAX_PERCENT_NON_SUPER: { min: 0 },
  COUPON_MAX_RS_NON_SUPER: { min: 0 },
  COUPON_MAX_USES_NON_SUPER: { min: 0 },
  REFRESH_MAX_PER_IP: { min: 1 },
  RATE_LIMIT_WINDOW_MS: { min: 1000 },
  RATE_LIMIT_MAX_REQUESTS: { min: 1 },
  AUTH_RATE_LIMIT_WINDOW_MS: { min: 1000 },
  AUTH_RATE_LIMIT_MAX_REQUESTS: { min: 1 },
  REGISTER_RATE_LIMIT_MAX: { min: 1 },
  OTP_RATE_LIMIT_MAX: { min: 1 },
  OTP_TTL_SECONDS: { min: 30, integer: true },
  OTP_RESEND_COOLDOWN_SECONDS: { min: 0, integer: true },
  OTP_MAX_ATTEMPTS: { min: 1, integer: true },
  OTP_MAX_SENDS_PER_PHONE_HOUR: { min: 1, integer: true },
  OTP_MAX_SENDS_PER_IP_HOUR: { min: 1, integer: true },
  DB_POOL_MAX: { min: 1, integer: true },
  DB_POOL_MIN: { min: 0, integer: true },
  DB_POOL_MAX_CAP: { min: 1, integer: true },
  MAX_FILE_SIZE: { min: 1 },
  AI_CHAT_DAILY_LIMIT: { min: 0, integer: true },
  API_MAX_PER_IP: { min: 1, integer: true },
  PRODUCT_MAX_PER_IP: { min: 1, integer: true },
  SEARCH_MAX_PER_IP: { min: 1, integer: true },
  AUDIT_AI_TIMEOUT_MS: { min: 1000 },
  RESTAURANT_DUPLICATE_WINDOW_SEC: { min: 1 },
  FREE_DELIVERY_MIN_AMOUNT: { min: 0 },
  DEFAULT_DELIVERY_CHARGE: { min: 0 },
  SENTRY_TRACES_RATE: { min: 0 },
};

/** Settings that are switches: only "true" or "false" mean anything. */
const SWITCHES = [
  'OTP_BYPASS_ENABLED', 'ADMIN_2FA_ENABLED', 'SCHEMA_SELF_HEAL', 'DB_SSL', 'DB_SSL_REJECT_UNAUTHORIZED', 'CORS_CREDENTIALS',
  'AUTH_HTTPONLY_COOKIES', 'ADMIN_AUTH_COOKIES', 'WEBHOOK_ALLOW_UNSIGNED', 'MIGRATIONS_ALLOW_EDITED',
  'LEGACY_PASSWORD_REGISTER',
];

/** "15m" / "8h" / "30d" / "90s" / "3600" (seconds) → seconds; anything else → null. */
export function durationSeconds(value: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(s|m|h|d)?\s*$/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[unit];
}

export function checkEnvironment(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === 'production';
  const set = (k: string) => typeof env[k] === 'string' && env[k]!.trim() !== '';

  for (const [key, rule] of Object.entries(NUMBERS)) {
    if (!set(key)) continue;
    const raw = env[key]!.trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errors.push(`${key}="${raw}" is not a number.`);
    } else if (rule.integer && !Number.isInteger(n)) {
      errors.push(`${key}="${raw}" must be a whole number.`);
    } else if (rule.min !== undefined && n < rule.min) {
      errors.push(`${key}=${raw} is below the smallest allowed value (${rule.min}).`);
    }
  }
  for (const key of SWITCHES) {
    if (set(key) && !['true', 'false'].includes(env[key]!.trim())) {
      errors.push(`${key}="${env[key]}" must be "true" or "false".`);
    }
  }

  // ── what production cannot run without ──
  if (production) {
    if (!set('DATABASE_URL') && !set('DB_HOST')) errors.push('DATABASE_URL is not set.');
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
      if (!set(key)) errors.push(`${key} is not set.`);
      else if (env[key]!.length < 32) errors.push(`${key} is too short (${env[key]!.length} characters; use at least 32 random characters).`);
    }
    if (set('JWT_SECRET') && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different.');
    }
    if (!set('CORS_ORIGIN') && !set('CORS_EXTRA_ORIGINS')) {
      errors.push('CORS_ORIGIN is not set — the website and admin panel addresses must be listed.');
    }
    if (set('METRICS_TOKEN') && env.METRICS_TOKEN!.length < 24) {
      errors.push(`METRICS_TOKEN is too short (${env.METRICS_TOKEN!.length} characters; use at least 24 random characters) — it guards /metrics.`);
    }
    if (env.WEBHOOK_ALLOW_UNSIGNED === 'true') {
      errors.push('WEBHOOK_ALLOW_UNSIGNED=true turns off payment-webhook signature checks; it is for local testing only.');
    }
    // Worth knowing, not worth refusing to start.
    if (set('ADMIN_PANEL_ORIGIN')) {
      // A wrong address only blocks the admin panel's own calls — warn, so the
      // log says why, instead of refusing to start the whole shop.
      const bad = env.ADMIN_PANEL_ORIGIN!.split(',').map((o) => o.trim()).filter((o) => o && !/^https?:\/\/[^/\s]+\/?$/i.test(o));
      if (bad.length) warnings.push(`ADMIN_PANEL_ORIGIN has ${bad.map((b) => `"${b}"`).join(', ')} — each entry must be just an address like https://admin.freshbazar.pk (no path). The admin panel is refused until it matches.`);
    } else if (env.ADMIN_AUTH_COOKIES !== 'false') {
      warnings.push('ADMIN_PANEL_ORIGIN is not set — admin cookie sessions are accepted from any same-site page (set it to https://admin.<your-site>).');
    }
    if (env.OTP_BYPASS_ENABLED === 'true') warnings.push('OTP_BYPASS_ENABLED=true — the fixed code signs anyone in (customers AND the admin second step).');
    if (!set('REDIS_URL')) warnings.push('REDIS_URL is not set — rate limits and lockouts reset on every restart and are not shared between instances.');
    if (!set('SENTRY_DSN')) warnings.push('SENTRY_DSN is not set — server errors are only in the logs, nobody is alerted.');
    if (!set('SUPABASE_SERVICE_ROLE_KEY')) warnings.push('SUPABASE_SERVICE_ROLE_KEY is not set — image uploads will fail.');
    if (!set('AUDIT_AI_SECRET')) warnings.push('AUDIT_AI_SECRET is not set — the AI Audit and AI chat keys are encrypted with JWT_SECRET; rotating that secret makes the saved keys unreadable.');
    // Token lifetimes: the admin access token sits in the browser, so a long
    // one turns a stolen token into days of access (old .env.example had 8h/30d).
    const tooLong = (key: string, maxSeconds: number) => {
      const secs = set(key) ? durationSeconds(env[key]!) : null;
      if (secs !== null && secs > maxSeconds) warnings.push(`${key}=${env[key]} is long — a stolen token stays usable that long (recommended: ${key.includes('REFRESH') ? '8h' : '15m'}).`);
    };
    tooLong('ADMIN_JWT_EXPIRES_IN', 60 * 60);
    tooLong('ADMIN_JWT_REFRESH_EXPIRES_IN', 24 * 60 * 60);
    tooLong('JWT_EXPIRES_IN', 60 * 60);
  }
  return { errors, warnings };
}

/** Log the report; in production stop the process when anything is wrong. */
export function enforceEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const { errors, warnings } = checkEnvironment(env);
  for (const w of warnings) logger.warn(`Config: ${w}`);
  if (errors.length === 0) return;
  if (env.NODE_ENV === 'production') {
    logger.error(`Configuration is invalid — the server will not start:\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }
  for (const e of errors) logger.warn(`Config (would stop a production start): ${e}`);
}
