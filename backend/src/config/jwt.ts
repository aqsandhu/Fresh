// ============================================================================
// JWT CONFIGURATION - SECURE TOKEN MANAGEMENT
// ============================================================================
// CRITICAL SECURITY: This file manages JWT secrets. In production, secrets
// MUST be provided via environment variables. Hardcoded fallbacks are
// ONLY allowed in explicit development mode with prominent warnings.
// ============================================================================

import jwt, { SignOptions } from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';
import logger from '../utils/logger';

// JWT secrets from environment
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

/**
 * Validates JWT secrets on startup.
 * - In production: HARD-FAIL if secrets are not provided
 * - In development: Allow fallback with prominent warning
 * - In any other env: HARD-FAIL if secrets are not provided
 */
const validateSecrets = (): { secret: string; refreshSecret: string } => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isDevelopment = nodeEnv === 'development';

  // Production or non-dev environments: SECRETS ARE MANDATORY
  if (!isDevelopment) {
    if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
      const missing = [];
      if (!JWT_SECRET) missing.push('JWT_SECRET');
      if (!JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
      throw new Error(
        `CRITICAL SECURITY ERROR: ${missing.join(', ')} environment variable(s) must be set in "${nodeEnv}" mode. ` +
        `The application cannot start without secure JWT secrets. ` +
        `Please set these in your environment or .env file and restart.`
      );
    }
    return { secret: JWT_SECRET, refreshSecret: JWT_REFRESH_SECRET };
  }

  // Development mode: Allow fallback with big warning
  if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
    const missing = [];
    if (!JWT_SECRET) missing.push('JWT_SECRET');
    if (!JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');

    logger.warn('');
    logger.warn('================================================================================');
    logger.warn('SECURITY WARNING: USING DEVELOPMENT JWT SECRETS');
    logger.warn(`Missing environment variables: ${missing.join(', ')}`);
    logger.warn('These are INSECURE default secrets only suitable for local development.');
    logger.warn('DO NOT use these in staging, production, or any shared environment.');
    logger.warn('================================================================================');
    logger.warn('');

    return {
      secret: JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production-98274',
      refreshSecret: JWT_REFRESH_SECRET || 'dev-only-insecure-refresh-secret-do-not-use-28471',
    };
  }

  return { secret: JWT_SECRET, refreshSecret: JWT_REFRESH_SECRET };
};

// Validate secrets immediately on module load
const { secret: jwtSecret, refreshSecret: jwtRefreshSecret } = validateSecrets();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
/**
 * Admin panel sessions — short-lived access tokens.
 * Was previously 8h/30d, which gave demoted/suspended admins a long window
 * before role/permission changes took effect. Defaults are tightened; refresh
 * + the verifyAdminActive DB recheck make UX seamless.
 */
const ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '15m';
const ADMIN_JWT_REFRESH_EXPIRES_IN = process.env.ADMIN_JWT_REFRESH_EXPIRES_IN || '8h';

// Generate access token
export const generateAccessToken = (
  userId: string,
  phone: string,
  role: UserRole
): string => {
  return jwt.sign(
    { userId, phone, role },
    jwtSecret,
    { expiresIn: JWT_EXPIRES_IN } as SignOptions
  );
};

// Short-lived token minted on demand for Socket.IO handshakes. Browser clients
// authenticate the websocket cross-site (the HttpOnly cookie can't ride along),
// so they fetch this token over the same-origin REST proxy and pass it in the
// handshake `auth.token`. Same claims as an access token, so the existing
// verifyAccessToken socket guard validates it unchanged.
const SOCKET_TOKEN_EXPIRES_IN = process.env.SOCKET_TOKEN_EXPIRES_IN || '1h';
export const generateSocketToken = (
  userId: string,
  phone: string,
  role: UserRole
): string => {
  return jwt.sign(
    { userId, phone, role },
    jwtSecret,
    { expiresIn: SOCKET_TOKEN_EXPIRES_IN } as SignOptions
  );
};

// Generate refresh token
export const generateRefreshToken = (
  userId: string,
  phone: string,
  role: UserRole
): string => {
  return jwt.sign(
    { userId, phone, role, type: 'refresh' },
    jwtRefreshSecret,
    { expiresIn: JWT_REFRESH_EXPIRES_IN } as SignOptions
  );
};

// Verify access token
export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, jwtSecret) as JwtPayload;
};

// Verify refresh token
export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, jwtRefreshSecret) as JwtPayload;
};

