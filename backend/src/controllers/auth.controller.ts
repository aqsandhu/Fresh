// ============================================================================
// AUTHENTICATION CONTROLLER - OTP-based (Twilio Verify)
// ============================================================================

import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database';
import { verifyRefreshToken, generateSocketToken } from '../config/jwt';
import { issueTokenPair, issueAdminTokenPair, rotateRefreshToken } from '../utils/authTokens';
import {
  isRefreshTokenAllowed,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from '../services/refreshToken.service';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  errorResponse,
  createdResponse,
  unauthorizedResponse,
  conflictResponse,
} from '../utils/response';
import { normalizePhoneNumber } from '../utils/validators';
import { verifyPhoneFromRequest } from '../services/otp.service';
import { isOtpBypassEnabled } from '../config/otpBypass';
import { getOtpMode, OTP_RESEND_COOLDOWN_SECONDS } from '../config/otpProvider';
import {
  ensureOtpTable,
  checkSendAllowed,
  generateOtpCode,
  persistOtp,
} from '../services/otpStore.service';
import { deliverOtp } from '../services/otpSender.service';
import { getPinStatusForPhone, ensurePinColumns, hasPinColumns } from '../config/pinAuth';
import {
  getPinLockoutState,
  registerPinFailure,
  clearPinFailures,
} from '../config/pinLockout';
import logger from '../utils/logger';
import { loadAdminSession } from '../utils/adminSession';
import {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromRequest,
  stripTokensFromAuthData,
  isAdminCookieClient,
} from '../utils/authCookies';

const SALT_ROUNDS = 12;

function attachAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string }
): void {
  setAuthCookies(res, tokens);
}

