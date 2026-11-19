// Password sign-in, session, profile, password change, account deletion — moved from auth.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../utils/caughtError';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/database';
import { verifyRefreshToken, generateSocketToken } from '../../config/jwt';
import { issueTokenPair, rotateRefreshToken } from '../../utils/authTokens';
import { isRefreshTokenAllowed, revokeRefreshToken, revokeAllUserRefreshTokens } from '../../services/refreshToken.service';
import { asyncHandler } from '../../middleware';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  conflictResponse,
} from '../../utils/response';
import { normalizePhoneNumber } from '../../utils/validators';
import { ensurePinColumns, hasPinColumns } from '../../config/pinAuth';
import {
  pinAttemptFailed,
  clearPinFailures,
  passwordLockKey,
  reservePinAttempt,
} from '../../config/pinLockout';
import logger from '../../utils/logger';
import { openWorkForCustomer, openWorkMessage } from '../../utils/openWork';
import { disconnectUserSockets } from '../../config/socket';
import { deleteStoragePaths, objectPathFromSupabasePublicUrl } from '../../config/storage';
import {
  clearAuthCookies,
  getRefreshTokenFromRequest,
  setSessionCookies,
  clearSessionCookies,
} from '../../utils/authCookies';
import { SALT_ROUNDS, attachAuthCookies, authSuccess, respondAccountLocked, DUMMY_PIN_HASH } from './shared';

