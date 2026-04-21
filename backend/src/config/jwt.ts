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
  if (!match) return 900; // Default 15 minutes

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
