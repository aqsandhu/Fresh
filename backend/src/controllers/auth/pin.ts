// Customer PIN: status, set, verify, reset — moved from auth.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { issueTokenPair } from '../../utils/authTokens';
import { revokeAllUserRefreshTokens } from '../../services/refreshToken.service';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse, unauthorizedResponse } from '../../utils/response';
import { normalizePhoneNumber } from '../../utils/validators';
import { verifyPhoneFromRequest } from '../../services/otp.service';
import { getPinStatusForPhone, ensurePinColumns, hasPinColumns } from '../../config/pinAuth';
import {
  pinAttemptFailed,
  clearPinFailures,
  reservePinAttempt,
} from '../../config/pinLockout';
import logger from '../../utils/logger';
import { isWeakPin, WEAK_PIN_MESSAGE } from '../../utils/pinStrength';
import { attachAuthCookies, authSuccess, PIN_BCRYPT_ROUNDS, DUMMY_PIN_HASH } from './shared';

/**
 * GET /api/auth/pin-status?phone=+92...
 * Lets the login UI decide whether to show "Enter PIN" or fall through to OTP.
 */
export const pinStatus = asyncHandler(async (req: Request, res: Response) => {
  const phone = (req.query.phone as string | undefined) || '';
  if (!phone) return errorResponse(res, 'phone is required', 400);

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizePhoneNumber(phone);
  } catch {
    return errorResponse(res, 'Invalid phone number', 400);
  }

  const status = await getPinStatusForPhone(normalizedPhone);
  // SECURITY FIX: do NOT leak full_name to an unauthenticated caller. The
  // client only needs to know which auth flow to render.
  return successResponse(
    res,
    { exists: status.exists, hasPin: status.hasPin },
    'OK'
  );
});

/**
 * POST /api/auth/set-pin
 * Authenticated. Body: { pin, current_pin? }. Sets / replaces the user's
 * 4-digit PIN. Used right after OTP register (no current_pin) and from
 * Settings → Change PIN (current_pin required — proves account possession).
 * Every successful (re)set revokes all refresh tokens so a stolen session
 * dies with the old PIN.
 */
