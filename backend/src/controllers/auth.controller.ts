// ============================================================================
// AUTHENTICATION CONTROLLER - OTP-based (Twilio Verify)
// ============================================================================

import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { generateTokenPair, verifyRefreshToken } from '../config/jwt';
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
import { getPinStatusForPhone, ensurePinColumns, hasPinColumns } from '../config/pinAuth';
import logger from '../utils/logger';

const SALT_ROUNDS = 12;

// ============================================================================
// STEP 1: SEND OTP (for both login and register)
// POST /api/auth/send-otp
// ============================================================================
export const sendOtpHandler = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;
  const normalizedPhone = normalizePhoneNumber(phone);

  // Check if user exists (frontend uses this to decide login vs register flow)
  const existingUser = await query(
    'SELECT id, full_name, status FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [normalizedPhone]
  );

  const userExists = existingUser.rows.length > 0;

  if (userExists && existingUser.rows[0].status !== 'active') {
    return errorResponse(res, 'Account is suspended. Please contact support.', 403);
  }

  // OTP is sent client-side via Firebase SDK — backend just confirms user existence
  logger.info('Phone check for Firebase OTP flow', { phone: normalizedPhone, userExists });

  successResponse(res, {
    phone: normalizedPhone,
    userExists,
    userName: userExists ? existingUser.rows[0].full_name : null,
    otpBypass: isOtpBypassEnabled(),
  }, isOtpBypassEnabled()
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
  const tokens = generateTokenPair(user.id, user.phone, user.role);

  // Update last login
  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  logger.info('User logged in via Firebase OTP', { userId: user.id, phone: user.phone });

  successResponse(res, {
    user: {
      id: user.id,
      phone: user.phone,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      is_phone_verified: true,
    },
    tokens,
  }, 'Login successful');
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

  // Double-check user doesn't already exist
  const existingUser = await query(
    'SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [normalizedPhone]
  );
  if (existingUser.rows.length > 0) {
    return conflictResponse(res, 'User with this phone number already exists. Please login instead.');
  }

  // Check email uniqueness if provided
  if (email) {
    const existingEmail = await query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );
    if (existingEmail.rows.length > 0) {
      return conflictResponse(res, 'This email is already registered');
    }
  }

  // Hash password (generate random one if not provided, since OTP already verified identity)
  const actualPassword = password || crypto.randomBytes(16).toString('hex') + 'Ab1';
  const passwordHash = await bcrypt.hash(actualPassword, SALT_ROUNDS);

  // Create user with verified phone
  const result = await query(
    `INSERT INTO users (phone, full_name, email, password_hash, role, is_phone_verified, phone_verified_at, last_login_at, login_count)
     VALUES ($1, $2, $3, $4, 'customer', TRUE, NOW(), NOW(), 1)
     RETURNING id, phone, full_name, email, role, created_at`,
    [normalizedPhone, full_name, email ? email.toLowerCase() : null, passwordHash]
  );

  const user = result.rows[0];

  // Generate tokens
  const tokens = generateTokenPair(user.id, user.phone, user.role);

  logger.info('New user registered via Firebase OTP', { userId: user.id, phone: user.phone });

  createdResponse(res, {
    user: {
      id: user.id,
      phone: user.phone,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      is_phone_verified: true,
    },
    tokens,
  }, 'Account created successfully');
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

  const tokens = generateTokenPair(user.id, user.phone, user.role);

  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  logger.info('User logged in via password', { userId: user.id, phone: user.phone });

  successResponse(res, {
    user: {
      id: user.id,
      phone: user.phone,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      is_phone_verified: user.is_phone_verified,
    },
    tokens,
  }, 'Login successful');
});

