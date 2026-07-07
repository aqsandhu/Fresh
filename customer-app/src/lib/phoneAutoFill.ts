// ============================================================================
// PHONE AUTO-FILL — Android Phone Number Hint + SMS Retriever (zero-tap OTP)
// ----------------------------------------------------------------------------
// Both native modules live only in EAS/dev-client builds; Expo Go doesn't have
// them. Late require() + try/catch keeps Expo Go working with the features
// silently off (same pattern as lib/appWidget.ts). iOS gets neither API from
// Apple — there the TextInput props (textContentType="telephoneNumber" /
// "oneTimeCode") provide keyboard suggestions instead.
// ============================================================================

import { Platform } from 'react-native';

/** +923001234567 → 03001234567 (the 11-digit local format our forms expect). */
export function e164ToLocalPk(e164: string): string | null {
  const digits = (e164 || '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('0') && digits.length === 11) return digits;
  return null;
}

/**
 * Show Google's Phone Number Hint sheet (Android only) — the user taps their
 * SIM number and we get it without any permission. Returns null when the user
 * dismisses the sheet, the device has no number, or the module is unavailable.
 */
export async function getDevicePhoneNumber(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const hint = require('expo-phone-number-hint');
    if (!hint || typeof hint.showPhoneNumberHintAsync !== 'function') return null;
    if (typeof hint.isAvailableAsync === 'function' && !(await hint.isAvailableAsync())) {
      return null;
    }
    const e164 = await hint.showPhoneNumberHintAsync();
    return e164 ? e164ToLocalPk(e164) : null;
  } catch {
    return null;
  }
}

/**
 * Start Google's SMS Retriever (Android only): when the OTP SMS arrives with
 * our app hash appended, the OS hands the message straight to the app — no
 * SMS permission, no user tap. Calls onCode with the 6-digit code.
 * Returns a cleanup function; on iOS / Expo Go it's a no-op.
 */
export function startSmsOtpListener(onCode: (code: string) => void): () => void {
  if (Platform.OS !== 'android') return () => undefined;
  try {
    const mod = require('react-native-otp-verify');
    const otpVerify = mod?.default ?? mod;
    if (!otpVerify || typeof otpVerify.startOtpListener !== 'function') return () => undefined;

    otpVerify
      .startOtpListener((message: string) => {
        const match = /(\d{6})/.exec(message || '');
        if (match) onCode(match[1]);
      })
      .catch(() => undefined);

    return () => {
      try {
        otpVerify.removeListener();
      } catch {
        /* noop */
      }
    };
  } catch {
    return () => undefined;
  }
}
