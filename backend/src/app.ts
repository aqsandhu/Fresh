// ============================================================================
// PAKISTANI GROCERY DELIVERY PLATFORM - MAIN APPLICATION
// ============================================================================

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
 dotenv.config();

// Import database and middleware
import { testConnection, closePool } from './config/database';
import { morganStream } from './utils/logger';
import {
  apiRateLimiter,
  errorHandler,
  notFoundHandler,
  handleUnhandledRejection,
  handleUncaughtException,
} from './middleware';

// Import routes
import routes from './routes';
import logger from './utils/logger';

// ============================================================================
// INITIALIZE EXPRESS APP
// ============================================================================

const app: Application = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production',
  crossOriginEmbedderPolicy: NODE_ENV === 'production',
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',');
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    if (allowedOrigins.includes(origin) || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));

// ============================================================================
// REQUEST PARSING MIDDLEWARE
// ============================================================================

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
  
  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected ? 'Service is healthy' : 'Database connection failed',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

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

// Global error handler
app.use(errorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`=================================`);
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      logger.info(`API URL: http://localhost:${PORT}${API_PREFIX}`);
      logger.info(`Health Check: http://localhost:${PORT}/health`);
      logger.info(`=================================`);
    });
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
    
    // Exit process
    process.exit(0);
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
