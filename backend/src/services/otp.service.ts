// ============================================================================
// FIREBASE AUTH SERVICE - Phone token verification via Firebase Admin SDK
// ============================================================================

import * as admin from 'firebase-admin';
import logger from '../utils/logger';

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