// Generate token pair
export const generateTokenPair = (
  userId: string,
  phone: string,
  role: UserRole
) => {
  const accessToken = generateAccessToken(userId, phone, role);
  const refreshToken = generateRefreshToken(userId, phone, role);

  return {
    accessToken,
    refreshToken,
    expiresIn: JWT_EXPIRES_IN,
    refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
  };
};

/** Longer-lived tokens for admin panel login only. */
export const generateAdminTokenPair = (
  userId: string,
  phone: string,
  role: UserRole
) => {
  const accessToken = jwt.sign(
    { userId, phone, role },
    jwtSecret,
    { expiresIn: ADMIN_JWT_EXPIRES_IN } as SignOptions
  );
  const refreshToken = jwt.sign(
    { userId, phone, role, type: 'refresh' },
    jwtRefreshSecret,
    { expiresIn: ADMIN_JWT_REFRESH_EXPIRES_IN } as SignOptions
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ADMIN_JWT_EXPIRES_IN,
    refreshExpiresIn: ADMIN_JWT_REFRESH_EXPIRES_IN,
  };
};

// ── Restaurant (B2B) tokens ────────────────────────────────────────────────
// A restaurant session is fully isolated from user/admin sessions: the payload
// carries `type: 'restaurant'` + `restaurantId` and NO `userId`/`role`, so it
// can never satisfy the user/admin `authenticate` guards, and a user/admin
// token can never satisfy `authenticateRestaurant`.
const RESTAURANT_JWT_EXPIRES_IN = process.env.RESTAURANT_JWT_EXPIRES_IN || '12h';

export interface RestaurantTokenPayload {
  restaurantId: string;
  phone: string;
  type: 'restaurant';
  iat?: number;
  exp?: number;
}

export const generateRestaurantToken = (restaurantId: string, phone: string): string => {
  return jwt.sign(
    { restaurantId, phone, type: 'restaurant' },
    jwtSecret,
    { expiresIn: RESTAURANT_JWT_EXPIRES_IN } as SignOptions
  );
};

export const verifyRestaurantToken = (token: string): RestaurantTokenPayload => {
  const decoded = jwt.verify(token, jwtSecret) as Record<string, unknown>;
  if (decoded?.type !== 'restaurant' || typeof decoded?.restaurantId !== 'string') {
    throw new Error('Not a restaurant token');
  }
  return decoded as unknown as RestaurantTokenPayload;
};

// ── OCP (Order Collection Point) tokens ─────────────────────────────────────
// Fully isolated like restaurant tokens: payload carries `type: 'ocp'` + `ocpId`
// and NO userId/role — an OCP token can only satisfy `authenticateOcp`, never the
// user/admin/restaurant guards.
const OCP_JWT_EXPIRES_IN = process.env.OCP_JWT_EXPIRES_IN || '12h';

export interface OcpTokenPayload {
  ocpId: string;
  phone: string;
  type: 'ocp';
  iat?: number;
  exp?: number;
}

export const generateOcpToken = (ocpId: string, phone: string): string => {
  return jwt.sign(
    { ocpId, phone, type: 'ocp' },
    jwtSecret,
    { expiresIn: OCP_JWT_EXPIRES_IN } as SignOptions
  );
};

export const verifyOcpToken = (token: string): OcpTokenPayload => {
  const decoded = jwt.verify(token, jwtSecret) as Record<string, unknown>;
  if (decoded?.type !== 'ocp' || typeof decoded?.ocpId !== 'string') {
    throw new Error('Not an OCP token');
  }
  return decoded as unknown as OcpTokenPayload;
};

// Decode token without verification (for debugging)
export const decodeToken = (token: string): JwtPayload | null => {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
};

// Token expiration times in seconds
export const getTokenExpiry = () => {
  // Parse expiration times
  const accessExpiry = parseExpiration(JWT_EXPIRES_IN);
  const refreshExpiry = parseExpiration(JWT_REFRESH_EXPIRES_IN);

  return {
    accessTokenExpiry: accessExpiry,
    refreshTokenExpiry: refreshExpiry,
  };
};

// Helper to parse expiration string to seconds
const parseExpiration = (exp: string): number => {
  const match = exp.match(/^(\d+)([smhd])$/);
  if (!match) {
    logger.warn(
      `Invalid JWT expiration format "${exp}" — expected e.g. 15m, 7d. Falling back to 900 seconds.`
    );
    return 900;
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: return 900;
  }
};
