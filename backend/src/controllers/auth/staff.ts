// Office staff and rider sign-in — moved from auth.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { issueTokenPair, issueAdminTokenPair } from '../../utils/authTokens';
import { asyncHandler } from '../../middleware';
import { successResponse, errorResponse, unauthorizedResponse } from '../../utils/response';
import { normalizePhoneNumber } from '../../utils/validators';
import { verifyOtpBypassCode } from '../../config/otpBypass';
import { admin2faMode } from '../../config/admin2fa';
import {
  ensureOtpTable,
  reserveOtpSend,
  completeOtpSend,
  cancelOtpSend,
  generateOtpCode,
  verifyStoredOtp,
} from '../../services/otpStore.service';
import { deliverOtp } from '../../services/otpSender.service';
import {
  pinAttemptFailed,
  clearPinFailures,
  passwordLockKey,
  reservePinAttempt,
  releasePinAttempt,
} from '../../config/pinLockout';
import logger from '../../utils/logger';
import { loadAdminSession } from '../../utils/adminSession';
import { stripTokensFromAuthData, isAdminCookieClient, setAdminAuthCookies } from '../../utils/authCookies';
import { attachAuthCookies, respondAccountLocked } from './shared';

/**
 * Admin login
 * POST /api/admin/login
 */
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  logger.info('Admin login attempt received', { phone });

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(phone);

  // Per-account lockout — admin accounts are the highest-value target for a
  // distributed password-guessing run; the per-IP limiter alone can't stop it.
  const lockKey = passwordLockKey('admin', normalizedPhone);
  // B39: the attempt is reserved (counted) before the check — guesses sent
  // at the same moment cannot get past the lock.
  const lockState = await reservePinAttempt(lockKey);
  if (!lockState.allowed) {
    logger.warn('Admin login blocked: account locked out', { normalizedPhone });
    return respondAccountLocked(res, lockState.lockedUntil);
  }

  // Find user with admin role
  const result = await query(
    `SELECT u.id, u.phone, u.full_name, u.email, u.password_hash, u.role, u.status, u.admin_role_id
     FROM users u
     JOIN admins a ON u.id = a.user_id
     WHERE u.phone = $1 AND u.role IN ('admin', 'super_admin') AND u.deleted_at IS NULL`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    logger.warn('Admin login failed: no admin user with this phone', { normalizedPhone });
    // Count a failure so attackers can't probe for admin phone numbers for free.
    await pinAttemptFailed(lockKey);
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  const user = result.rows[0];

  // OTP-only accounts have password_hash = NULL — bcrypt.compare would throw.
  if (!user.password_hash) {
    logger.warn('Admin login failed: account has no password set', { userId: user.id });
    await pinAttemptFailed(lockKey);
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    const { lockedUntil } = await pinAttemptFailed(lockKey);
    logger.warn('Admin login failed: password mismatch', { userId: user.id, phone: user.phone, lockedUntil });
    if (lockedUntil) {
      return respondAccountLocked(res, lockedUntil);
    }
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // SECURITY FIX: enforce account status (was missing — suspended admins could log in).
  if (user.status !== 'active') {
    await clearPinFailures(lockKey);
    logger.warn('Admin login blocked: account not active', { userId: user.id, status: user.status });
    return unauthorizedResponse(res, 'Account is not active. Please contact support.');
  }

  // ── Second step: one-time code (see config/admin2fa.ts) ───────────────────
  // The password alone no longer opens the panel. The failure counter is NOT
  // reset by a correct password while this step is on: otherwise someone who
  // has the password could guess codes for ever.
  const twoStep = admin2faMode();
  if (twoStep !== 'off') {
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
    if (!otp) {
      // The right password, now asked for the code: not a wrong answer, so its
      // reserved attempt is given back (B39) — the counter is still NOT reset.
      await releasePinAttempt(lockKey, lockState);
      const challenge: Record<string, unknown> = {
        requires_otp: true,
        otp_bypass: twoStep === 'bypass',
        phone_hint: `${user.phone.slice(0, 5)}…${user.phone.slice(-2)}`,
      };
      if (twoStep === 'code') {
        if (!(await ensureOtpTable())) {
          return errorResponse(res, 'Verification is temporarily unavailable. Please try again.', 503);
        }
        const gate = await reserveOtpSend(user.phone, req.ip || null); // A40
        if (gate.allowed) {
          const code = generateOtpCode();
          const delivery = await deliverOtp(user.phone, code);
          if (!delivery.ok) {
            await cancelOtpSend(gate.reservationId!);
            logger.error('Admin login code could not be delivered', { userId: user.id, error: delivery.error });
            return errorResponse(res, 'Could not send the verification code right now. Please try again.', 502);
          }
          const { expiresInSec } = await completeOtpSend(gate.reservationId!, user.phone, code, delivery.channel);
          challenge.channel = delivery.channel;
          challenge.expires_in = expiresInSec;
        } else {
          // A code was sent moments ago (or the hourly cap is reached): do not
          // send another, the one already delivered is still valid.
          challenge.resend_in = gate.retryAfterSec;
        }
      }
      logger.info('Admin login: password accepted, verification code required', { userId: user.id, mode: twoStep });
      return successResponse(res, challenge, 'Enter the verification code to finish signing in');
    }

    const codeOk =
      twoStep === 'bypass'
        ? verifyOtpBypassCode(otp)
        : (await verifyStoredOtp(user.phone, otp)).success;
    if (!codeOk) {
      const { lockedUntil } = await pinAttemptFailed(lockKey);
      logger.warn('Admin login failed: wrong verification code', { userId: user.id, lockedUntil });
      if (lockedUntil) return respondAccountLocked(res, lockedUntil);
      return unauthorizedResponse(res, 'Incorrect verification code');
    }
  }

  // Password (and code) correct — reset the brute-force counter.
  await clearPinFailures(lockKey);

  // Generate tokens (short-lived access for admin panel — see ADMIN_JWT_EXPIRES_IN)
  const tokens = await issueAdminTokenPair(user.id, user.phone, user.role);

  // Cookie-mode admin panel (ADMIN_AUTH_COOKIES=true + X-Client-Platform:
  // admin): session rides in HttpOnly cookies, tokens never reach JS.
  if (isAdminCookieClient(req)) {
    setAdminAuthCookies(res, tokens);
  }

  // Update last login
  await query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );
  
  await query(
    'UPDATE admins SET last_active_at = NOW() WHERE user_id = $1',
    [user.id]
  );

  // Resolve effective permissions from role assignment
  const session = await loadAdminSession(user.id);
  const permissions = session?.permissions ?? ['*'];
  const roleMeta = session
    ? {
        id: session.admin_role_id,
        name: session.admin_role_name,
        city_name: session.admin_role_city,
        resolved_city_id: session.admin_role_city_id,
        city: session.admin_role_city,
      }
    : null;

  logger.info('Admin logged in', { userId: user.id, phone: user.phone, role: user.role });

  successResponse(res, stripTokensFromAuthData(req, {
    user: {
      id: user.id,
      phone: user.phone,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      admin_role_id: roleMeta?.id || null,
      admin_role_name: roleMeta?.name || null,
      admin_role_city: roleMeta?.city_name || roleMeta?.city || null,
      admin_role_city_id: roleMeta?.resolved_city_id || null,
      permissions,
    },
    tokens,
  }), 'Admin login successful');
});

