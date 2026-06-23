// ============================================================================
// DATABASE CONFIGURATION - PostgreSQL Connection Pool
// ============================================================================

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import logger from '../utils/logger';

/**
 * TLS options for the DB connection.
 *
 * IMPORTANT — managed Postgres providers (Supabase, Render) terminate TLS with
 * a SELF-SIGNED certificate chain. Verifying that against the system CA store
 * fails with SELF_SIGNED_CERT_IN_CHAIN and takes the whole API down, so the
 * connection is encrypted-but-unverified BY DEFAULT. Verification is opt-in:
 * the only correct way to verify a self-signed provider is to PIN its CA via
 * DB_SSL_CA — flipping rejectUnauthorized on without a CA just breaks.
 *
 * Resolution order:
 *   1. DB_SSL=false                          → no TLS at all.
 *   2. DB_SSL_CA (PEM string or base64)      → pin the provider CA, full verify
 *      (the recommended way to close the MITM window).
 *      Supabase: Dashboard → Settings → Database → "SSL Certificate".
 *   3. DB_SSL_REJECT_UNAUTHORIZED=true|false → explicit override (wins).
 *   4. default                               → encrypted, unverified
 *      (rejectUnauthorized:false) so a self-signed provider connects out of
 *      the box. We warn in production so this isn't silently left open.
 */
function buildSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env.DB_SSL === 'false') return false;
  if (!process.env.DATABASE_URL && process.env.DB_SSL !== 'true') return false;

  // HIGHEST PRIORITY kill-switch. An explicit DB_SSL_REJECT_UNAUTHORIZED=false
  // means "connect even if the cert can't be verified" and MUST win over
  // everything else — including a DB_SSL_CA that doesn't match the presented
  // chain. Supabase's POOLER (port 6543) presents a self-signed cert that the
  // downloadable project CA does NOT cover, so pinning that CA there fails with
  // SELF_SIGNED_CERT_IN_CHAIN; this switch guarantees the API can still connect.
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    return { rejectUnauthorized: false };
  }

  // Pin a provider CA → full verification. Only works when the CA actually
  // matches the presented chain (e.g. Supabase DIRECT connection on 5432, not
  // the pooler). If it can't, set DB_SSL_REJECT_UNAUTHORIZED=false above.
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

  // Production defaults to verified TLS. Local/test keeps the previous
  // unverified fallback for self-signed development databases; production
  // deployments that truly need that must opt out explicitly above.
  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

function parsePoolInt(value: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function isSupabasePooler(connectionString?: string): boolean {
  if (!connectionString) return false;
  try {
    const url = new URL(connectionString);
    return url.hostname.includes('pooler.supabase.com');
  } catch {
    return connectionString.includes('pooler.supabase.com');
  }
}

/**
 * Supabase Supavisor TRANSACTION mode = port 6543 (or pgbouncer=true). It
 * multiplexes many client connections over the server pool, so the app may hold
 * more connections. SESSION mode = port 5432 (one server connection per client).
 */
function isTransactionPooler(connectionString?: string): boolean {
  if (!connectionString) return false;
  try {
    const url = new URL(connectionString);
    return url.port === '6543' || url.searchParams.get('pgbouncer') === 'true';
  } catch {
    return connectionString.includes(':6543') || connectionString.includes('pgbouncer=true');
  }
}

function buildPoolSizing(connectionString?: string) {
  const usingSupabasePooler = isSupabasePooler(connectionString);
  const transactionPooler = usingSupabasePooler && isTransactionPooler(connectionString);

  // Pool sizing depends on the Supabase pooler MODE:
  //  • SESSION mode (port 5432) dedicates one server connection per client and
  //    rejects clients past the server-side pool_size (prod error was 15), so the
  //    app pool MUST stay well under it → small, hard ceiling 5.
  //  • TRANSACTION mode (port 6543 / pgbouncer=true) multiplexes many client
  //    connections over that server pool, so the app can safely hold more → 15.
  //  • Direct (non-pooler) connects straight to Postgres → tunable, no hard cap.
  // pg queues extra queries inside Node, so we never overshoot the server limit.
  const defaultMax = !usingSupabasePooler ? 10 : transactionPooler ? 10 : 5;
  const ceiling = !usingSupabasePooler
    ? Number.MAX_SAFE_INTEGER
    : transactionPooler
      ? 15
      : 5;

  const requestedMax = parsePoolInt(process.env.DB_POOL_MAX, defaultMax, 1);
  const cap = Math.min(parsePoolInt(process.env.DB_POOL_MAX_CAP, ceiling, 1), ceiling);
  const max = Math.max(1, Math.min(requestedMax, cap));
  const min = Math.min(parsePoolInt(process.env.DB_POOL_MIN, 0, 0), max);

  if (requestedMax > max) {
    logger.warn('DB_POOL_MAX capped for Supabase pooler safety', {
      requestedMax,
      appliedMax: max,
      mode: transactionPooler ? 'transaction' : usingSupabasePooler ? 'session' : 'direct',
    });
  }

  return { min, max };
}

// Build connection config from environment
function buildPoolConfig() {
  // If DATABASE_URL is provided, use it directly
  if (process.env.DATABASE_URL) {
    logger.info('Using DATABASE_URL for database connection');
    const sizing = buildPoolSizing(process.env.DATABASE_URL);
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: buildSslConfig(),
      min: sizing.min,
      max: sizing.max,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: false,
    };
  }

  // Otherwise use individual env vars
  logger.info('Using individual DB_* variables for connection');
  const sizing = buildPoolSizing();
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'grocery_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: buildSslConfig(),
    min: sizing.min,
    max: sizing.max,
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
