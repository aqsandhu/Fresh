// ============================================================================
// METRICS — Prometheus text format at GET /metrics
//
// Off unless METRICS_TOKEN is set; then a scraper (Grafana Cloud, Better
// Stack, a self-hosted Prometheus...) calls it with
//   Authorization: Bearer <METRICS_TOKEN>
// Without the right token the endpoint answers 404, as if it did not exist.
//
// No extra dependency: the exposition format is plain text
// (https://prometheus.io/docs/instrumenting/exposition_formats/).
//
//   http_requests_total{method,route,status}        counter (status = 2xx/3xx/4xx/5xx)
//   http_request_duration_seconds{method,route}     histogram
//   http_requests_in_flight                         gauge
//   db_pool_connections{state}                      gauge (total / idle / waiting)
//   background_job_failures_total{job}              counter
//   process_resident_memory_bytes, nodejs_heap_used_bytes,
//   nodejs_eventloop_lag_p99_seconds, process_uptime_seconds
//
// Route labels are the URL path with ids replaced by ":id", so 10,000 orders
// do not become 10,000 series. 404s are all counted under route="unmatched"
// (scanners probing random paths), and at most MAX_ROUTES distinct routes are
// kept — anything after that is "other".
// ============================================================================
import crypto from 'crypto';
import { monitorEventLoopDelay } from 'perf_hooks';
import type { NextFunction, Request, Response } from 'express';

const BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const MAX_ROUTES = 300;
const SKIP = new Set(['/health', '/live', '/ready', '/metrics']);

const requests = new Map<string, number>(); // `${method}|${route}|${status}` → count
const durations = new Map<string, { buckets: number[]; sum: number; count: number }>(); // `${method}|${route}`
const jobFailures = new Map<string, number>();
const knownRoutes = new Set<string>();
let inFlight = 0;

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
// Only when metrics are switched on (a running monitor is one more handle that
// keeps short-lived processes — tests, scripts — from exiting promptly).
if (process.env.METRICS_TOKEN && process.env.NODE_ENV !== 'test') loopDelay.enable();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "/api/admin/orders/3f2a…/status?x=1" → "/api/admin/orders/:id/status" */
export function routeLabel(path: string, status: number): string {
  if (status === 404) return 'unmatched';
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  const label = clean
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      if (UUID.test(seg) || /^\d+$/.test(seg) || /^[0-9a-f]{20,}$/i.test(seg)) return ':id';
      // Order numbers, phone numbers, codes: anything long that carries digits.
      if (seg.length >= 8 && /\d/.test(seg)) return ':id';
      return seg;
    })
    .join('/');
  if (knownRoutes.has(label)) return label;
  if (knownRoutes.size >= MAX_ROUTES) return 'other';
  knownRoutes.add(label);
  return label;
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SKIP.has(req.path)) return next();
  const start = process.hrtime.bigint();
  inFlight++;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    inFlight--;
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = routeLabel(req.originalUrl || req.url, res.statusCode);
    const key = `${req.method}|${route}|${statusClass(res.statusCode)}`;
    requests.set(key, (requests.get(key) ?? 0) + 1);
    const dKey = `${req.method}|${route}`;
    let d = durations.get(dKey);
    if (!d) {
      d = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
      durations.set(dKey, d);
    }
    for (let i = 0; i < BUCKETS.length; i++) if (seconds <= BUCKETS[i]) d.buckets[i]++;
    d.sum += seconds;
    d.count++;
  };
  res.on('finish', finish);
  res.on('close', finish); // client went away before the response finished
  next();
}

export function recordJobFailure(job: string): void {
  jobFailures.set(job, (jobFailures.get(job) ?? 0) + 1);
}

function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export interface PoolLike { totalCount: number; idleCount: number; waitingCount: number }

export function renderMetrics(pool?: PoolLike): string {
  const out: string[] = [];
  out.push('# HELP http_requests_total HTTP requests by method, route and status class.');
  out.push('# TYPE http_requests_total counter');
  for (const [key, n] of requests) {
    const [method, route, status] = key.split('|');
    out.push(`http_requests_total{method="${method}",route="${esc(route)}",status="${status}"} ${n}`);
  }

  out.push('# HELP http_request_duration_seconds Time to answer a request.');
  out.push('# TYPE http_request_duration_seconds histogram');
  for (const [key, d] of durations) {
    const [method, route] = key.split('|');
    const labels = `method="${method}",route="${esc(route)}"`;
    BUCKETS.forEach((b, i) => out.push(`http_request_duration_seconds_bucket{${labels},le="${b}"} ${d.buckets[i]}`));
    out.push(`http_request_duration_seconds_bucket{${labels},le="+Inf"} ${d.count}`);
    out.push(`http_request_duration_seconds_sum{${labels}} ${d.sum.toFixed(6)}`);
    out.push(`http_request_duration_seconds_count{${labels}} ${d.count}`);
  }

  out.push('# HELP http_requests_in_flight Requests being answered right now.');
  out.push('# TYPE http_requests_in_flight gauge');
  out.push(`http_requests_in_flight ${inFlight}`);

  if (pool) {
    out.push('# HELP db_pool_connections Database pool connections (waiting = requests queued for a connection).');
    out.push('# TYPE db_pool_connections gauge');
    out.push(`db_pool_connections{state="total"} ${pool.totalCount}`);
    out.push(`db_pool_connections{state="idle"} ${pool.idleCount}`);
    out.push(`db_pool_connections{state="waiting"} ${pool.waitingCount}`);
  }

  out.push('# HELP background_job_failures_total Failed runs of background jobs (reconciliation, marketing...).');
  out.push('# TYPE background_job_failures_total counter');
  for (const [job, n] of jobFailures) out.push(`background_job_failures_total{job="${esc(job)}"} ${n}`);

  const mem = process.memoryUsage();
  out.push('# HELP process_resident_memory_bytes Resident memory.');
  out.push('# TYPE process_resident_memory_bytes gauge');
  out.push(`process_resident_memory_bytes ${mem.rss}`);
  out.push('# HELP nodejs_heap_used_bytes V8 heap in use.');
  out.push('# TYPE nodejs_heap_used_bytes gauge');
  out.push(`nodejs_heap_used_bytes ${mem.heapUsed}`);
  out.push('# HELP nodejs_eventloop_lag_p99_seconds 99th percentile event-loop delay since the last scrape.');
  out.push('# TYPE nodejs_eventloop_lag_p99_seconds gauge');
  out.push(`nodejs_eventloop_lag_p99_seconds ${(loopDelay.percentile(99) / 1e9).toFixed(6)}`);
  loopDelay.reset();
  out.push('# HELP process_uptime_seconds Seconds since the process started.');
  out.push('# TYPE process_uptime_seconds gauge');
  out.push(`process_uptime_seconds ${process.uptime().toFixed(0)}`);
  return `${out.join('\n')}\n`;
}

/** Bearer-token check in constant time; false when metrics are off. */
export function metricsAuthorized(authorization: string | undefined, token = process.env.METRICS_TOKEN): boolean {
  if (!token) return false;
  const given = (authorization ?? '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Test helper: forget everything recorded so far. */
export function resetMetrics(): void {
  requests.clear();
  durations.clear();
  jobFailures.clear();
  knownRoutes.clear();
  inFlight = 0;
}
