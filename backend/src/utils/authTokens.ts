import { generateTokenPair, generateAdminTokenPair } from '../config/jwt';
import { UserRole } from '../types';
import {
  persistRefreshToken,
  revokeRefreshToken,
} from '../services/refreshToken.service';
import logger from './logger';
import { ApiError } from '../middleware/errorHandler';

export async function issueTokenPair(userId: string, phone: string, role: UserRole) {
  const tokens = generateTokenPair(userId, phone, role);
  try {
    await persistRefreshToken(userId, tokens.refreshToken);
  } catch (err) {
    logger.error('Could not persist refresh token - run migration 13-refresh-tokens.sql', {
      err,
    });
    throw new ApiError('Could not start a durable session. Please try again shortly.', 503);
  }
  return tokens;
}

export async function issueAdminTokenPair(userId: string, phone: string, role: UserRole) {
  const tokens = generateAdminTokenPair(userId, phone, role);
  try {
    // Persist with the ADMIN refresh TTL so expires_at matches the JWT.
    await persistRefreshToken(
      userId,
      tokens.refreshToken,
      process.env.ADMIN_JWT_REFRESH_EXPIRES_IN || '8h'
    );
  } catch (err) {
    logger.error('Could not persist admin refresh token - run migration 13-refresh-tokens.sql', {
      err,
    });
    throw new ApiError('Could not start a durable admin session. Please try again shortly.', 503);
  }
  return tokens;
}

export async function rotateRefreshToken(
  userId: string,
  phone: string,
  role: UserRole,
  previousRefreshToken: string
) {
  try {
    await revokeRefreshToken(previousRefreshToken);
  } catch (err) {
    logger.warn('Could not revoke previous refresh token', { err });
  }
  // Admin sessions must rotate into ADMIN-length tokens (8h refresh by
  // default). Rotating an admin into the customer pair silently extended a
  // leaked admin refresh token to 7 days, defeating the shortened policy.
  if (role === 'admin' || role === 'super_admin') {
    return issueAdminTokenPair(userId, phone, role);
  }
  return issueTokenPair(userId, phone, role);
}
