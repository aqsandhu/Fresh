// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import {
  authenticate,
  verifyUserActive,
  authRateLimiter,
  registerRateLimiter,
  validate,
  authSchemas,
} from '../middleware';

const router = Router();

// ── OTP-based auth (primary flow) ───────────────────────────────────────
router.post(
  '/send-otp',
  authRateLimiter,
  validate(authSchemas.sendOtp),
  authController.sendOtpHandler
);

router.post(
  '/verify-login',
  authRateLimiter,
  validate(authSchemas.verifyLogin),
  authController.verifyLoginOtp
);

router.post(
  '/verify-register',
  registerRateLimiter,
  validate(authSchemas.verifyRegister),
  authController.verifyRegisterOtp
);

// ── Legacy password-based auth (kept for backward compatibility) ────────
router.post(
  '/register',
  registerRateLimiter,
  validate(authSchemas.register),
  authController.register
);

router.post(
  '/login',
  authRateLimiter,
  validate(authSchemas.login),
  authController.login
);

router.post(
  '/refresh',
  validate(authSchemas.refresh),
  authController.refreshToken
);

// ── 4-digit PIN auth ────────────────────────────────────────────────────
// Customers use a one-time OTP at register, then a 4-digit PIN for every
// subsequent login + sensitive re-auth. Falls back to OTP if PIN forgotten.
router.get(
  '/pin-status',
  authRateLimiter, // prevent phone-number enumeration
  validate(authSchemas.pinStatus, 'query'),
  authController.pinStatus
);
router.post(
  '/set-pin',
  authenticate,
  validate(authSchemas.setPin),
  authController.setPin
);
router.post(
  '/verify-pin',
  authRateLimiter, // per-IP brake; the real brute-force defence is the
  // per-account exponential lockout in config/pinLockout.ts
  validate(authSchemas.verifyPin),
  authController.verifyPin
);
router.post(
  '/reset-pin',
  authRateLimiter,
  validate(authSchemas.resetPinConfirm),
  authController.resetPinConfirm
);

// ── Protected routes ────────────────────────────────────────────────────
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, verifyUserActive, authController.getMe);
router.get('/socket-token', authenticate, verifyUserActive, authController.getSocketToken);
router.put('/profile', authenticate, verifyUserActive, authController.updateProfile);
router.put('/change-password', authenticate, verifyUserActive, validate(authSchemas.changePassword), authController.changePassword);

export default router;
