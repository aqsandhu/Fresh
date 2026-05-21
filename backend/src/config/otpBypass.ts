// ============================================================================
// TEMPORARY OTP BYPASS — remove by setting OTP_BYPASS_ENABLED=false (default)
// ============================================================================
// When enabled, clients send { phone, code } instead of a Firebase idToken.
// Production Firebase OTP flow stays unchanged when this flag is off.

import logger from '../utils/logger';

export function isOtpBypassEnabled(): boolean {
  return process.env.OTP_BYPASS_ENABLED === 'true';
}

export function getOtpBypassCode(): string {
  return process.env.OTP_BYPASS_CODE || '123789';
}

export function verifyOtpBypassCode(code: string): boolean {
  return code === getOtpBypassCode();
}

export function logOtpBypassWarningIfEnabled(): void {
  if (!isOtpBypassEnabled()) return;
  logger.warn(
    'OTP BYPASS IS ENABLED — fixed code accepted. Set OTP_BYPASS_ENABLED=false for production Firebase OTP.'
  );
}
