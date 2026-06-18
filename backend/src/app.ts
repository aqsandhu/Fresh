// ============================================================================
// FRESH BAZAR DELIVERY PLATFORM - MAIN APPLICATION
// ============================================================================

import express, { Application, Request, Response } from 'express';
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
import { initializeSocket } from './config/socket';

// Import Swagger configuration
import { setupSwagger } from './config/swagger';

// Import database and middleware
import { testConnection, closePool } from './config/database';
import { bootstrapAdmin } from './scripts/bootstrapAdmin';
import { ensureStorageBucket } from './config/storage';
import { logOtpBypassWarningIfEnabled } from './config/otpBypass';
import { ensurePinColumns } from './config/pinAuth';
import { ensureAddressColumns } from './config/addressSchema';
import { ensureOrderCouponColumns, ensureUrgentDeliveryColumns, ensureRestaurantOrderColumns } from './config/orderSchema';
import { ensureVariableWeightColumns, ensureUnitToggleColumns, ensureQualityCatalogColumns } from './config/productSchema';
import { ensureFeedbackTables, ensureComplaintImagesColumn } from './config/feedbackSchema';
import { ensureTipsTable } from './config/tipsSchema';
import { ensureWhatsappLinkColumns } from './config/whatsappOrderSchema';
import { ensureRiderApplicationsTable } from './config/riderApplicationSchema';
import { ensureRestaurantsTable, ensureRestaurantPhoneUnique, ensureRestaurantDeliveryColumns } from './config/restaurantSchema';
import { morganStream } from './utils/logger';
import {
  apiRateLimiter,
  initRateLimiterStore,
  errorHandler,
  notFoundHandler,
  handleUnhandledRejection,
  handleUncaughtException,
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
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

// ============================================================================
// INITIALIZE SENTRY (BEFORE ALL MIDDLEWARE)
// ============================================================================

initSentry();

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production',
  crossOriginEmbedderPolicy: NODE_ENV === 'production',
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

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
      callback(new Error('Not allowed by CORS'));
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
  ],
};

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
    limit: '10mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Parse cookies (HttpOnly auth tokens for browser clients)
app.use(cookieParser());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// SENTRY REQUEST HANDLER (MUST BE FIRST MIDDLEWARE)
// ============================================================================

setupSentryMiddleware(app);

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

// HTTP request logging
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined', {
  stream: morganStream,
  skip: (req: Request) => req.path === '/health', // Skip health check logs
}));

// ============================================================================
// COMPRESSION MIDDLEWARE
// ============================================================================

app.use(compression());

// ============================================================================
// RATE LIMITING
// ============================================================================

app.use(apiRateLimiter);

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

// ============================================================================
// SWAGGER API DOCUMENTATION
// ============================================================================

setupSwagger(app);

// ============================================================================
// API ROUTES
// ============================================================================

const API_PREFIX = '/api';

app.use(API_PREFIX, routes);

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

    // Start HTTP server FIRST so cold starts begin answering requests
    // immediately. The schema migrations, admin bootstrap and storage-bucket
    // check are all idempotent and feature-gated (controllers probe before
    // using a new column), so they run in the background instead of delaying
    // the server from listening — this shaves seconds off every cold boot.
    logOtpBypassWarningIfEnabled();
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

    // Idempotent startup tasks — run in the background, never block listen().
    const runStartupTasks = async () => {
      try {
        await ensureDatabaseExtensions();
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
      }
      // Ensure Supabase Storage bucket exists (creates "uploads" if missing).
      await ensureStorageBucket().catch((err) =>
        logger.warn('Could not ensure storage bucket', { error: (err as Error)?.message })
      );
    };

    if (dbConnected) {
      void runStartupTasks();
    } else {
      // DB wasn't ready — keep retrying, then run the startup tasks once it is.
      const retryDb = async () => {
        const connected = await testConnection(1, 0);
        if (connected) {
          logger.info('Database connection established after startup!');
          await runStartupTasks();
        } else {
          setTimeout(retryDb, 30000); // Retry every 30 seconds
        }
      };
      setTimeout(retryDb, 30000);
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  try {
    // Close database pool
    await closePool();
    logger.info('Database connections closed');

    // Close HTTP server (also closes Socket.IO)
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
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
