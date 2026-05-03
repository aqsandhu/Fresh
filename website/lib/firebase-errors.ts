// ============================================================================
// FIREBASE ERROR MESSAGE HELPER
// ----------------------------------------------------------------------------
// Maps the most common Firebase Auth error codes that show up during the
// phone / OTP flow to short, actionable, human-readable messages so the user
// (and we, when reading the toast in a screenshot) immediately understand
// what's wrong rather than seeing a generic "Failed to send OTP".
// ============================================================================

const MESSAGES: Record<string, string> = {
  // === Configuration / setup ===
  'auth/invalid-api-key':
    'Firebase API key is invalid. Set NEXT_PUBLIC_FIREBASE_API_KEY in Vercel.',
  'auth/unauthorized-domain':
    'This domain is not authorized in Firebase. Add it under Authentication → Settings → Authorized domains.',
  'auth/operation-not-allowed':
    'Phone sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.',
  'auth/admin-restricted-operation':
    'Operation is admin-restricted. Check Firebase Console → Authentication → Settings.',

  // === reCAPTCHA ===
  'auth/captcha-check-failed':
    'reCAPTCHA verification failed. Refresh the page and try again.',
  'auth/missing-app-credential':
    'reCAPTCHA token is missing. Refresh the page and try again.',
  'auth/invalid-app-credential':
    'reCAPTCHA token is invalid. Refresh the page and try again.',

  // === Phone number ===
  'auth/invalid-phone-number':
    'Phone number is not in a valid international format. Use +92… for Pakistan.',
  'auth/missing-phone-number': 'Please enter your phone number.',

  // === SMS sending ===
  'auth/quota-exceeded':
    'Daily SMS quota exceeded. Either wait, or upgrade Firebase plan to Blaze for higher limits.',
  'auth/too-many-requests':
    'Too many requests from this device. Wait a few minutes and try again.',
  'auth/code-expired':
    'OTP code expired. Request a new one.',
  'auth/network-request-failed':
    'Network error. Check your internet connection and try again.',

  // === OTP verify ===
  'auth/invalid-verification-code':
    'OTP is incorrect. Check the SMS and try again.',
  'auth/invalid-verification-id':
    'Verification session expired. Please request a new OTP.',
  'auth/missing-verification-code': 'Please enter the 6-digit OTP.',
}

/**
 * Translates an unknown error (Firebase or otherwise) into a user-facing
 * string. Always includes the underlying code in brackets so support /
 * triage can identify the exact failure mode from a screenshot.
 */
export function firebaseErrorMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: string })?.code
  const msg = (err as { message?: string })?.message
  if (code && MESSAGES[code]) {
    return `${MESSAGES[code]} [${code}]`
  }
  if (code) {
    return `${msg || fallback} [${code}]`
  }
  return msg || fallback
}
