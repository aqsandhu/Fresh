// ============================================================================
// TEMPORARY OTP BYPASS — website client flag (must match backend OTP_BYPASS_ENABLED)
// Set NEXT_PUBLIC_OTP_BYPASS=false (or remove) to restore Firebase SMS OTP.
// ============================================================================

export function isOtpBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OTP_BYPASS === 'true';
}

export function getOtpBypassCode(): string {
  return process.env.NEXT_PUBLIC_OTP_BYPASS_CODE || '123789';
}

export function isValidOtpBypassCode(code: string): boolean {
  return code === getOtpBypassCode();
}

export function otpBypassHint(): string {
  return `Temporary dev OTP: ${getOtpBypassCode()}`;
}

// ── OTP mode (server-driven) ────────────────────────────────────────────────
// /auth/send-otp responses carry data.mode:
//   'bypass'   fixed code           → client sends { phone, code }
//   'backend'  server sent the code → client sends { phone, code }
//   'firebase' Firebase SDK flow    → client sends { idToken }
// Older backends omit the field — fall back to the env flag.

export type OtpMode = 'bypass' | 'backend' | 'firebase';

export function resolveOtpMode(responseMode?: string): OtpMode {
  if (responseMode === 'bypass' || responseMode === 'backend' || responseMode === 'firebase') {
    return responseMode;
  }
  return isOtpBypassEnabled() ? 'bypass' : 'firebase';
}

/** True when the user types a code that the BACKEND verifies (no Firebase). */
export function isCodeEntryMode(mode: OtpMode): boolean {
  return mode !== 'firebase';
}
