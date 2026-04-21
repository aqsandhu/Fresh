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
import { sendOtp, verifyOtp, OtpChannel } from '../services/otp.service';
import logger from '../utils/logger';

const SALT_ROUNDS = 12;

// ============================================================================
// STEP 1: SEND OTP (for both login and register)
// POST /api/auth/send-otp
// ============================================================================
export const sendOtpHandler = asyncHandler(async (req: Request, res: Response) => {
  const { phone, channel = 'sms' } = req.body;
  const normalizedPhone = normalizePhoneNumber(phone);

  // Validate channel
  const validChannels: OtpChannel[] = ['sms', 'whatsapp', 'call'];
  if (!validChannels.includes(channel)) {
    return errorResponse(res, 'Invalid channel. Use: sms, whatsapp, or call', 400);
  }

  // Check if user exists (to tell frontend whether to show register or login form)
  const existingUser = await query(
    'SELECT id, full_name, status FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [normalizedPhone]
  );

  const userExists = existingUser.rows.length > 0;

  if (userExists && existingUser.rows[0].status !== 'active') {
    return errorResponse(res, 'Account is suspended. Please contact support.', 403);
  }

  // Send OTP via Twilio Verify
  const result = await sendOtp(normalizedPhone, channel as OtpChannel);

  if (!result.success) {
    return errorResponse(res, result.message, 400);
  }

  logger.info('OTP sent', { phone: normalizedPhone, channel, userExists });

  successResponse(res, {
    phone: normalizedPhone,
    channel,
    userExists,
    userName: userExists ? existingUser.rows[0].full_name : null,
  }, result.message);
});

// ============================================================================
// STEP 2a: VERIFY OTP & LOGIN (existing user)
// POST /api/auth/verify-login
// ============================================================================
export const verifyLoginOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, code } = req.body;
  const normalizedPhone = normalizePhoneNumber(phone);

  // Verify OTP with Twilio
  const otpResult = await verifyOtp(normalizedPhone, code);
  if (!otpResult.success) {
    return unauthorizedResponse(res, otpResult.message);
  }

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

  logger.info('User logged in via OTP', { userId: user.id, phone: user.phone });

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
  const { phone, code, full_name, email, password } = req.body;
  const normalizedPhone = normalizePhoneNumber(phone);

  // Verify OTP with Twilio
  const otpResult = await verifyOtp(normalizedPhone, code);
  if (!otpResult.success) {
    return unauthorizedResponse(res, otpResult.message);
  }

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

  logger.info('New user registered via OTP', { userId: user.id, phone: user.phone });

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
  const { refreshToken } = req.body;

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

/**
 * Admin login
 * POST /api/admin/login
 */
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(phone);

  // Find user with admin role
  const result = await query(
    `SELECT u.id, u.phone, u.full_name, u.email, u.password_hash, u.role, u.status
     FROM users u
     JOIN admins a ON u.id = a.user_id
     WHERE u.phone = $1 AND u.role IN ('admin', 'super_admin')`,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  const user = result.rows[0];

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Generate tokens
  const tokens = generateTokenPair(user.id, user.phone, user.role);

  // Update last login and admin last active
  await query(
    'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
    [user.id]
  );
  
  await query(
    'UPDATE admins SET last_active_at = NOW() WHERE user_id = $1',
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