/**
 * Rider login
 * POST /api/rider/login
 */
export const riderLogin = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(phone);

  // Per-account lockout (same protection as the admin/PIN flows).
  const lockKey = passwordLockKey('rider', normalizedPhone);
  // B39: the attempt is reserved (counted) before the check — guesses sent
  // at the same moment cannot get past the lock.
  const lockState = await reservePinAttempt(lockKey);
  if (!lockState.allowed) {
    return respondAccountLocked(res, lockState.lockedUntil);
  }

  // Find user with rider role
  const result = await query(
    `SELECT u.id, u.phone, u.full_name, u.email, u.password_hash, u.role, u.status,
            r.id as rider_id, r.status as rider_status, r.verification_status
     FROM users u
     JOIN riders r ON u.id = r.user_id AND r.deleted_at IS NULL
     WHERE u.phone = $1 AND u.role = 'rider' AND u.deleted_at IS NULL`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    // Count a failure so attackers can't probe for rider phone numbers for free.
    await pinAttemptFailed(lockKey);
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    return unauthorizedResponse(res, 'Account is not active. Please contact support.');
  }

  // Check rider verification status
  if (user.verification_status === 'rejected') {
    return unauthorizedResponse(res, 'Your rider account has been blocked. Please contact the Fresh Bazar office.');
  }
  if (user.verification_status !== 'verified') {
    return unauthorizedResponse(res, 'Rider account is not verified yet');
  }

  // OTP-only accounts have password_hash = NULL — bcrypt.compare would throw.
  if (!user.password_hash) {
    await pinAttemptFailed(lockKey);
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    const { lockedUntil } = await pinAttemptFailed(lockKey);
    if (lockedUntil) {
      return respondAccountLocked(res, lockedUntil);
    }
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Correct password — reset the brute-force counter.
  await clearPinFailures(lockKey);

  const tokens = await issueTokenPair(user.id, user.phone, user.role);
  attachAuthCookies(res, tokens);

  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  // Signing in is NOT going on duty: the rider stays as he was (offline by
  // default) until he flips the duty switch in the app. Forcing 'available'
  // here put riders who never started work on the dispatch list.

  logger.info('Rider logged in', { userId: user.id, riderId: user.rider_id });

  successResponse(res, {
    user: {
      id: user.id,
      rider_id: user.rider_id,
      phone: user.phone,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      rider_status: user.rider_status,
    },
    tokens,
  }, 'Rider login successful');
});