function authSuccess<T extends Record<string, unknown>>(
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
    'SELECT id, full_name, status FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [normalizedPhone]
  );

  const userExists = existingUser.rows.length > 0;

  if (userExists && existingUser.rows[0].status !== 'active') {
    return errorResponse(res, 'Account is suspended. Please contact support.', 403);
  }

  const baseData = {
    phone: normalizedPhone,
    userExists,
    userName: userExists ? existingUser.rows[0].full_name : null,
    otpBypass: isOtpBypassEnabled(),
    mode,
  };

  if (mode === 'backend') {
    if (!(await ensureOtpTable())) {
      return errorResponse(res, 'Verification is temporarily unavailable. Please try again.', 503);
    }

    // Anti SMS-pumping: per-phone cooldown + per-phone/per-IP hourly caps.
    const ip = req.ip || null;
    const gate = await checkSendAllowed(normalizedPhone, ip);
    if (!gate.allowed) {
      res.setHeader('Retry-After', String(gate.retryAfterSec));
      return errorResponse(res, gate.reason, 429);
    }

    // Deliver first, persist only on success — a failed send must not burn
    // the user's per-hour quota or resend cooldown.
    const code = generateOtpCode();
    const delivery = await deliverOtp(normalizedPhone, code, channel);

    if (!delivery.ok) {
      logger.error('OTP delivery failed on every channel', {
        phone: normalizedPhone,
        error: delivery.error,
      });
      return errorResponse(res, 'Could not send the code right now. Please try again.', 502);
    }

    const { expiresInSec } = await persistOtp(normalizedPhone, code, delivery.channel, ip);
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
  } catch (err: any) {
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

// ============================================================================
// LEGACY: Password-based login (kept for admin/rider compatibility)
// POST /api/auth/login
// ============================================================================
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  const normalizedPhone = normalizePhoneNumber(phone);

  const result = await query(
    `SELECT id, phone, full_name, email, password_hash, role, status, is_phone_verified
     FROM users WHERE phone = $1 AND deleted_at IS NULL`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    return unauthorizedResponse(res, 'Invalid phone number or password');
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    return unauthorizedResponse(res, 'Account is not active. Please contact support.');
  }

  if (!user.password_hash) {
    return errorResponse(res, 'This account uses OTP login. Password login is not available.', 400);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    return unauthorizedResponse(res, 'Invalid phone number or password');
  }

  const tokens = await issueTokenPair(user.id, user.phone, user.role);
  attachAuthCookies(res, tokens);

  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  logger.info('User logged in via password', { userId: user.id, phone: user.phone });

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

// ============================================================================
// LEGACY: Direct register (kept for backward compatibility)
// POST /api/auth/register
// ============================================================================
export const register = asyncHandler(async (req: Request, res: Response) => {
  if (process.env.LEGACY_PASSWORD_REGISTER !== 'true') {
    return errorResponse(
      res,
      'Direct password registration is disabled. Please verify your phone with OTP.',
      403
    );
  }

  const { phone, full_name, email, password } = req.body;
  const normalizedPhone = normalizePhoneNumber(phone);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await withTransaction(async (client) => {
      if (email) {
        const existingEmail = await client.query(
          'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
          [email.toLowerCase()]
        );
        if (existingEmail.rows.length > 0) {
          throw Object.assign(new Error('EMAIL_EXISTS'), { code: 'EMAIL_EXISTS' });
        }
      }

      const result = await client.query(
        `INSERT INTO users (phone, full_name, email, password_hash, role, is_phone_verified)
         VALUES ($1, $2, $3, $4, 'customer', FALSE)
         ON CONFLICT (phone) DO NOTHING
         RETURNING id, phone, full_name, email, role, created_at`,
        [normalizedPhone, full_name, email ? email.toLowerCase() : null, passwordHash]
      );

      if (result.rows.length === 0) {
        throw Object.assign(new Error('PHONE_EXISTS'), { code: 'PHONE_EXISTS' });
      }

      const inserted = result.rows[0];
      await client.query(
        'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
        [inserted.id]
      );
      return inserted;
    });
  } catch (err: any) {
    if (err?.code === 'EMAIL_EXISTS') {
      return conflictResponse(res, 'User with this email already exists');
    }
    if (err?.code === 'PHONE_EXISTS' || err?.code === '23505') {
      return conflictResponse(res, 'User with this phone number already exists');
    }
    throw err;
  }

  const tokens = await issueTokenPair(user.id, user.phone, user.role);
  attachAuthCookies(res, tokens);

  logger.info('New user registered (legacy)', { userId: user.id, phone: user.phone });

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
      },
      tokens,
    },
    'User registered successfully',
    201
  );
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const refreshTokenValue = getRefreshTokenFromRequest(req);

  if (!refreshTokenValue) {
    return unauthorizedResponse(res, 'Refresh token required');
  }

  try {
    const decoded = verifyRefreshToken(refreshTokenValue);

    if (!(await isRefreshTokenAllowed(refreshTokenValue))) {
      return unauthorizedResponse(res, 'Refresh token revoked');
    }

    const result = await query(
      'SELECT id, phone, role, status FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return unauthorizedResponse(res, 'User not found');
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return unauthorizedResponse(res, 'Account is not active');
    }

    const tokens = await rotateRefreshToken(
      user.id,
      user.phone,
      user.role,
      refreshTokenValue
    );
    attachAuthCookies(res, tokens);

    authSuccess(req, res, { tokens }, 'Token refreshed successfully');
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return unauthorizedResponse(res, 'Refresh token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      return unauthorizedResponse(res, 'Invalid refresh token');
    }
    throw error;
  }
});

/**
 * Logout user (optional - for token blacklist)
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // Default: revoke ONLY this session's refresh token. Logging out of one
  // device must not kill the user's other devices — pass { all: true } for
  // an explicit "log out everywhere".
  const refreshTokenValue = getRefreshTokenFromRequest(req);
  if (refreshTokenValue) {
    await revokeRefreshToken(refreshTokenValue);
  }
  if (req.body?.all === true && req.user?.id) {
    await revokeAllUserRefreshTokens(req.user.id);
  }

  if (req.user) {
    logger.info('User logged out', { userId: req.user.userId, all: req.body?.all === true });
  }

  clearAuthCookies(res);
  successResponse(res, null, 'Logout successful');
});

/**
 * Issue a short-lived token for authenticating a Socket.IO handshake.
 * GET /api/auth/socket-token
 *
 * Browser clients use HttpOnly-cookie auth and connect the websocket directly
 * to the backend host, which is cross-site — the cookie isn't sent. They call
 * this (same-origin, cookie-authenticated) to obtain a token they can pass in
 * the socket handshake instead.
 */
export const getSocketToken = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required');
  }
  const token = generateSocketToken(req.user.userId, req.user.phone, req.user.role);
  successResponse(res, { token }, 'Socket token issued');
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required');
  }

  const result = await query(
    `SELECT id, phone, full_name, email, role, avatar_url, 
            is_phone_verified, is_email_verified, preferred_language,
            notification_enabled, last_login_at, created_at
     FROM users 
     WHERE id = $1`,
    [req.user.userId]
  );

  if (result.rows.length === 0) {
    return unauthorizedResponse(res, 'User not found');
  }

  successResponse(res, result.rows[0], 'User profile retrieved');
});

