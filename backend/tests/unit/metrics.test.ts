// GET /metrics: Prometheus text, hidden without the token, ids folded into ":id".
import express from 'express';
import request from 'supertest';
import { metricsAuthorized, metricsMiddleware, recordJobFailure, renderMetrics, resetMetrics, routeLabel } from '../../src/utils/metrics';
import { checkEnvironment } from '../../src/config/envCheck';

beforeEach(() => resetMetrics());

describe('routeLabel', () => {
  it.each([
    ['/api/admin/orders/3f2a9c1e-1b2c-4d5e-8f90-123456789abc/status', 200, '/api/admin/orders/:id/status'],
    ['/api/products/42?page=2', 200, '/api/products/:id'],
    ['/api/orders/ORD-20261115-0001', 200, '/api/orders/:id'],
    ['/api/auth/check/03001234567', 200, '/api/auth/check/:id'],
    ['/api/products/', 200, '/api/products'],
    ['/wp-login.php', 404, 'unmatched'],
  ])('%s (%i) → %s', (path, status, label) => {
    expect(routeLabel(path, status)).toBe(label);
  });

  it('stops adding new routes after 300 (no unbounded series)', () => {
    for (let i = 0; i < 300; i++) routeLabel(`/api/r${i}`, 200);
    expect(routeLabel('/api/one-more', 200)).toBe('other');
    expect(routeLabel('/api/r1', 200)).toBe('/api/r1');
  });
});

describe('metricsAuthorized', () => {
  it('is off without a token, and needs the exact token', () => {
    expect(metricsAuthorized('Bearer anything', '')).toBe(false);
    expect(metricsAuthorized(undefined, 'a'.repeat(32))).toBe(false);
    expect(metricsAuthorized('Bearer wrong', 'a'.repeat(32))).toBe(false);
    expect(metricsAuthorized(`Bearer ${'a'.repeat(32)}`, 'a'.repeat(32))).toBe(true);
  });
});

describe('recording', () => {
  function app() {
    const a = express();
    a.use(metricsMiddleware);
    a.get('/api/orders/:id', (_req, res) => res.json({ ok: true }));
    a.get('/api/boom', (_req, res) => res.status(500).json({ ok: false }));
    a.get('/health', (_req, res) => res.json({ ok: true }));
    return a;
  }

  it('counts requests by route and status class, and times them', async () => {
    const a = app();
    await request(a).get('/api/orders/3f2a9c1e-1b2c-4d5e-8f90-123456789abc');
    await request(a).get('/api/orders/11111111-2222-4333-8444-555555555555');
    await request(a).get('/api/boom');
    await request(a).get('/nope');
    await request(a).get('/health');
    recordJobFailure('reconciliation');

    const text = renderMetrics({ totalCount: 5, idleCount: 3, waitingCount: 1 });
    expect(text).toContain('http_requests_total{method="GET",route="/api/orders/:id",status="2xx"} 2');
    expect(text).toContain('http_requests_total{method="GET",route="/api/boom",status="5xx"} 1');
    expect(text).toContain('http_requests_total{method="GET",route="unmatched",status="4xx"} 1');
    expect(text).not.toContain('route="/health"');
    expect(text).toContain('http_request_duration_seconds_count{method="GET",route="/api/orders/:id"} 2');
    expect(text).toMatch(/http_request_duration_seconds_bucket\{method="GET",route="\/api\/orders\/:id",le="\+Inf"\} 2/);
    expect(text).toContain('db_pool_connections{state="waiting"} 1');
    expect(text).toContain('background_job_failures_total{job="reconciliation"} 1');
    expect(text).toContain('http_requests_in_flight 0');
    expect(text).toMatch(/process_resident_memory_bytes \d+/);
    // every sample line is "name{labels} value" or "name value"
    for (const line of text.trim().split('\n').filter((l) => !l.startsWith('#'))) {
      expect(line).toMatch(/^[a-z_][a-z0-9_]*(\{[^}]*\})? -?[\d.e+]+$/);
    }
  });
});

describe('METRICS_TOKEN in production', () => {
  const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), CORS_ORIGIN: 'https://x.test' };
  it('a short token stops the boot; a long one or none is fine', () => {
    expect(checkEnvironment({ ...base, METRICS_TOKEN: 'short' }).errors.join(' ')).toMatch(/METRICS_TOKEN is too short/);
    expect(checkEnvironment({ ...base, METRICS_TOKEN: 'x'.repeat(32) }).errors).toEqual([]);
    expect(checkEnvironment(base).errors).toEqual([]);
  });
});
