// ============================================================================
// OTP DELIVERY — WhatsApp Cloud API (primary) → Pakistani SMS gateway (fallback)
// ----------------------------------------------------------------------------
// WhatsApp: Meta Cloud API "authentication" template. Costs ~PKR 3/message in
// PK vs ~PKR 17 for a Firebase SMS. The template MUST be created in Meta
// Business Manager as category "Authentication" with the one-tap/copy-code
// button — that button is what enables Android autofill inside WhatsApp.
//
// SMS: provider-agnostic. Named presets for SendPK and Veevotech plus a
// {phone}/{message} URL-template escape hatch for any other gateway. When
// SMS_APP_HASH is set, the app's 11-char hash is appended so Google's SMS
// Retriever API auto-reads the code on Android (zero-tap) — no SMS permission.
// ============================================================================

import logger from '../utils/logger';

export type OtpChannel = 'whatsapp' | 'sms';

export type DeliveryResult =
  | { ok: true; channel: OtpChannel }
  | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── WhatsApp Cloud API ─────────────────────────────────────────────────────

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppOtp(phoneE164: string, code: string): Promise<DeliveryResult> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: 'WhatsApp sender not configured' };
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_OTP_TEMPLATE || 'otp_code';
  const language = process.env.WHATSAPP_OTP_LANGUAGE || 'en';

  try {
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneE164.replace('+', ''),
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: code }] },
              // Authentication templates require the copy-code/one-tap button
              // parameter — it also powers Android autofill from WhatsApp.
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.warn('WhatsApp OTP send failed', { status: response.status, body: body.slice(0, 500) });
      return { ok: false, error: `WhatsApp API error (${response.status})` };
    }

    return { ok: true, channel: 'whatsapp' };
  } catch (error: any) {
    logger.warn('WhatsApp OTP send error', { error: error?.message });
    return { ok: false, error: error?.message || 'WhatsApp request failed' };
  }
}

// ── SMS gateway (SendPK / Veevotech / custom URL template) ────────────────

export function isSmsConfigured(): boolean {
  const provider = process.env.SMS_PROVIDER;
  if (provider === 'sendpk') {
    return Boolean(process.env.SMS_USERNAME && process.env.SMS_PASSWORD);
  }
  if (provider === 'veevotech') {
    return Boolean(process.env.SMS_API_KEY);
  }
  if (provider === 'custom') {
    return Boolean(process.env.SMS_API_URL);
  }
  return false;
}

function buildSmsMessage(code: string): string {
  // Keep ≤140 bytes and end with the app hash — SMS Retriever's requirements
  // for zero-tap auto-read on Android.
  const brand = process.env.SMS_BRAND_NAME || 'Fresh Bazar';
  const base = `<#> ${brand} code: ${code}. Valid for 5 minutes. Never share it.`;
  const hash = process.env.SMS_APP_HASH;
  return hash ? `${base}\n${hash}` : base;
}

export async function sendSmsOtp(phoneE164: string, code: string): Promise<DeliveryResult> {
  if (!isSmsConfigured()) {
    return { ok: false, error: 'SMS gateway not configured' };
  }

  const provider = process.env.SMS_PROVIDER as 'sendpk' | 'veevotech' | 'custom';
  const message = buildSmsMessage(code);
  const digits = phoneE164.replace('+', ''); // 923001234567
  const sender = process.env.SMS_SENDER_ID || '';

  let url: string;
  if (provider === 'sendpk') {
    const params = new URLSearchParams({
      username: process.env.SMS_USERNAME || '',
      password: process.env.SMS_PASSWORD || '',
      sender,
      mobile: digits,
      message,
    });
    url = `https://sendpk.com/api/sms.php?${params.toString()}`;
  } else if (provider === 'veevotech') {
    const params = new URLSearchParams({
      hash: process.env.SMS_API_KEY || '',
      receivernum: `+${digits}`,
      sendernum: sender || 'Default',
      textmessage: message,
    });
    url = `https://api.veevotech.com/v3/sendsms?${params.toString()}`;
  } else {
    url = (process.env.SMS_API_URL || '')
      .replace('{phone}', encodeURIComponent(digits))
      .replace('{message}', encodeURIComponent(message));
  }

  try {
    const response = await fetchWithTimeout(url);
    const body = (await response.text().catch(() => '')).slice(0, 500);

    if (!response.ok) {
      logger.warn('SMS OTP send failed', { provider, status: response.status, body });
      return { ok: false, error: `SMS gateway error (${response.status})` };
    }

    // Gateways return 200 with an error string in the body — honour an
    // optional success marker (e.g. SMS_SUCCESS_MATCH=OK for SendPK).
    const successMatch = process.env.SMS_SUCCESS_MATCH;
    if (successMatch && !body.toLowerCase().includes(successMatch.toLowerCase())) {
      logger.warn('SMS OTP gateway rejected message', { provider, body });
      return { ok: false, error: 'SMS gateway rejected the message' };
    }

    return { ok: true, channel: 'sms' };
  } catch (error: any) {
    logger.warn('SMS OTP send error', { provider, error: error?.message });
    return { ok: false, error: error?.message || 'SMS request failed' };
  }
}

// ── Channel orchestration ──────────────────────────────────────────────────

/**
 * Deliver an OTP over the requested channel with automatic fallback:
 * default is WhatsApp-first (cheapest + most reliable in PK), falling back to
 * SMS; an explicit 'sms' request (user tapped "Send via SMS instead") skips
 * WhatsApp entirely.
 */
export async function deliverOtp(
  phoneE164: string,
  code: string,
  requestedChannel?: OtpChannel
): Promise<DeliveryResult> {
  const wantsSmsOnly = requestedChannel === 'sms';

  if (!wantsSmsOnly && isWhatsAppConfigured()) {
    const wa = await sendWhatsAppOtp(phoneE164, code);
    if (wa.ok) return wa;
    logger.info('WhatsApp OTP failed — falling back to SMS', { phone: phoneE164 });
  }

  if (isSmsConfigured()) {
    return sendSmsOtp(phoneE164, code);
  }

  return {
    ok: false,
    error: wantsSmsOnly
      ? 'SMS gateway not configured'
      : 'No OTP delivery channel configured (set WhatsApp and/or SMS gateway env vars)',
  };
}
