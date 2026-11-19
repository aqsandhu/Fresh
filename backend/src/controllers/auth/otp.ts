// One-time code sign-in and sign-up — moved from auth.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../utils/caughtError';
import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { issueTokenPair } from '../../utils/authTokens';
import { asyncHandler } from '../../middleware';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  conflictResponse,
} from '../../utils/response';
import { normalizePhoneNumber } from '../../utils/validators';
import { verifyPhoneFromRequest } from '../../services/otp.service';
import { isOtpBypassEnabled } from '../../config/otpBypass';
import { getOtpMode, OTP_RESEND_COOLDOWN_SECONDS } from '../../config/otpProvider';
import {
  ensureOtpTable,
  reserveOtpSend,
  completeOtpSend,
  cancelOtpSend,
  generateOtpCode,
} from '../../services/otpStore.service';
import { deliverOtp } from '../../services/otpSender.service';
import logger from '../../utils/logger';
import { SALT_ROUNDS, attachAuthCookies, authSuccess } from './shared';

// ============================================================================
// STEP 1: SEND OTP (for both login and register)
// POST /api/auth/send-otp
// ----------------------------------------------------------------------------
// mode 'bypass'   → fixed code, nothing sent
// mode 'backend'  → we generate the code and send it: WhatsApp Cloud API
//                   first (cheapest in PK), SMS gateway fallback
// mode 'firebase' → OTP is sent client-side via the Firebase SDK; backend
//                   just confirms user existence
// ============================================================================
export const sendOtpHandler = asyncHandler(async (req: Request, res: Response) => {
  const { phone, channel } = req.body as { phone: string; channel?: 'whatsapp' | 'sms' };
  const normalizedPhone = normalizePhoneNumber(phone);
  const mode = getOtpMode();

  // Check if user exists (frontend uses this to decide login vs register flow)
  const existingUser = await query(
    'SELECT id, status FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [normalizedPhone]
  );

  const userExists = existingUser.rows.length > 0;

  if (userExists && existingUser.rows[0].status !== 'active') {
    return errorResponse(res, 'Account is suspended. Please contact support.', 403);
  }

  // PII/enumeration hardening: `userExists` stays (the website + apps branch
  // login-vs-register on it), but NEVER leak the account holder's name to an
  // unauthenticated caller — a phone-number → full-name oracle is a PII leak.
  const baseData = {
    phone: normalizedPhone,
    userExists,
    otpBypass: isOtpBypassEnabled(),
    mode,
  };

  if (mode === 'backend') {
    if (!(await ensureOtpTable())) {
      return errorResponse(res, 'Verification is temporarily unavailable. Please try again.', 503);
    }

    // Anti SMS-pumping: per-phone cooldown + per-phone/per-IP hourly caps.
    const ip = req.ip || null;
    // Check + hold the slot atomically (A40): parallel requests for one number
    // can no longer all pass the gate and each send an SMS.
    const gate = await reserveOtpSend(normalizedPhone, ip, channel || 'sms');
    if (!gate.allowed) {
      res.setHeader('Retry-After', String(gate.retryAfterSec));
      return errorResponse(res, gate.reason, 429);
    }

    // A failed send gives the slot back — it must not burn the quota / cooldown.
    const code = generateOtpCode();
    const delivery = await deliverOtp(normalizedPhone, code, channel);

    if (!delivery.ok) {
      await cancelOtpSend(gate.reservationId!);
      logger.error('OTP delivery failed on every channel', {
        phone: normalizedPhone,
        error: delivery.error,
      });
      return errorResponse(res, 'Could not send the code right now. Please try again.', 502);
    }

    const { expiresInSec } = await completeOtpSend(gate.reservationId!, normalizedPhone, code, delivery.channel);
    logger.info('Backend OTP sent', { phone: normalizedPhone, channel: delivery.channel, userExists });

    return successResponse(
      res,
      {
        ...baseData,
        channel: delivery.channel,
        expiresInSec,
        resendInSec: OTP_RESEND_COOLDOWN_SECONDS,
      },
      delivery.channel === 'whatsapp' ? 'Code sent on WhatsApp' : 'Code sent via SMS'
    );
  }

  logger.info('Phone check for OTP flow', { phone: normalizedPhone, userExists, mode });

  successResponse(res, baseData, isOtpBypassEnabled()
    ? 'OTP bypass active — use the configured fixed code'
    : 'Ready for OTP verification');
});

