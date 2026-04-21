// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import {
  authenticate,
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

// ── Protected routes ────────────────────────────────────────────────────
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.put('/profile', authenticate, authController.updateProfile);
router.put('/change-password', authenticate, validate(authSchemas.changePassword), authController.changePassword);

export default router;