// ============================================================================
// LEGACY: Password-based login (kept for admin/rider compatibility)
// POST /api/auth/login
// ============================================================================
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  const normalizedPhone = normalizePhoneNumber(phone);

  const lockKey = passwordLockKey('user', normalizedPhone);
  // B39: the attempt is reserved (counted) before the check — guesses sent
  // at the same moment cannot get past the lock.
  const lockState = await reservePinAttempt(lockKey);
  if (!lockState.allowed) {
    return respondAccountLocked(res, lockState.lockedUntil);
  }

  const result = await query(
    `SELECT id, phone, full_name, email, password_hash, role, status, is_phone_verified
     FROM users WHERE phone = $1 AND deleted_at IS NULL`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    // Equalise timing with the wrong-password path (bcrypt cost) so probing
    // can't tell "no such account" from "wrong password".
    await bcrypt.compare(password, DUMMY_PIN_HASH).catch(() => undefined);
    // Count a failure so attackers can't probe phone numbers for free.
    await pinAttemptFailed(lockKey);
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
    const { lockedUntil } = await pinAttemptFailed(lockKey);
    if (lockedUntil) {
      return respondAccountLocked(res, lockedUntil);
    }
    return unauthorizedResponse(res, 'Invalid phone number or password');
  }

  // Correct password — reset the brute-force counter.
  await clearPinFailures(lockKey);

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
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
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
    // Admin panel (cookie mode) and website each get their own cookies back.
    setSessionCookies(req, res, tokens);

    authSuccess(req, res, { tokens }, 'Token refreshed successfully');
  } catch (errorCaught: unknown) {
    const error = asCaughtError(errorCaught);
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
  // App builds from before November 2026 call logout WITHOUT the refresh
  // token, so there is no way to tell which session to end. Leaving the token
  // alive after "logout" is the worse outcome: for an authenticated caller
  // that presents no token, end every session of that user.
  const noTokenPresented = !refreshTokenValue && Boolean(req.user?.id);
  if ((req.body?.all === true || noTokenPresented) && req.user?.id) {
    await revokeAllUserRefreshTokens(req.user.id);
    // Every session ended → every live socket too (B29). A single-device
    // logout leaves the other devices' sockets alone; that device closes its own.
    disconnectUserSockets(req.user.id);
  }

  if (req.user) {
    logger.info('User logged out', { userId: req.user.userId, all: req.body?.all === true });
  }

  clearSessionCookies(req, res);
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
  const values: unknown[] = [];
  let paramIndex = 1;

  if (full_name !== undefined) {
    updates.push(`full_name = $${paramIndex++}`);
    values.push(full_name);
  }

  if (email !== undefined) {
    const trimmed = email === null ? '' : String(email).trim().toLowerCase();
    if (trimmed === '') {
      // Empty / null clears the email (the profile page offers "remove").
      updates.push(`email = $${paramIndex++}`);
      values.push(null);
    } else {
      // This route has no Joi schema, so validate the shape here.
      if (trimmed.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return errorResponse(res, 'Enter a valid email address', 400);
      }
      // Email uniqueness must ignore soft-deleted users so a recycled address
      // doesn't appear to be taken forever.
      const existingEmail = await query(
        'SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
        [trimmed, req.user.userId]
      );
      if (existingEmail.rows.length > 0) {
        return conflictResponse(res, 'Email already in use');
      }
      updates.push(`email = $${paramIndex++}`);
      values.push(trimmed);
    }
  }

  if (preferred_language !== undefined) {
    if (preferred_language !== 'en' && preferred_language !== 'ur') {
      return errorResponse(res, 'preferred_language must be en or ur', 400);
    }
    updates.push(`preferred_language = $${paramIndex++}`);
    values.push(preferred_language);
  }

  if (notification_enabled !== undefined) {
    if (typeof notification_enabled !== 'boolean') {
      return errorResponse(res, 'notification_enabled must be true or false', 400);
    }
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
    // 400, not 401: the session is fine — a 401 makes the clients log the
    // user out for a typo in a confirmation field.
    return errorResponse(res, 'Current password is incorrect', 400);
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
  let doorPictureUrls: string[] = [];

  // Deleting is forever, so a session alone is not enough: the customer types
  // their PIN again (a stolen or borrowed phone session must not be able to
  // erase the account). Wrong tries count towards the same lockout as login.
  // An account that never set a PIN (signed in by OTP only) has nothing to
  // ask for and may delete itself.
  await ensurePinColumns();
  if (await hasPinColumns()) {
    const own = await query(`SELECT phone, pin_hash FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
    const row = own.rows[0];
    if (!row) return unauthorizedResponse(res, 'Authentication required');
    if (row.pin_hash) {
      // B39: the attempt is reserved (counted) before the check — guesses sent
      // at the same moment cannot get past the lock.
      const lockState = await reservePinAttempt(row.phone);
      if (!lockState.allowed) {
        res.setHeader('Retry-After', String(Math.ceil((lockState.lockedUntil - Date.now()) / 1000)));
        return errorResponse(res, 'Too many failed PIN attempts. Try again later.', 429);
      }
      const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
      if (!/^\d{4}$/.test(pin)) {
        return errorResponse(res, 'Enter your 4-digit PIN to delete your account.', 400);
      }
      if (!(await bcrypt.compare(pin, row.pin_hash))) {
        const { lockedUntil } = await pinAttemptFailed(row.phone);
        logger.warn('Account delete refused: wrong PIN', { userId, lockedUntil });
        if (lockedUntil) {
          res.setHeader('Retry-After', String(Math.ceil((lockedUntil - Date.now()) / 1000)));
          return errorResponse(res, 'Too many failed PIN attempts. Try again later.', 429);
        }
        // 400, not 401: the apps treat 401 as "session ended" and log out.
        return errorResponse(res, 'Incorrect PIN. Your account was not deleted.', 400);
      }
      await clearPinFailures(row.phone);
    }
  }

  // Not while an order or atta request is on its way: the rider and the
  // office still need the name, phone and address (A27).
  const busy = openWorkMessage(await openWorkForCustomer(userId));
  if (busy) return errorResponse(res, busy, 409);

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
    // Soft-delete + scrub the saved addresses instead of DELETE-ing them. A
    // hard DELETE violated the orders.address_id FK (NO ACTION) for every
    // customer who had ever ordered — the whole deletion rolled back with a
    // 500 — and cascade-deleted their atta_requests (financial records). The
    // rows stay so orders keep a valid address_id; every identifying field is
    // wiped. Door pictures are removed from storage after commit (below).
    const pics = await client.query<{ door_picture_url: string }>(
      `SELECT door_picture_url FROM addresses
        WHERE user_id = $1 AND door_picture_url IS NOT NULL AND door_picture_url <> ''`,
      [userId]
    );
    doorPictureUrls = pics.rows.map((r) => r.door_picture_url);
    await client.query(
      `UPDATE addresses SET
         deleted_at = NOW(),
         is_default = FALSE,
         written_address = 'Deleted',
         landmark = NULL,
         area_name = NULL,
         postal_code = NULL,
         location = NULL,
         location_accuracy = NULL,
         google_place_id = NULL,
         door_picture_url = NULL,
         delivery_instructions = NULL,
         updated_at = NOW()
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    // The wishlist goes with the account (W22; table from migration 75).
    const wl = await client.query(`SELECT to_regclass('public.wishlist_items') IS NOT NULL AS ok`);
    if (wl.rows[0]?.ok) await client.query(`DELETE FROM wishlist_items WHERE user_id = $1`, [userId]);
  });

  // Best-effort PII cleanup of door photos (never blocks the deletion).
  const storagePaths = doorPictureUrls
    .map((u) => objectPathFromSupabasePublicUrl(u))
    .filter((p): p is string => Boolean(p));
  if (storagePaths.length > 0) {
    deleteStoragePaths(storagePaths).catch((err) =>
      logger.warn('Could not delete door pictures for deleted account', { userId, err })
    );
  }

  // Kill every session on every device — and every live socket (B29).
  await revokeAllUserRefreshTokens(userId);
  disconnectUserSockets(userId);
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