export const setPin = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.id) return unauthorizedResponse(res, 'Authentication required');
  // PIN login is a customer convenience — admin roles must use password login.
  if (['admin', 'super_admin'].includes(req.user.role)) {
    return errorResponse(res, 'PIN sign-in is not available for admin accounts', 403);
  }
  const { pin, current_pin: currentPin } = req.body as { pin: string; current_pin?: string };

  const pinReady = await ensurePinColumns();
  if (!pinReady) {
    return errorResponse(
      res,
      'PIN is not available yet. Database migration pending — please try again in a minute.',
      503
    );
  }

  // If a PIN already exists, changing it requires the CURRENT pin — otherwise
  // anyone holding a stolen access token could lock the owner out silently.
  const existing = await query(
    'SELECT pin_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
    [req.user.id]
  );
  if (existing.rows.length === 0) return unauthorizedResponse(res, 'User not found');
  const existingHash: string | null = existing.rows[0].pin_hash ?? null;
  if (existingHash) {
    if (!currentPin) {
      return errorResponse(res, 'Current PIN is required to change your PIN', 400);
    }
    const matches = await bcrypt.compare(currentPin, existingHash);
    if (!matches) {
      // Generic on purpose — don't confirm that a PIN exists / which part failed.
      return errorResponse(res, 'Current PIN is incorrect', 403);
    }
  }

  if (isWeakPin(pin)) return errorResponse(res, WEAK_PIN_MESSAGE, 400); // B33
  const pinHash = await bcrypt.hash(pin, PIN_BCRYPT_ROUNDS);
  const result = await query(
    `UPDATE users SET pin_hash = $1, pin_set_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [pinHash, req.user.id]
  );
  if (result.rows.length === 0) return unauthorizedResponse(res, 'User not found');

  // CHANGING a PIN kills every other live session (they authenticated under
  // the old credential). The FIRST set happens seconds after registration —
  // revoking there logged brand-new users out as soon as their 15-minute
  // access token expired (website register + checkout sign-up).
  const sessionsRevoked = !!existingHash;
  if (sessionsRevoked) {
    await revokeAllUserRefreshTokens(req.user.id);
  }

  logger.info('PIN set', { userId: req.user.id, changed: !!existingHash });
  successResponse(res, { sessions_revoked: sessionsRevoked }, 'PIN saved');
});

/**
 * POST /api/auth/verify-pin
 * Body: { phone, pin }. Issues new JWT pair on success — same shape as
 * verifyLoginOtp so existing client code can swap one call for the other.
 *
 * Rate-limited at the route level to slow down brute-force attempts (5 / 15 min).
 */
export const verifyPin = asyncHandler(async (req: Request, res: Response) => {
  const { phone, pin } = req.body as { phone: string; pin: string };
  const normalizedPhone = normalizePhoneNumber(phone);

  // Per-account lockout takes priority over any per-IP limit.
  // B39: the attempt is reserved (counted) before the check — guesses sent
  // at the same moment cannot get past the lock.
  const lockState = await reservePinAttempt(normalizedPhone);
  if (!lockState.allowed) {
    const retryAfter = Math.ceil((lockState.lockedUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return errorResponse(
      res,
      'Too many failed PIN attempts. Try again later or reset your PIN.',
      429
    );
  }

  await ensurePinColumns();
  if (!(await hasPinColumns())) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  const result = await query(
    `SELECT id, phone, full_name, email, pin_hash, role, status, is_phone_verified
       FROM users
      WHERE phone = $1 AND deleted_at IS NULL`,
    [normalizedPhone]
  );

  if (result.rows.length === 0 || !result.rows[0].pin_hash) {
    // Same error for "no user" and "no PIN set" — prevents phone enumeration.
    // Run a dummy bcrypt compare so the response time doesn't reveal which
    // case it was (account-status enumeration via timing).
    await bcrypt.compare(pin, DUMMY_PIN_HASH).catch(() => undefined);
    // We still count a failure so attackers can't probe phones for free.
    await pinAttemptFailed(normalizedPhone);
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  const user = result.rows[0];

  // The PIN is checked FIRST. "Account is suspended" / "not available for
  // admin accounts" used to answer any phone number with any PIN — telling a
  // stranger whose number is an admin or a suspended customer.
  const valid = await bcrypt.compare(pin, user.pin_hash);
  if (!valid) {
    const { lockedUntil } = await pinAttemptFailed(normalizedPhone);
    logger.warn('PIN verify failed', { userId: user.id, lockedUntil });
    if (lockedUntil) {
      const retryAfter = Math.ceil((lockedUntil - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return errorResponse(
        res,
        'Too many failed PIN attempts. Try again later or reset your PIN.',
        429
      );
    }
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  // PIN login is a customer convenience — admin roles must use password login.
  if (['admin', 'super_admin'].includes(user.role)) {
    return errorResponse(res, 'PIN sign-in is not available for admin accounts', 403);
  }

  if (user.status !== 'active') {
    return errorResponse(res, 'Account is suspended. Please contact support.', 403);
  }

  // Successful login resets the failure counter.
  await clearPinFailures(normalizedPhone);

  const tokens = await issueTokenPair(user.id, user.phone, user.role);
  attachAuthCookies(res, tokens);

  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  logger.info('PIN login OK', { userId: user.id });
  authSuccess(
    req,
    res,
    {
      user: {
        id: user.id,
        phone: user.phone,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        is_phone_verified: user.is_phone_verified,
      },
      tokens,
    },
    'Login successful'
  );
});

/**
 * POST /api/auth/reset-pin/confirm
 * Body: { idToken, newPin }. Caller has already done a Firebase OTP via the
 * normal sendOtp flow (so we know the phone owner consented). Verify the
 * Firebase ID token, then overwrite the PIN.
 *
 * No separate /reset-pin/init endpoint — the existing /auth/send-otp covers
 * that step (the client just navigates to the "forgot PIN" screen which
 * triggers send-otp + this confirm).
 */
export const resetPinConfirm = asyncHandler(async (req: Request, res: Response) => {
  const { newPin } = req.body as { newPin: string };
  // Check the new PIN BEFORE the code is verified: verifying uses the code up,
  // so a refused easy PIN used to force a new SMS (B33).
  if (isWeakPin(newPin)) return errorResponse(res, WEAK_PIN_MESSAGE, 400);

  const fbResult = await verifyPhoneFromRequest(req.body);
  if (!fbResult.success || !fbResult.phone) {
    return unauthorizedResponse(res, fbResult.message || 'Invalid verification token');
  }

  const normalizedPhone = normalizePhoneNumber(fbResult.phone);
  const userRow = await query(
    'SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [normalizedPhone]
  );
  if (userRow.rows.length === 0) {
    return errorResponse(res, 'No account found for this phone', 404);
  }

  const pinReady = await ensurePinColumns();
  if (!pinReady) {
    return errorResponse(res, 'PIN reset is not available yet. Please try again shortly.', 503);
  }

  const pinHash = await bcrypt.hash(newPin, PIN_BCRYPT_ROUNDS);
  await query(
    'UPDATE users SET pin_hash = $1, pin_set_at = NOW(), updated_at = NOW() WHERE id = $2',
    [pinHash, userRow.rows[0].id]
  );

  // After a successful OTP-backed reset, clear the brute-force counter.
  await clearPinFailures(normalizedPhone);

  logger.info('PIN reset via OTP', { userId: userRow.rows[0].id });
  successResponse(res, { ok: true }, 'PIN reset successfully');
});
