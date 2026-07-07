// ============================================================================
// OTP PROVIDER MODE — which system verifies a customer's phone number
// ----------------------------------------------------------------------------
//   bypass   OTP_BYPASS_ENABLED=true            fixed code, no SMS (temporary)
//   backend  OTP_PROVIDER=backend               we generate + send the code
//                                               (WhatsApp Cloud API → SMS
//                                               gateway fallback, cheap PK
//                                               providers instead of Firebase)
//   firebase (default)                          Firebase Phone Auth idToken
//
// Bypass wins over everything so the existing prod setup keeps working until
// the owner flips the env vars.
// ============================================================================

import { isOtpBypassEnabled } from './otpBypass';

export type OtpMode = 'bypass' | 'backend' | 'firebase';

export function isBackendOtpEnabled(): boolean {
  return process.env.OTP_PROVIDER === 'backend';
}

export function getOtpMode(): OtpMode {
  if (isOtpBypassEnabled()) return 'bypass';
  if (isBackendOtpEnabled()) return 'backend';
  return 'firebase';
}

/** Both bypass and backend modes verify with { phone, code } request bodies. */
export function isCodeEntryMode(): boolean {
  return getOtpMode() !== 'firebase';
}

/** OTP lifetime — how long a sent code stays valid. */
export const OTP_TTL_SECONDS = parseInt(process.env.OTP_TTL_SECONDS || '300', 10);

/** Minimum gap between two sends to the same number (client resend timer is 60s). */
export const OTP_RESEND_COOLDOWN_SECONDS = parseInt(
  process.env.OTP_RESEND_COOLDOWN_SECONDS || '45',
  10
);

/** Wrong-code attempts allowed per sent code. */
export const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);

/** Anti SMS-pumping: sends allowed per phone per hour. */
export const OTP_MAX_SENDS_PER_PHONE_HOUR = parseInt(
  process.env.OTP_MAX_SENDS_PER_PHONE_HOUR || '5',
  10
);

/** Anti SMS-pumping: sends allowed per IP per hour. */
export const OTP_MAX_SENDS_PER_IP_HOUR = parseInt(
  process.env.OTP_MAX_SENDS_PER_IP_HOUR || '15',
  10
);
