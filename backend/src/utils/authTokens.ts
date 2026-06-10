import { generateTokenPair, generateAdminTokenPair } from '../config/jwt';
import { UserRole } from '../types';
import {
  persistRefreshToken,
  revokeRefreshToken,
} from '../services/refreshToken.service';
import logger from './logger';

export async function issueTokenPair(userId: string, phone: string, role: UserRole) {
  const tokens = generateTokenPair(userId, phone, role);
  try {
    await persistRefreshToken(userId, tokens.refreshToken);
  } catch (err) {
    logger.warn('Could not persist refresh token — run migration 13-refresh-tokens.sql', {
      err,
    });
  }
  return tokens;
}

export async function issueAdminTokenPair(userId: string, phone: string, role: UserRole) {
  const tokens = generateAdminTokenPair(userId, phone, role);
  try {
    await persistRefreshToken(userId, tokens.refreshToken);
  } catch (err) {
    logger.warn('Could not persist admin refresh token — run migration 13-refresh-tokens.sql', {
      err,
    });
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
  return issueTokenPair(userId, phone, role);
}