/**
 * Update user profile
 * PUT /api/auth/profile
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required');
  }

  const { full_name, email, preferred_language, notification_enabled } = req.body;

  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (full_name !== undefined) {
    updates.push(`full_name = $${paramIndex++}`);
    values.push(full_name);
  }

  if (email !== undefined) {
    // Email uniqueness must ignore soft-deleted users so a recycled address
    // doesn't appear to be taken forever.
    const existingEmail = await query(
      'SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
      [email.toLowerCase(), req.user.userId]
    );
    if (existingEmail.rows.length > 0) {
      return conflictResponse(res, 'Email already in use');
    }
    updates.push(`email = $${paramIndex++}`);
    values.push(email.toLowerCase());
  }

  if (preferred_language !== undefined) {
    updates.push(`preferred_language = $${paramIndex++}`);
    values.push(preferred_language);
  }

  if (notification_enabled !== undefined) {
    updates.push(`notification_enabled = $${paramIndex++}`);
    values.push(notification_enabled);
  }

  if (updates.length === 0) {
    return errorResponse(res, 'No fields to update', 400);
  }

  values.push(req.user.userId);

  const result = await query(
    `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex} AND status = 'active' AND deleted_at IS NULL
     RETURNING id, phone, full_name, email, preferred_language, notification_enabled, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    return unauthorizedResponse(res, 'User not found or inactive');
  }

  successResponse(res, result.rows[0], 'Profile updated successfully');
});

/**
 * Change password
 * PUT /api/auth/change-password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required');
  }

  const currentPassword = req.body.currentPassword ?? req.body.current_password;
  const newPassword = req.body.newPassword ?? req.body.new_password;

  // Get current password hash
  const userResult = await query(
    'SELECT password_hash FROM users WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
    [req.user.userId, 'active']
  );

  if (userResult.rows.length === 0) {
    return unauthorizedResponse(res, 'User not found');
  }

  const user = userResult.rows[0];

  // OTP-only accounts (registered via Firebase OTP without ever setting a
  // password) have password_hash = NULL. They must use the OTP flow instead
  // of attempting a "change password".
  if (!user.password_hash) {
    return errorResponse(
      res,
      'This account uses OTP login. Set a password via the reset flow first.',
      400
    );
  }

  // Verify current password
  const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);

  if (!isCurrentValid) {
    return unauthorizedResponse(res, 'Current password is incorrect');
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update password
  const updateResult = await query(
    `UPDATE users
        SET password_hash = $1, updated_at = NOW()
      WHERE id = $2 AND status = $3 AND deleted_at IS NULL
      RETURNING id`,
    [newPasswordHash, req.user.userId, 'active']
  );

  if (updateResult.rows.length === 0) {
    return unauthorizedResponse(res, 'User not found or inactive');
  }

  // A password change invalidates every other session — if the password was
  // changed because it leaked, stolen refresh tokens must die with it.
  await revokeAllUserRefreshTokens(req.user.userId);

  logger.info('Password changed', { userId: req.user.userId });

  successResponse(res, null, 'Password changed successfully');
});

/**
 * DELETE ACCOUNT (self-service — Play Store / App Store requirement)
 * POST /api/auth/delete-account
 *
 * Anonymizes the account rather than hard-deleting: PII (name, phone, email,
 * avatar, credentials, push tokens, saved addresses) is removed immediately,
 * while order/financial rows stay for legal record-keeping — they no longer
 * point to any identifiable person. The freed phone number can register a
 * brand-new account afterwards.
 */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required');
  }
  // Workforce accounts (riders/admins) are managed by the company, not
  // self-deleted from an app.
  if (req.user.role && req.user.role !== 'customer') {
    return errorResponse(res, 'Only customer accounts can be deleted from the app', 403);
  }

  const userId = req.user.userId;

  await withTransaction(async (client) => {
    // Anonymized phone must stay unique and fit VARCHAR(20).
    await client.query(
      `UPDATE users SET
         status = 'deleted',
         deleted_at = NOW(),
         deleted_by = id,
         full_name = 'Deleted User',
         email = NULL,
         phone = 'del_' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 12),
         password_hash = NULL,
         pin_hash = NULL,
         avatar_url = NULL,
         device_tokens = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    await client.query(`DELETE FROM addresses WHERE user_id = $1`, [userId]);
  });

  // Kill every session on every device.
  await revokeAllUserRefreshTokens(userId);
  clearAuthCookies(res);

  logger.info('Account deleted (self-service)', { userId });

  successResponse(res, null, 'Your account has been deleted');
});

// ============================================================================
// 4-DIGIT PIN AUTH
// ----------------------------------------------------------------------------
// Lets a customer log in / re-confirm sensitive actions with a 4-digit PIN
// after the one-time OTP at registration. Stored as a bcrypt hash on
// users.pin_hash. Wraps the existing JWT issuance flow so downstream
// controllers don't need to know which factor was used.
// ============================================================================

const PIN_BCRYPT_ROUNDS = 10;

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
 * Authenticated. Body: { pin }. Sets / replaces the user's 4-digit PIN.
 * Used right after OTP register and from Settings → Change PIN.
 */
export const setPin = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.id) return unauthorizedResponse(res, 'Authentication required');
  const { pin } = req.body as { pin: string };

  const pinReady = await ensurePinColumns();
  if (!pinReady) {
    return errorResponse(
      res,
      'PIN is not available yet. Database migration pending — please try again in a minute.',
      503
    );
  }

  const pinHash = await bcrypt.hash(pin, PIN_BCRYPT_ROUNDS);
  const result = await query(
    `UPDATE users SET pin_hash = $1, pin_set_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [pinHash, req.user.id]
  );
  if (result.rows.length === 0) return unauthorizedResponse(res, 'User not found');

  logger.info('PIN set', { userId: req.user.id });
  successResponse(res, { ok: true }, 'PIN saved');
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
  const lockState = await getPinLockoutState(normalizedPhone);
  if (lockState.lockedUntil && lockState.lockedUntil > Date.now()) {
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
    // We still count a failure so attackers can't probe phones for free.
    await registerPinFailure(normalizedPhone);
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    return errorResponse(res, 'Account is suspended. Please contact support.', 403);
  }

  const valid = await bcrypt.compare(pin, user.pin_hash);
  if (!valid) {
    const { lockedUntil } = await registerPinFailure(normalizedPhone);
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

/**
 * Admin login
 * POST /api/admin/login
 */
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  logger.info('Admin login attempt received', { phone });

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(phone);

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
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  const user = result.rows[0];

  // OTP-only accounts have password_hash = NULL — bcrypt.compare would throw.
  if (!user.password_hash) {
    logger.warn('Admin login failed: account has no password set', { userId: user.id });
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    logger.warn('Admin login failed: password mismatch', { userId: user.id, phone: user.phone });
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // SECURITY FIX: enforce account status (was missing — suspended admins could log in).
  if (user.status !== 'active') {
    logger.warn('Admin login blocked: account not active', { userId: user.id, status: user.status });
    return unauthorizedResponse(res, 'Account is not active. Please contact support.');
  }

  // Generate tokens (short-lived access for admin panel — see ADMIN_JWT_EXPIRES_IN)
  const tokens = await issueAdminTokenPair(user.id, user.phone, user.role);

  // Cookie-mode admin panel (ADMIN_AUTH_COOKIES=true + X-Client-Platform:
  // admin): session rides in HttpOnly cookies, tokens never reach JS.
  if (isAdminCookieClient(req)) {
    setAuthCookies(res, tokens);
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

  // Find user with rider role
  const result = await query(
    `SELECT u.id, u.phone, u.full_name, u.email, u.password_hash, u.role, u.status,
            r.id as rider_id, r.status as rider_status, r.verification_status
     FROM users u
     JOIN riders r ON u.id = r.user_id
     WHERE u.phone = $1 AND u.role = 'rider' AND u.deleted_at IS NULL`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    return unauthorizedResponse(res, 'Account is not active. Please contact support.');
  }

  // Check rider verification status
  if (user.verification_status !== 'verified') {
    return unauthorizedResponse(res, 'Rider account is not verified yet');
  }

  // OTP-only accounts have password_hash = NULL — bcrypt.compare would throw.
  if (!user.password_hash) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  const tokens = await issueTokenPair(user.id, user.phone, user.role);
  attachAuthCookies(res, tokens);

  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  // Update rider status to available
  await query(
    "UPDATE riders SET status = 'available', updated_at = NOW() WHERE id = $1",
    [user.rider_id]
  );

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
