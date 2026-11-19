// A typo in a limit must stop a production start instead of silently turning a
// control off (Number('5k') is NaN, and every comparison with NaN is false).
import { checkEnvironment } from '../../src/config/envCheck';

const good = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@host:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  CORS_ORIGIN: 'https://freshbazar.example',
  REDIS_URL: 'redis://localhost:6379',
  SENTRY_DSN: 'https://x@sentry.example/1',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUDIT_AI_SECRET: 's'.repeat(32),
  ADMIN_PANEL_ORIGIN: 'https://admin.freshbazar.example',
} as NodeJS.ProcessEnv;

describe('checkEnvironment', () => {
  it('a complete production config has no errors and no warnings', () => {
    expect(checkEnvironment(good)).toEqual({ errors: [], warnings: [] });
  });

  it('a limit that is not a number is an error (it would turn the control off)', () => {
    const r = checkEnvironment({ ...good, APPROVAL_VALUE_THRESHOLD: '5k', PRICE_CUT_LIMIT_PCT: '-3' });
    expect(r.errors.join(' ')).toMatch(/APPROVAL_VALUE_THRESHOLD="5k" is not a number/);
    expect(r.errors.join(' ')).toMatch(/PRICE_CUT_LIMIT_PCT=-3 is below/);
  });

  it('switches accept only true / false', () => {
    expect(checkEnvironment({ ...good, OTP_BYPASS_ENABLED: 'yes' }).errors.join(' ')).toMatch(/OTP_BYPASS_ENABLED="yes"/);
  });

  it('production needs strong, different secrets, a database and CORS origins', () => {
    const r = checkEnvironment({ ...good, JWT_SECRET: 'short', JWT_REFRESH_SECRET: 'short', DATABASE_URL: '', CORS_ORIGIN: '' });
    const text = r.errors.join(' ');
    expect(text).toMatch(/JWT_SECRET is too short/);
    expect(text).toMatch(/must be different/);
    expect(text).toMatch(/DATABASE_URL is not set/);
    expect(text).toMatch(/CORS_ORIGIN is not set/);
  });

  it('unsigned payment webhooks are refused in production', () => {
    expect(checkEnvironment({ ...good, WEBHOOK_ALLOW_UNSIGNED: 'true' }).errors.join(' ')).toMatch(/WEBHOOK_ALLOW_UNSIGNED/);
  });

  it('missing operational services are warnings, not errors', () => {
    const r = checkEnvironment({ ...good, REDIS_URL: '', SENTRY_DSN: '', OTP_BYPASS_ENABLED: 'true' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(3);
  });

  it('long admin / customer token lifetimes are warned about (old .env.example had 8h / 30d)', () => {
    const r = checkEnvironment({ ...good, ADMIN_JWT_EXPIRES_IN: '8h', ADMIN_JWT_REFRESH_EXPIRES_IN: '30d', JWT_EXPIRES_IN: '7d' });
    expect(r.errors).toEqual([]);
    const text = r.warnings.join(' ');
    expect(text).toMatch(/ADMIN_JWT_EXPIRES_IN=8h is long/);
    expect(text).toMatch(/ADMIN_JWT_REFRESH_EXPIRES_IN=30d is long/);
    expect(text).toMatch(/JWT_EXPIRES_IN=7d is long/);
    expect(checkEnvironment({ ...good, ADMIN_JWT_EXPIRES_IN: '15m', ADMIN_JWT_REFRESH_EXPIRES_IN: '8h', JWT_EXPIRES_IN: '15m' }).warnings.join(' ')).not.toMatch(/is long/);
  });

  it('ADMIN_PANEL_ORIGIN (N8): missing or not a bare address is a warning, never a refusal to start', () => {
    const missing = checkEnvironment({ ...good, ADMIN_PANEL_ORIGIN: '' });
    expect(missing.errors).toEqual([]);
    expect(missing.warnings.join(' ')).toMatch(/ADMIN_PANEL_ORIGIN is not set/);
    const withPath = checkEnvironment({ ...good, ADMIN_PANEL_ORIGIN: 'https://admin.freshbazar.example/admin/login' });
    expect(withPath.errors).toEqual([]);
    expect(withPath.warnings.join(' ')).toMatch(/must be just an address/);
    expect(checkEnvironment({ ...good, ADMIN_PANEL_ORIGIN: 'https://admin.freshbazar.example/, http://localhost:5173' }).warnings).toEqual([]);
    expect(checkEnvironment({ ...good, ADMIN_PANEL_ORIGIN: '', ADMIN_AUTH_COOKIES: 'false' }).warnings).toEqual([]);
  });

  it('outside production only the value checks apply', () => {
    expect(checkEnvironment({ NODE_ENV: 'development' })).toEqual({ errors: [], warnings: [] });
  });
});
