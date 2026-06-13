// ============================================================================
// DATABASE CONFIGURATION - PostgreSQL Connection Pool
// ============================================================================

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import logger from '../utils/logger';

/**
 * TLS options for the DB connection.
 *
 * SECURE BY DEFAULT IN PRODUCTION: certificate verification is now ON unless
 * explicitly disabled. Most managed providers (Supabase pooler, Render
 * Postgres) present publicly-trusted certs, so verification against the system
 * CA store "just works" and closes the MITM window the old default left open.
 *
 * Resolution order:
 *   1. DB_SSL=false                         → no TLS at all.
 *   2. DB_SSL_CA (PEM string or base64)     → pin the provider CA, full verify.
 *      Supabase: Dashboard → Settings → Database → "SSL Certificate".
 *   3. DB_SSL_REJECT_UNAUTHORIZED=true|false → explicit override (wins).
 *   4. production default                    → verify against system CAs.
 *   5. non-production default                → encrypted but unverified, so
 *      local/self-signed dev setups don't block startup.
 *
 * If a production provider uses a self-signed chain and connection fails,
 * supply DB_SSL_CA (preferred) or set DB_SSL_REJECT_UNAUTHORIZED=false.
 */
function buildSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env.DB_SSL === 'false') return false;
  if (!process.env.DATABASE_URL && process.env.DB_SSL !== 'true') return false;

  const rawCa = process.env.DB_SSL_CA?.trim();
  if (rawCa) {
    const ca = rawCa.includes('-----BEGIN')
      ? rawCa
      : Buffer.from(rawCa, 'base64').toString('utf8');
    return { rejectUnauthorized: true, ca };
  }

  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true') {
    return { rejectUnauthorized: true };
  }
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        'DB TLS certificate verification is DISABLED via DB_SSL_REJECT_UNAUTHORIZED=false. ' +
          'This reopens a MITM window — prefer pinning the provider CA with DB_SSL_CA.'
      );
    }
    return { rejectUnauthorized: false };
  }

  // Secure by default in production; lenient elsewhere for local dev.
  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

// Build connection config from environment
function buildPoolConfig() {
  // If DATABASE_URL is provided, use it directly
  if (process.env.DATABASE_URL) {
    logger.info('Using DATABASE_URL for database connection');
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: buildSslConfig(),
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: false,
    };
  }

  // Otherwise use individual env vars
  logger.info('Using individual DB_* variables for connection');
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'grocery_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: buildSslConfig(),
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    max: parseInt(process.env.DB_POOL_MAX || '10'),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: false,
  };
}

// Create connection pool
const pool = new Pool(buildPoolConfig());

// Pool event handlers
pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('acquire', () => {
  logger.debug('Client acquired from pool');
});

pool.on('remove', () => {
  logger.debug('Client removed from pool');
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
});

// Query helper function
export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', {
      text: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
    return result;
  } catch (error) {
    logger.error('Query error:', { text, params, error });
    throw error;
  }
};

// Transaction helper
export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/** Runs a callback with a pooled client that is always released. */
export const withClient = async <T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};

// Test database connection with retries
export const testConnection = async (retries = 3, delay = 3000): Promise<boolean> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await query('SELECT NOW() as current_time');
      logger.info('Database connected successfully', {
        time: result.rows[0].current_time,
        attempt,
      });
      return true;
    } catch (error: any) {
      logger.error(`Database connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        logger.info(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  return false;
};

// Close pool (for graceful shutdown)
export const closePool = async (): Promise<void> => {
  await pool.end();
  logger.info('Database pool closed');
};

/** Warn at startup if PostGIS is missing (location features need it). */
export const ensureDatabaseExtensions = async (): Promise<void> => {
  try {
    const result = await query<{ ok: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM pg_extension WHERE extname = 'postgis'
       ) AS ok`
    );
    if (!result.rows[0]?.ok) {
      logger.warn(
        'PostGIS extension is not installed. Run CREATE EXTENSION postgis; before applying schema.sql location features.'
      );
    }
  } catch (err) {
    logger.warn('Could not verify PostGIS extension', { err });
  }
};

export default pool;
