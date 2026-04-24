// ============================================================================
// DATABASE CONFIGURATION - PostgreSQL Connection Pool
// ============================================================================

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import logger from '../utils/logger';

// Build connection config from environment
function buildPoolConfig() {
  // Default false for Supabase/Render compatibility. Set DB_SSL_REJECT_UNAUTHORIZED=true only if using verified CA certs.
  const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';

  // If DATABASE_URL is provided, use it directly
  if (process.env.DATABASE_URL) {
    logger.info('Using DATABASE_URL for database connection');
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: sslRejectUnauthorized },
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
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: sslRejectUnauthorized } : false,
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

// Get a client from the pool
export const getClient = async (): Promise<PoolClient> => {
  return await pool.connect();
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

export default pool;
