// ============================================================================
// JWT CONFIGURATION
// ============================================================================

import jwt, { SignOptions } from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';

// JWT secrets from environment
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in production');
  }
  console.warn('Warning: Using default JWT secrets. Set JWT_SECRET and JWT_REFRESH_SECRET in .env');
}

const jwtSecret = JWT_SECRET || 'dev-only-secret-do-not-use-in-production';
const jwtRefreshSecret = JWT_REFRESH_SECRET || 'dev-only-refresh-secret-do-not-use-in-production';
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