// ============================================================================
// STEP 2a: VERIFY OTP & LOGIN (existing user)
// POST /api/auth/verify-login
// ============================================================================
export const verifyLoginOtp = asyncHandler(async (req: Request, res: Response) => {
  const tokenResult = await verifyPhoneFromRequest(req.body);
  if (!tokenResult.success) {
    return unauthorizedResponse(res, tokenResult.message);
  }

  const normalizedPhone = tokenResult.phone!;

  // Find user
  const result = await query(
    `SELECT id, phone, full_name, email, role, status, is_phone_verified
     FROM users WHERE phone = $1 AND deleted_at IS NULL`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    return errorResponse(res, 'Account not found. Please register first.', 404);
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    return errorResponse(res, 'Account is suspended. Please contact support.', 403);
  }

  // Mark phone as verified if not already
  if (!user.is_phone_verified) {
    await query(
      'UPDATE users SET is_phone_verified = TRUE, phone_verified_at = NOW() WHERE id = $1',
      [user.id]
    );
  }

  // Generate tokens
  const tokens = await issueTokenPair(user.id, user.phone, user.role);
  attachAuthCookies(res, tokens);

  // Update last login
  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  logger.info('User logged in via Firebase OTP', { userId: user.id, phone: user.phone });

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
        is_phone_verified: true,
      },
      tokens,
    },
    'Login successful'
  );
});

// ============================================================================
// STEP 2b: VERIFY OTP & REGISTER (new user)
// POST /api/auth/verify-register
// ============================================================================
export const verifyRegisterOtp = asyncHandler(async (req: Request, res: Response) => {
  const { full_name, email, password } = req.body;

  const tokenResult = await verifyPhoneFromRequest(req.body);
  if (!tokenResult.success) {
    return unauthorizedResponse(res, tokenResult.message);
  }

  const normalizedPhone = tokenResult.phone!;

  const actualPassword = password || crypto.randomBytes(16).toString('hex') + 'Ab1';
  const passwordHash = await bcrypt.hash(actualPassword, SALT_ROUNDS);

  // Fast UX pre-check — try/catch on INSERT is the actual race-condition safety net.
  const existingPhone = await query(
    'SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [normalizedPhone]
  );
  if (existingPhone.rows.length > 0) {
    return conflictResponse(res, 'User with this phone number already exists. Please login instead.');
  }

  let user;
  try {
    if (email) {
      const existingEmail = await query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase()]
      );
      if (existingEmail.rows.length > 0) {
        return conflictResponse(res, 'This email is already registered');
      }
    }

    const result = await query(
      `INSERT INTO users (phone, full_name, email, password_hash, role, is_phone_verified, phone_verified_at, last_login_at, login_count)
       VALUES ($1, $2, $3, $4, 'customer', TRUE, NOW(), NOW(), 1)
       RETURNING id, phone, full_name, email, role, created_at`,
      [normalizedPhone, full_name, email ? email.toLowerCase() : null, passwordHash]
    );
    user = result.rows[0];
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.code === '23505') {
      const constraint = String(err?.constraint || '');
      if (constraint.includes('email')) {
        return conflictResponse(res, 'This email is already registered');
      }
      return conflictResponse(res, 'User with this phone number already exists. Please login instead.');
    }
    throw err;
  }

  const tokens = await issueTokenPair(user.id, user.phone, user.role);
  attachAuthCookies(res, tokens);

  logger.info('New user registered via Firebase OTP', { userId: user.id, phone: user.phone });

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
        is_phone_verified: true,
      },
      tokens,
    },
    'Account created successfully',
    201
  );
});