// ============================================================================
// LEGACY: Direct register (kept for backward compatibility)
// POST /api/auth/register
// ============================================================================
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { phone, full_name, email, password } = req.body;
  const normalizedPhone = normalizePhoneNumber(phone);

  const existingUser = await query(
    'SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [normalizedPhone]
  );
  if (existingUser.rows.length > 0) {
    return conflictResponse(res, 'User with this phone number already exists');
  }

  if (email) {
    const existingEmail = await query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );
    if (existingEmail.rows.length > 0) {
      return conflictResponse(res, 'User with this email already exists');
    }
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO users (phone, full_name, email, password_hash, role, is_phone_verified)
     VALUES ($1, $2, $3, $4, 'customer', FALSE)
     RETURNING id, phone, full_name, email, role, created_at`,
    [normalizedPhone, full_name, email ? email.toLowerCase() : null, passwordHash]
  );

  const user = result.rows[0];
  const tokens = generateTokenPair(user.id, user.phone, user.role);

  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  logger.info('New user registered (legacy)', { userId: user.id, phone: user.phone });

  createdResponse(res, {
    user: {
      id: user.id,
      phone: user.phone,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    },
    tokens,
  }, 'User registered successfully');
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken || req.body.refresh_token;

  if (!refreshToken) {
    return unauthorizedResponse(res, 'Refresh token required');
  }

  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Check if user still exists and is active
    const result = await query(
      'SELECT id, phone, role, status FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return unauthorizedResponse(res, 'User not found');
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return unauthorizedResponse(res, 'Account is not active');
    }

    // Generate new token pair
    const tokens = generateTokenPair(user.id, user.phone, user.role);

    successResponse(res, { tokens }, 'Token refreshed successfully');
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
  // In a stateless JWT setup, logout is handled client-side
  // Here we can add token to blacklist if using Redis
  
  if (req.user) {
    logger.info('User logged out', { userId: req.user.userId });
  }

  successResponse(res, null, 'Logout successful');
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
    // Check if email is already taken
    const existingEmail = await query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
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
     WHERE id = $${paramIndex}
     RETURNING id, phone, full_name, email, preferred_language, notification_enabled, updated_at`,
    values
  );

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

  const { currentPassword, newPassword } = req.body;

  // Get current password hash
  const userResult = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.userId]
  );

  if (userResult.rows.length === 0) {
    return unauthorizedResponse(res, 'User not found');
  }

  const user = userResult.rows[0];

  // Verify current password
  const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);

  if (!isCurrentValid) {
    return unauthorizedResponse(res, 'Current password is incorrect');
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update password
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newPasswordHash, req.user.userId]
  );

  logger.info('Password changed', { userId: req.user.userId });

  successResponse(res, null, 'Password changed successfully');
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
  return successResponse(res, status, 'OK');
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
    // Return the same error for "no user" and "no PIN set" so an attacker
    // can't enumerate which phones are registered.
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    return errorResponse(res, 'Account is suspended. Please contact support.', 403);
  }

  const valid = await bcrypt.compare(pin, user.pin_hash);
  if (!valid) {
    logger.warn('PIN verify failed', { userId: user.id });
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  const tokens = generateTokenPair(user.id, user.phone, user.role);

  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );

  logger.info('PIN login OK', { userId: user.id });
  successResponse(
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
     WHERE u.phone = $1 AND u.role IN ('admin', 'super_admin')`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    logger.warn('Admin login failed: no admin user with this phone', { normalizedPhone });
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  const user = result.rows[0];

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    logger.warn('Admin login failed: password mismatch', { userId: user.id, phone: user.phone });
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Generate tokens
  const tokens = generateTokenPair(user.id, user.phone, user.role);

  // Update last login
  await query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );
  
  await query(
    'UPDATE admins SET last_active_at = NOW() WHERE user_id = $1',
    [user.id]
  );

  // Resolve effective permissions: super_admin gets everything; custom role
  // admins get their role's permission codes; legacy admins keep full access.
  let permissions: string[] = [];
  if (user.role === 'super_admin') {
    permissions = ['*'];
  } else {
    const permResult = await query(
      `SELECT COALESCE(
         ARRAY_AGG(p.code) FILTER (WHERE p.code IS NOT NULL),
         ARRAY[]::text[]
       ) AS permissions
       FROM users u
       LEFT JOIN admin_roles r ON r.id = u.admin_role_id
       LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.id`,
      [user.id]
    );
    permissions = permResult.rows[0]?.permissions || [];
    // Legacy admin without a custom role keeps full access. Custom-role admins
    // with an empty permission set stay restricted (no accidental full access).
    if (permissions.length === 0 && !user.admin_role_id) {
      permissions = ['*'];
    }
  }

  const roleMeta = await query(
    `SELECT r.id, r.name, r.city, r.city_id,
            sc.id AS resolved_city_id,
            sc.name AS city_name
       FROM users u
       LEFT JOIN admin_roles r ON r.id = u.admin_role_id
       LEFT JOIN service_cities sc ON sc.id = COALESCE(
         r.city_id,
         (SELECT id FROM service_cities WHERE LOWER(name) = LOWER(r.city) LIMIT 1)
       )
      WHERE u.id = $1`,
    [user.id]
  );

  logger.info('Admin logged in', { userId: user.id, phone: user.phone, role: user.role });

  successResponse(res, {
    user: {
      id: user.id,
      phone: user.phone,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      admin_role_id: roleMeta.rows[0]?.id || null,
      admin_role_name: roleMeta.rows[0]?.name || null,
      admin_role_city: roleMeta.rows[0]?.city_name || roleMeta.rows[0]?.city || null,
      admin_role_city_id: roleMeta.rows[0]?.resolved_city_id || null,
      permissions,
    },
    tokens,
  }, 'Admin login successful');
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
     WHERE u.phone = $1 AND u.role = 'rider'`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  const user = result.rows[0];

  // Check rider verification status
  if (user.verification_status !== 'verified') {
    return unauthorizedResponse(res, 'Rider account is not verified yet');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Generate tokens
  const tokens = generateTokenPair(user.id, user.phone, user.role);

  // Update last login
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
