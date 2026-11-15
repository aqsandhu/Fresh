// ============================================================================
// FRESH BAZAR DELIVERY PLATFORM - MAIN APPLICATION
// ============================================================================

import express, { Application, NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
 dotenv.config();

// Import Sentry configuration
import { initSentry, setupSentryMiddleware, setupSentryErrorHandler } from './config/sentry';

// Import Socket.IO
import { initializeSocket, getIO } from './config/socket';

// Import Swagger configuration
import swaggerSpec, { setupSwagger } from './config/swagger';

// Import database and middleware
import pool, { testConnection, closePool } from './config/database';
import { metricsMiddleware, metricsAuthorized, renderMetrics } from './utils/metrics';
import { findPendingMigrations } from './utils/pendingMigrations';
import { addRoutesToSpec, listExpressRoutes } from './config/openapiRoutes';
import { bootstrapAdmin } from './scripts/bootstrapAdmin';
import { ensureStorageBucket } from './config/storage';
import { logOtpBypassWarningIfEnabled } from './config/otpBypass';
import { logAdmin2faStatus } from './config/admin2fa';
import { ensurePinColumns } from './config/pinAuth';
import { ensureAddressColumns } from './config/addressSchema';
import {
  ensureOrderCouponColumns,
  ensureUrgentDeliveryColumns,
  ensureRestaurantOrderColumns,
  ensureOrderStatusNotificationTrigger,
} from './config/orderSchema';
import { ensureVariableWeightColumns, ensureUnitToggleColumns, ensureQualityCatalogColumns } from './config/productSchema';
import { ensureFeedbackTables, ensureComplaintImagesColumn } from './config/feedbackSchema';
import { ensureTipsTable } from './config/tipsSchema';
import { ensureWhatsappLinkColumns } from './config/whatsappOrderSchema';
import { ensureRiderApplicationsTable } from './config/riderApplicationSchema';
import { ensureRestaurantsTable, ensureRestaurantPhoneUnique, ensureRestaurantDeliveryColumns } from './config/restaurantSchema';
import { ensureOcpTables } from './config/ocpSchema';
import { ensureCatalogV2Columns } from './config/catalogV2Schema';
import { ensureTimeSlotBookings } from './config/timeSlotSchema';
import { ensureControlColumns } from './config/controlSchema';
import { ensureReconciliationTables } from './config/reconciliationSchema';
import { ensureFeatureTables } from './config/featureSchema';
import { query as dbQuery } from './config/database';
import { runReconciliation } from './utils/reconciliation';
import { runAbandonedCartReminders } from './controllers/marketing.controller';
import { runExclusively } from './utils/leaderLock';
import { reportJobFailure } from './utils/jobAlerts';

let reconciliationTimer: NodeJS.Timeout | null = null;
let reconciliationKickoffTimer: NodeJS.Timeout | null = null;
let marketingTimer: NodeJS.Timeout | null = null;
let marketingKickoffTimer: NodeJS.Timeout | null = null;
let dbRetryTimer: NodeJS.Timeout | null = null;

/** Hourly abandoned-cart reminder pass (no-op unless enabled in settings). */
function startMarketingScheduler(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (marketingTimer) return;
  const HOUR = 60 * 60 * 1000;
  // Leader-locked: with 2+ instances only one runs the pass (see leaderLock.ts).
  const tick = () =>
    runExclusively('scheduler:abandoned-cart-reminders', () => runAbandonedCartReminders()).catch((e) =>
      reportJobFailure('abandoned-cart-reminders', 'Abandoned-cart reminders', e)
    );
  marketingKickoffTimer = setTimeout(tick, 2 * 60 * 1000); // first pass ~2 min after boot
  marketingTimer = setInterval(tick, HOUR);
  logger.info('Marketing scheduler started (hourly)');
}

/** Daily books-watchdog. Runs ~1 min after boot only if overdue (>20h), then
 *  every 24h. Wrapped so a failed run never crashes the server. Disabled in tests. */
function startReconciliationScheduler(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (reconciliationTimer) return; // retry-safe: don't double-start
  const DAY = 24 * 60 * 60 * 1000;
  // Leader-locked: with 2+ instances only one runs the watchdog (see leaderLock.ts).
  const tick = () =>
    runExclusively('scheduler:reconciliation', () => runReconciliation()).catch((e) =>
      reportJobFailure('reconciliation', 'The daily books check (watchdog)', e)
    );
  reconciliationKickoffTimer = setTimeout(async () => {
    try {
      const last = await dbQuery(`SELECT run_at FROM reconciliation_runs ORDER BY run_at DESC LIMIT 1`);
      const lastAt = last.rows[0]?.run_at ? new Date(last.rows[0].run_at).getTime() : 0;
      if (Date.now() - lastAt > 20 * 60 * 60 * 1000) tick();
    } catch {
      /* table may not exist yet — next daily tick handles it */
    }
  }, 60 * 1000);
  reconciliationTimer = setInterval(tick, DAY);
  logger.info('Reconciliation scheduler started (daily)');
}

/** Clears every scheduler/retry timer so shutdown never races a fresh DB job
 *  against a closing pool. Safe to call repeatedly. */
function stopSchedulers(): void {
  if (marketingTimer) clearInterval(marketingTimer);
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  if (marketingKickoffTimer) clearTimeout(marketingKickoffTimer);
  if (reconciliationKickoffTimer) clearTimeout(reconciliationKickoffTimer);
  if (dbRetryTimer) clearTimeout(dbRetryTimer);
  marketingTimer = null;
  reconciliationTimer = null;
  marketingKickoffTimer = null;
  reconciliationKickoffTimer = null;
  dbRetryTimer = null;
}
import { morganStream } from './utils/logger';
import { redactUrl } from './utils/redact';
import { requestId } from './middleware/requestId';
import { enforceEnvironment } from './config/envCheck';
import {
  apiRateLimiters,
  initRateLimiterStore,
  errorHandler,
  notFoundHandler,
  handleUnhandledRejection,
  handleUncaughtException,
  ForbiddenError,
} from './middleware';
import { getAllowedOrigins } from './utils/corsOrigins';
import { ensureDatabaseExtensions } from './config/database';

// Import routes
import routes from './routes';
import logger from './utils/logger';

// ============================================================================
// INITIALIZE EXPRESS APP & HTTP SERVER
// ============================================================================

const app: Application = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Behind a proxy (Render / Cloudflare / Nginx) the real client IP arrives in
// X-Forwarded-For. Trusting exactly one hop lets express-rate-limit and
// req.ip work correctly without blindly trusting arbitrary header values.
// Override via TRUST_PROXY env var if the proxy chain is deeper.
// TRUST_PROXY accepts booleans ('true'/'false'), a hop count ('1'), or an IP
// list — parsing everything through Number() turns 'true' into NaN and breaks
// req.ip / rate limiting.
const trustProxyEnv = process.env.TRUST_PROXY;
const trustProxy =
  trustProxyEnv === undefined || trustProxyEnv === ''
    ? 1
    : trustProxyEnv === 'true'
      ? true
      : trustProxyEnv === 'false'
        ? false
        : Number.isNaN(Number(trustProxyEnv))
          ? trustProxyEnv
          : Number(trustProxyEnv);
app.set('trust proxy', trustProxy);

// ============================================================================
// INITIALIZE SENTRY (BEFORE ALL MIDDLEWARE)
// ============================================================================

initSentry();

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet for security headers. Swagger UI boots via an inline <script>, which
// the production CSP blocks (blank /api/docs) — serve the docs routes with CSP
// disabled instead (they are password-gated in production anyway).
const helmetWithCsp = helmet({
  contentSecurityPolicy: NODE_ENV === 'production',
  crossOriginEmbedderPolicy: NODE_ENV === 'production',
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
const helmetWithoutCsp = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
app.use((req, res, next) =>
  req.path.startsWith('/api/docs') ? helmetWithoutCsp(req, res, next) : helmetWithCsp(req, res, next)
);

const allowedOrigins = getAllowedOrigins();
const allowAnyOrigin = allowedOrigins.includes('*');

function isOriginAllowed(origin: string): boolean {
  const normalized = origin.trim().replace(/\/$/, '');
  return allowedOrigins.some((o) => o === normalized || o === origin);
}

// In dev we no longer reflect every origin — that combined with
// CORS_CREDENTIALS=true would be a real XSRF-style risk if a developer
// accidentally used a prod-flavoured config locally. Instead, dev allows
// the configured allowlist *plus* localhost/127.0.0.1 on any port.
const DEV_LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function isDevLocalhost(origin: string): boolean {
  return NODE_ENV !== 'production' && DEV_LOCALHOST.test(origin);
}

logger.info(
  `CORS: ${allowAnyOrigin ? 'allowing any origin (*)' : `allowed origins = ${allowedOrigins.join(', ')}`}`
);

// First-party clients (website, customer-app, admin) authenticate with HttpOnly
// cookies, so the browser sends credentialed requests (withCredentials: true).
// In that mode the browser DISCARDS the response unless it carries
// `Access-Control-Allow-Credentials: true` — even on a 200. A missing
// CORS_CREDENTIALS env therefore silently broke every cross-origin call (e.g.
// the website showed no cities though the API returned them).
//
// Default credentials ON for an explicit allowlist; force OFF for a wildcard
// origin (`*` + credentials is invalid per spec and an XSRF risk). An explicit
// env value always wins.
const corsCredentials =
  process.env.CORS_CREDENTIALS !== undefined
    ? process.env.CORS_CREDENTIALS === 'true'
    : !allowAnyOrigin;

logger.info(`CORS credentials: ${corsCredentials ? 'enabled' : 'disabled'}`);

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server).
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowAnyOrigin || isOriginAllowed(origin) || isDevLocalhost(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`, {
        hint: 'Add this URL to CORS_ORIGIN (or CORS_EXTRA_ORIGINS) on Render',
      });
      // A web page on a site that is not ours: refuse the request outright
      // (this is also what stops a cross-site form/JS call from riding a
      // logged-in browser's cookies). It is the caller's fault — a 403, not
      // the 500 it used to produce, which also filled the error log every
      // time a crawler sent a made-up Origin.
      callback(new ForbiddenError('This website is not allowed to call the Fresh Bazar API.'));
    }
  },
  credentials: corsCredentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-City-Id',
    'X-Client-Platform',
    'X-Request-Id',
  ],
  // Let the browser apps read the id so a failed request can be quoted to support.
  exposedHeaders: ['X-Request-Id'],
};

// One id per request — first, so even a CORS or parse failure carries it.
app.use(requestId);
// Request counts / latency per route for GET /metrics (see utils/metrics.ts).
app.use(metricsMiddleware);

app.use(cors(corsOptions));

// ============================================================================
// REQUEST PARSING MIDDLEWARE
// ============================================================================

// Parse JSON bodies. The `verify` hook captures the raw request bytes so
// webhook HMAC signatures can be checked against exactly what the sender
// signed — re-serialising req.body (JSON.stringify) breaks the moment the
// sender's key order or whitespace differs from ours.
app.use(
  express.json({
    // JSON bodies here are small (the largest is a cart or a service-area
    // polygon); files go through multipart uploads. 10 MB per request let a
    // handful of callers pin the server's memory.
    limit: process.env.JSON_BODY_LIMIT || '1mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Parse cookies (HttpOnly auth tokens for browser clients)
app.use(cookieParser());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '1mb' }));

// Anything answered to a signed-in caller is personal (orders, addresses,
// cash figures): browsers and proxies must not keep a copy.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization || req.headers.cookie) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// ============================================================================
// SENTRY REQUEST HANDLER (MUST BE FIRST MIDDLEWARE)
// ============================================================================

setupSentryMiddleware(app);

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

// HTTP request logging
morgan.token('request-id', (req) => (req as Request).requestId || '-');
// The URL with query values judged by name (a token or code sent in the query
// string must not land in the log in clear).
morgan.token('safe-url', (req) => redactUrl((req as Request).originalUrl || (req as Request).url || ''));
app.use(morgan(NODE_ENV === 'development' ? 'dev' : ':request-id :remote-addr ":method :safe-url HTTP/:http-version" :status :res[content-length] :response-time ms ":user-agent"', {
  stream: morganStream,
  // Skip probe endpoints — they'd drown real request logs.
  skip: (req: Request) => req.path === '/health' || req.path === '/live' || req.path === '/ready',
}));

// ============================================================================
// COMPRESSION MIDDLEWARE
// ============================================================================

app.use(compression());

// ============================================================================
// RATE LIMITING
// ============================================================================

app.use(apiRateLimiters);

// ============================================================================
// STATIC FILES
// ============================================================================

// Serve uploaded files
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
app.use(`/${uploadDir}`, express.static(path.join(process.cwd(), uploadDir)));

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

app.get('/health', async (req: Request, res: Response) => {
  const dbConnected = await testConnection().catch(() => false);

  const payload: Record<string, unknown> = {
    success: dbConnected,
    message: dbConnected ? 'Service is healthy' : 'Database connection failed',
    timestamp: new Date().toISOString(),
  };

  // Avoid leaking deployment metadata on the public health endpoint.
  if (NODE_ENV !== 'production') {
    payload.environment = NODE_ENV;
    payload.version = process.env.npm_package_version || '1.0.0';
  }

  res.status(dbConnected ? 200 : 503).json(payload);
});

// Liveness: "is the process up?" — no dependency checks, never 503s while the
// event loop runs. Platforms should use this for RESTART decisions.
app.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'alive', timestamp: new Date().toISOString() });
});

// Readiness: "should this instance receive traffic?" — single fast DB probe
// (no retries, unlike /health's 3×3s) so load balancers get an answer quickly.
app.get('/ready', async (_req: Request, res: Response) => {
  const dbConnected = await testConnection(1, 0).catch(() => false);
  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected ? 'ready' : 'Database connection failed',
    timestamp: new Date().toISOString(),
  });
});

// Metrics for a monitoring service (Prometheus text format). Hidden — 404 —
// unless METRICS_TOKEN is set and sent as "Authorization: Bearer <token>".
app.get('/metrics', (req: Request, res: Response) => {
  if (!metricsAuthorized(req.headers.authorization)) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('text/plain; version=0.0.4').send(renderMetrics(pool));
});

// ============================================================================
// SWAGGER API DOCUMENTATION
// ============================================================================

setupSwagger(app);

// ============================================================================
// API ROUTES
// ============================================================================

const API_PREFIX = '/api';

app.use(API_PREFIX, routes);

// API docs: every mounted route becomes an OpenAPI operation (config/openapiRoutes.ts).
addRoutesToSpec(swaggerSpec as { paths?: Record<string, Record<string, unknown>> }, listExpressRoutes(app));

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use(notFoundHandler);

// Sentry error handler (must be before global error handler)
setupSentryErrorHandler(app);

// Global error handler
app.use(errorHandler);

// ============================================================================
// SERVER STARTUP (with Socket.IO)
// ============================================================================

const startServer = async () => {
  // Refuse to start in production on a broken configuration (a typo in a
  // limit used to turn a control off silently — see config/envCheck.ts).
  enforceEnvironment();
  try {
    // Test database connection (with retries, non-blocking)
    const dbConnected = await testConnection(5, 5000);

    if (!dbConnected) {
      logger.warn('Database not yet available. Server will start but DB-dependent features may not work.');
      logger.warn('If using Supabase, ensure you are using the connection pooler URL:');
      logger.warn('  postgresql://postgres:PASSWORD@PROJECT_ID.pooler.supabase.com:6543/postgres');
      // Continue starting server - don't exit
    }

    await initRateLimiterStore();

    // Initialize Socket.IO
    initializeSocket(httpServer);
    logger.info('Socket.IO initialized');

    // Prepare the listener, then run startup tasks first when the DB is ready.
    // This keeps write routes from accepting traffic against a half-migrated
    // schema while preserving degraded startup when the DB is unavailable.
    logOtpBypassWarningIfEnabled();
    logAdmin2faStatus();
    // Unsigned webhooks are only ever honoured outside production (see
    // webhook.controller.ts verifyWebhookSignature) — say so loudly at boot so
    // a leftover flag on the dashboard is noticed rather than silently ignored.
    if (process.env.WEBHOOK_ALLOW_UNSIGNED === 'true') {
      if (NODE_ENV === 'production') {
        logger.error(
          'WEBHOOK_ALLOW_UNSIGNED=true is IGNORED in production — webhooks always require an HMAC signature. Remove the variable.'
        );
      } else {
        logger.warn('WEBHOOK_ALLOW_UNSIGNED=true — unsigned webhooks accepted (non-production only)');
      }
    }
    const listen = () => {
      httpServer.listen(PORT, () => {
        logger.info(`=================================`);
        logger.info(`Fresh Bazar API running on port ${PORT}`);
        logger.info(`Environment: ${NODE_ENV}`);
        logger.info(`API URL: http://localhost:${PORT}${API_PREFIX}`);
        logger.info(`Health Check: http://localhost:${PORT}/health`);
        logger.info(`API Docs: http://localhost:${PORT}/api/docs`);
        logger.info(`WebSocket: ws://localhost:${PORT}`);
        logger.info(`=================================`);
      });
    };

    // Idempotent startup tasks.
    const runStartupTasks = async (failFast = false) => {
      try {
        await ensureDatabaseExtensions();
        // The schema is owned by the versioned migrations ALONE, in every
        // environment (Render runs them before each deploy; locally
        // `migrate:sql`). Checked 15 Nov 2026: schema.sql + migrations gives
        // exactly the schema the old boot-time DDL below produced, so that DDL
        // is off by default. It used to run in development/CI only — which
        // could hide a column that existed in no migration until production
        // broke. SCHEMA_SELF_HEAL=true turns it back on for an emergency.
        const pending = await findPendingMigrations((text) => dbQuery(text));
        if (pending === null) {
          logger.warn('Could not check for unapplied migrations (no schema_migrations table or no database/migrations folder). Run "pnpm --filter @freshbazar/backend migrate:sql".');
        } else if (pending.length > 0) {
          logger.error(
            `${pending.length} database migration(s) are NOT applied: ${pending.slice(0, 5).join(', ')}${pending.length > 5 ? ', …' : ''}. ` +
              'Run "pnpm --filter @freshbazar/backend migrate:sql" — screens that use the new tables/columns fail until then.'
          );
        }
        if (process.env.SCHEMA_SELF_HEAL === 'true') {
        await ensurePinColumns();
        await ensureAddressColumns();
        await ensureOrderCouponColumns();
        await ensureVariableWeightColumns();
        await ensureUnitToggleColumns();
        await ensureQualityCatalogColumns();
        await ensureFeedbackTables();
        await ensureComplaintImagesColumn();
        await ensureTipsTable();
        await ensureWhatsappLinkColumns();
        await ensureUrgentDeliveryColumns();
        await ensureRiderApplicationsTable();
        await ensureRestaurantsTable();
        await ensureRestaurantPhoneUnique();
        await ensureRestaurantDeliveryColumns();
        await ensureRestaurantOrderColumns();
        await ensureOrderStatusNotificationTrigger();
        await ensureOcpTables();
        await ensureTimeSlotBookings();
        await ensureControlColumns();
        await ensureReconciliationTables();
        // Auto-create the 2026-06 epic tables (service areas, baskets, franchise,
        // marketing) so the features work even before migrations 43-46 are run.
        await ensureFeatureTables();
        const catalogV2Ready = await ensureCatalogV2Columns();
        if (!catalogV2Ready) {
          throw new Error('catalog-v2 columns are required but could not be ensured');
        }
        }
        // Start the daily reconciliation watchdog once the DB/schema is ready.
        startReconciliationScheduler();
        // Hourly abandoned-cart reminder pass (gated by marketing settings).
        startMarketingScheduler();
        // Admin bootstrap: no-op unless ADMIN_PHONE and ADMIN_PASSWORD env vars
        // are set. Safe to call on every boot — idempotently upserts the row.
        const adminResult = await bootstrapAdmin();
        if (adminResult.status === 'error') {
          logger.error(`Admin bootstrap error: ${adminResult.message}`);
        } else {
          logger.info(`Admin bootstrap: ${adminResult.status} — ${adminResult.message}`);
        }
      } catch (err) {
        logger.error('Background startup tasks failed:', err);
        if (failFast) throw err;
      }
      // Ensure Supabase Storage bucket exists (creates "uploads" if missing).
      await ensureStorageBucket().catch((err) =>
        logger.warn('Could not ensure storage bucket', { error: (err as Error)?.message })
      );
    };

    if (dbConnected) {
      await runStartupTasks(true);
      listen();
    } else {
      listen();
      // DB wasn't ready — keep retrying, then run the startup tasks once it is.
      const retryDb = async () => {
        const connected = await testConnection(1, 0);
        if (connected) {
          logger.info('Database connection established after startup!');
          await runStartupTasks();
        } else {
          dbRetryTimer = setTimeout(retryDb, 30000); // Retry every 30 seconds
        }
      };
      dbRetryTimer = setTimeout(retryDb, 30000);
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let shuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (shuttingDown) return; // double SIGTERM/SIGINT — first one wins
  shuttingDown = true;
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Failsafe: connected websockets / keep-alive sockets can hold the server
  // open indefinitely — never hang shutdown past 10s.
  const forceExit = setTimeout(() => {
    logger.warn('Graceful shutdown timed out after 10s — forcing exit');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  // 1) Stop schedulers first so no new background DB job starts mid-shutdown.
  stopSchedulers();

  // 2) Stop accepting connections and drain in-flight work. Socket.IO's
  //    close() disconnects websocket clients AND closes the shared HTTP
  //    server; fall back to plain httpServer.close() if it never initialized.
  const closeServer = (done: () => void) => {
    try {
      getIO().close(done);
    } catch {
      httpServer.close(done);
    }
  };

  closeServer(async () => {
    logger.info('HTTP server closed');
    try {
      // 3) Only now close the pool — nothing left that can query it.
      await closePool();
      logger.info('Database connections closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
handleUnhandledRejection();
handleUncaughtException();

// ============================================================================
// START SERVER
// ============================================================================

startServer();

export default app;
