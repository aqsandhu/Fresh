// ============================================================================
// OTP SERVICE - Twilio Verify (SMS, WhatsApp, Call)
// ============================================================================

import twilio from 'twilio';
import logger from '../utils/logger';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!ACCOUNT_SID || !AUTH_TOKEN || !VERIFY_SERVICE_SID) {
  logger.warn('Twilio credentials not configured. OTP service will not work.');
}

const client = ACCOUNT_SID && AUTH_TOKEN ? twilio(ACCOUNT_SID, AUTH_TOKEN) : null;
const IS_DEV = process.env.NODE_ENV !== 'production';
const DEV_OTP_CODE = '123456';

export type OtpChannel = 'sms' | 'whatsapp' | 'call';

/**
 * Send OTP to a phone number via the specified channel
 * @param phone - Phone number in E.164 format (e.g., +923451111346)
 * @param channel - 'sms' | 'whatsapp' | 'call'
 */
export async function sendOtp(phone: string, channel: OtpChannel = 'sms'): Promise<{ success: boolean; message: string }> {
  // Dev mode: skip Twilio, use fixed OTP code
  if (IS_DEV) {
    logger.info('DEV MODE: OTP bypassed', { phone, channel, code: DEV_OTP_CODE });
    return { success: true, message: `DEV MODE: Use code ${DEV_OTP_CODE}` };
  }

  if (!client || !VERIFY_SERVICE_SID) {
    logger.error('Twilio not configured');
    return { success: false, message: 'OTP service not configured' };
  }

  try {
    const verification = await client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications.create({
        to: phone,
        channel,
      });

    logger.info('OTP sent', { phone, channel, status: verification.status });
    return { success: true, message: `OTP sent via ${channel}` };
  } catch (error: any) {
    logger.error('Failed to send OTP', { phone, channel, error: error.message });

    // Provide user-friendly error messages
    if (error.code === 60200) {
      return { success: false, message: 'Invalid phone number format' };
    }
    if (error.code === 60203) {
      return { success: false, message: 'Too many OTP requests. Please wait before trying again.' };
    }
    if (error.code === 60212) {
      return { success: false, message: 'This channel is not available for this phone number. Try a different method.' };
    }

    return { success: false, message: 'Failed to send OTP. Please try again.' };
  }
}

/**
 * Verify OTP code entered by the user
 * @param phone - Phone number in E.164 format
 * @param code - The 6-digit OTP code
 */
export async function verifyOtp(phone: string, code: string): Promise<{ success: boolean; message: string }> {
  // Dev mode: accept fixed OTP code
  if (IS_DEV) {
    if (code === DEV_OTP_CODE) {
      logger.info('DEV MODE: OTP verified', { phone });
      return { success: true, message: 'Phone number verified successfully' };
    }
    return { success: false, message: 'Invalid OTP code' };
  }

  if (!client || !VERIFY_SERVICE_SID) {
    logger.error('Twilio not configured');
    return { success: false, message: 'OTP service not configured' };
  }

  try {
    const verificationCheck = await client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phone,
        code,
      });

    if (verificationCheck.status === 'approved') {
      logger.info('OTP verified', { phone });
      return { success: true, message: 'Phone number verified successfully' };
    }

    logger.warn('OTP verification failed', { phone, status: verificationCheck.status });
    return { success: false, message: 'Invalid or expired OTP code' };
  } catch (error: any) {
    logger.error('OTP verification error', { phone, error: error.message });

    if (error.code === 60200) {
      return { success: false, message: 'Invalid phone number' };
    }
    if (error.code === 20404) {
      return { success: false, message: 'OTP expired or not found. Please request a new one.' };
    }

    return { success: false, message: 'Verification failed. Please try again.' };
  }
}
