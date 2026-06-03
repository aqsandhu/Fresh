// ============================================================================
// TEMPORARY OTP BYPASS — customer app client flag (must match backend OTP_BYPASS_ENABLED)
// Set EXPO_PUBLIC_OTP_BYPASS=false (or remove) to restore Firebase SMS OTP.
// ============================================================================

export function isOtpBypassEnabled(): boolean {
  return process.env.EXPO_PUBLIC_OTP_BYPASS === 'true';
}

export function getOtpBypassCode(): string {
  return process.env.EXPO_PUBLIC_OTP_BYPASS_CODE || '123789';
}

export function isValidOtpBypassCode(code: string): boolean {
  return code === getOtpBypassCode();
}

export function otpBypassHint(): string {
  return `Temporary dev OTP: ${getOtpBypassCode()}`;
}
