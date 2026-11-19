// Shared helpers for the auth handlers (moved from auth.controller.ts, W21).

import { Request, Response } from 'express';
import { successResponse, errorResponse, createdResponse } from '../../utils/response';
import { setAuthCookies, stripTokensFromAuthData } from '../../utils/authCookies';

export const SALT_ROUNDS = 12;

export function attachAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string }
): void {
  setAuthCookies(res, tokens);
}

export function authSuccess<T extends Record<string, unknown>>(
  req: Request,
  res: Response,
  data: T,
  message: string,
  statusCode = 200
): void {
  if (statusCode === 201) {
    createdResponse(res, stripTokensFromAuthData(req, data), message);
    return;
  }
  successResponse(res, stripTokensFromAuthData(req, data), message, statusCode);
}

// ============================================================================
// PASSWORD LOGIN — PER-ACCOUNT LOCKOUT
// A per-IP rate limit alone can't stop a distributed guessing run against one
// known account (proxies/botnets rotate IPs). Password logins therefore share
// the PIN lockout store: after PIN_FAIL_THRESHOLD wrong passwords the account
// locks for an escalating window regardless of source IP.
// ============================================================================
export function respondAccountLocked(res: Response, lockedUntil: number): void {
  const retryAfter = Math.ceil((lockedUntil - Date.now()) / 1000);
  res.setHeader('Retry-After', String(retryAfter));
  errorResponse(res, 'Too many failed login attempts. Please try again later.', 429);
}

export const PIN_BCRYPT_ROUNDS = 10;

// Pre-computed bcrypt hash compared against when the target account does NOT
// exist, so "user not found" costs the same CPU time as "wrong credential"
// (timing-side-channel account enumeration). Never matched intentionally.
export const DUMMY_PIN_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO7ZB8m4n6Q8l0t2u4v6w8x0y2a4c6e8g';
