// ============================================================================
// FIREBASE AUTH SERVICE - Phone token verification via Firebase Admin SDK
// ============================================================================

import * as admin from 'firebase-admin';
import logger from '../utils/logger';
import {
  isOtpBypassEnabled,
  verifyOtpBypassCode,
} from '../config/otpBypass';
import { isBackendOtpEnabled } from '../config/otpProvider';
import { verifyStoredOtp } from './otpStore.service';
import { normalizePhoneNumber } from '../utils/validators';

export type PhoneAuthRequest = {
  idToken?: string;
  phone?: string;
  code?: string;
};

function getFirebaseApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('Firebase Admin credentials not configured. Phone auth will not work.');
    throw new Error('Firebase Admin not configured');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

/**
 * Verify a Firebase Phone Auth ID token.
 * Returns the verified phone number (E.164 format) on success.
 */
export async function verifyFirebaseToken(
  idToken: string
): Promise<{ success: boolean; phone?: string; message: string }> {
  try {
    const app = getFirebaseApp();
    const decoded = await admin.auth(app).verifyIdToken(idToken);

    if (!decoded.phone_number) {
      return { success: false, message: 'No phone number associated with this token' };
    }

    return { success: true, phone: decoded.phone_number, message: 'Token verified' };
  } catch (error: any) {
    logger.error('Firebase token verification failed', { error: error.message });

    if (error.code === 'auth/id-token-expired') {
      return { success: false, message: 'Verification session expired. Please try again.' };
    }
    if (error.code === 'auth/invalid-id-token') {
      return { success: false, message: 'Invalid verification token. Please try again.' };
    }

    return { success: false, message: 'Phone verification failed. Please try again.' };
  }
}

/**
 * Verify phone auth from an API request body.
 * Priority: OTP bypass (fixed code) → backend-generated OTP (phone + code
 * against otp_codes) → Firebase idToken. The idToken path stays available in
 * every mode so app builds from the Firebase era keep logging in.
 */
export async function verifyPhoneFromRequest(
  body: PhoneAuthRequest
): Promise<{ success: boolean; phone?: string; message: string }> {
  if (isOtpBypassEnabled()) {
    if (!body.phone || !body.code) {
      return { success: false, message: 'Phone and OTP code are required' };
    }
    if (!verifyOtpBypassCode(body.code)) {
      return { success: false, message: 'Invalid OTP. Please try again.' };
    }
    return {
      success: true,
      phone: normalizePhoneNumber(body.phone),
      message: 'Bypass OTP verified',
    };
  }

  if (isBackendOtpEnabled() && body.phone && body.code) {
    const normalizedPhone = normalizePhoneNumber(body.phone);
    const result = await verifyStoredOtp(normalizedPhone, body.code);
    return {
      success: result.success,
      phone: result.success ? normalizedPhone : undefined,
      message: result.message,
    };
  }

  if (!body.idToken) {
    return { success: false, message: 'Verification token is required' };
  }

  return verifyFirebaseToken(body.idToken);
}
