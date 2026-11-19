// ============================================================================
// OTP STORE — backend-generated verification codes (OTP_PROVIDER=backend)
// ----------------------------------------------------------------------------
// Codes live in the otp_codes table, hashed (never plaintext). Verification is
// single-use with a short re-verify grace window because the PIN-reset flow
// legitimately presents the same code to two endpoints back-to-back
// (/auth/reset-pin then /auth/verify-login).
//
// Send-side abuse ("SMS pumping" — draining the SMS balance with bot traffic)
// is throttled here per-phone and per-IP on top of the route-level limiter.
// ============================================================================

import { asCaughtError } from '../utils/caughtError';
import crypto from 'crypto';
import { Pool } from 'pg';
import { query, withTransaction } from '../config/database';
import { getMigrationConnectionString } from '../config/pinAuth';
import {
  OTP_TTL_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_PHONE_HOUR,
  OTP_MAX_SENDS_PER_IP_HOUR,
} from '../config/otpProvider';
import logger from '../utils/logger';
import { buildSslConfig } from '../config/dbSsl';
import { schemaSelfHealEnabled } from '../config/schemaSelfHeal';

/** A just-verified code may be re-verified within this window (PIN reset flow). */
const REVERIFY_GRACE_SECONDS = 120;

let otpTableCached: boolean | null = null;
let ensureOtpTablePromise: Promise<boolean> | null = null;

const CREATE_OTP_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    channel VARCHAR(16) NOT NULL DEFAULT 'sms',
    request_ip VARCHAR(64),
    attempts SMALLINT NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_created
    ON otp_codes (phone, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_otp_codes_ip_created
    ON otp_codes (request_ip, created_at DESC);
`;

async function hasOtpTable(): Promise<boolean> {
  if (otpTableCached !== null) return otpTableCached;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'otp_codes' LIMIT 1`
    );
    otpTableCached = (result.rowCount ?? 0) > 0;
  } catch (errorCaught: unknown) {
    const error = asCaughtError(errorCaught);
    logger.warn('Could not probe otp_codes table', { error: error?.message });
    otpTableCached = false;
  }
  return otpTableCached;
}

/** Create otp_codes on first use (Supabase pooler rejects DDL — use direct URL). */
export async function ensureOtpTable(): Promise<boolean> {
  if (!schemaSelfHealEnabled()) return hasOtpTable(); // migrations own the schema (config/schemaSelfHeal.ts)
  if (await hasOtpTable()) return true;
  if (ensureOtpTablePromise) return ensureOtpTablePromise;

  ensureOtpTablePromise = (async () => {
    const migrationUrl = getMigrationConnectionString();
    if (!migrationUrl) {
      logger.warn('otp_codes table missing and no DATABASE_URL for migration');
      return false;
    }
    const pool = new Pool({
      connectionString: migrationUrl,
      ssl: buildSslConfig(migrationUrl),
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      await pool.query(CREATE_OTP_TABLE_SQL);
      otpTableCached = null;
      const ready = await hasOtpTable();
      if (ready) {
        logger.info('otp_codes table created');
      } else {
        logger.warn(
          'otp_codes still missing after migration attempt — run database/migrations/47-otp-codes.sql in Supabase SQL Editor'
        );
      }
      return ready;
    } catch (errorCaught: unknown) {
      const error = asCaughtError(errorCaught);
      logger.warn('Could not create otp_codes table automatically', { error: error?.message });
      otpTableCached = false;
      return false;
    } finally {
      await pool.end().catch(() => undefined);
    }
  })();

  try {
    return await ensureOtpTablePromise;
  } finally {
    ensureOtpTablePromise = null;
  }
}

function hashCode(phone: string, code: string): string {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

export type OtpSendGate =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterSec: number };

/** Per-phone cooldown + per-phone/per-IP hourly caps (anti SMS pumping). */
export async function checkSendAllowed(phone: string, ip: string | null): Promise<OtpSendGate> {
  const recent = await query<{ phone_count: string; last_sent: Date | null }>(
    `SELECT COUNT(*) AS phone_count, MAX(created_at) AS last_sent
       FROM otp_codes
      WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [phone]
  );

  const phoneCount = parseInt(recent.rows[0]?.phone_count || '0', 10);
  const lastSent = recent.rows[0]?.last_sent ? new Date(recent.rows[0].last_sent).getTime() : 0;
  const sinceLastSec = (Date.now() - lastSent) / 1000;

  if (lastSent && sinceLastSec < OTP_RESEND_COOLDOWN_SECONDS) {
    return {
      allowed: false,
      reason: 'Please wait a moment before requesting another code.',
      retryAfterSec: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLastSec),
    };
  }

  if (phoneCount >= OTP_MAX_SENDS_PER_PHONE_HOUR) {
    return {
      allowed: false,
      reason: 'Too many codes requested for this number. Please try again later.',
      retryAfterSec: 3600,
    };
  }

  if (ip) {
    const ipResult = await query<{ ip_count: string }>(
      `SELECT COUNT(*) AS ip_count
         FROM otp_codes
        WHERE request_ip = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [ip]
    );
    if (parseInt(ipResult.rows[0]?.ip_count || '0', 10) >= OTP_MAX_SENDS_PER_IP_HOUR) {
      return {
        allowed: false,
        reason: 'Too many verification requests. Please try again later.',
        retryAfterSec: 3600,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check the limits AND hold the slot in one step (A40, round 9).
 * `checkSendAllowed` → send SMS → `persistOtp` left a gap of seconds (the SMS
 * call): ten requests for one number at the same moment all passed the
 * "1 per cooldown / 5 per hour" gate and each sent a real SMS. Now a per-phone
 * lock covers check + a placeholder row; the SMS is sent outside the lock.
 * Call `completeOtpSend` after a good delivery, `cancelOtpSend` after a failed
 * one (a failed send still does not use up the quota).
 */
export async function reserveOtpSend(
  phone: string,
  ip: string | null,
  channel: string = 'sms'
): Promise<OtpSendGate & { reservationId?: string }> {
  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('otp-send:' || $1))`, [phone]);
    const recent = await client.query(
      `SELECT COUNT(*) AS phone_count, MAX(created_at) AS last_sent
         FROM otp_codes
        WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [phone]
    );
    const phoneCount = parseInt(recent.rows[0]?.phone_count || '0', 10);
    const lastSent = recent.rows[0]?.last_sent ? new Date(recent.rows[0].last_sent).getTime() : 0;
    const sinceLastSec = (Date.now() - lastSent) / 1000;
    if (lastSent && sinceLastSec < OTP_RESEND_COOLDOWN_SECONDS) {
      return {
        allowed: false as const,
        reason: 'Please wait a moment before requesting another code.',
        retryAfterSec: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLastSec),
      };
    }
    if (phoneCount >= OTP_MAX_SENDS_PER_PHONE_HOUR) {
      return {
        allowed: false as const,
        reason: 'Too many codes requested for this number. Please try again later.',
        retryAfterSec: 3600,
      };
    }
    if (ip) {
      const ipResult = await client.query(
        `SELECT COUNT(*) AS ip_count FROM otp_codes
          WHERE request_ip = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [ip]
      );
      if (parseInt(ipResult.rows[0]?.ip_count || '0', 10) >= OTP_MAX_SENDS_PER_IP_HOUR) {
        return {
          allowed: false as const,
          reason: 'Too many verification requests. Please try again later.',
          retryAfterSec: 3600,
        };
      }
    }
    // Placeholder: counts for the gate at once, can never be verified
    // (already expired, no real hash) until completeOtpSend fills it in.
    const ins = await client.query(
      `INSERT INTO otp_codes (phone, code_hash, channel, request_ip, expires_at)
       VALUES ($1, 'pending', $2, $3, NOW()) RETURNING id`,
      [phone, channel, ip]
    );
    return { allowed: true as const, reservationId: String(ins.rows[0].id) };
  });
}

/** The SMS went out: store the real code in the reserved row. */
export async function completeOtpSend(
  reservationId: string,
  phone: string,
  code: string,
  channel: string
): Promise<{ expiresInSec: number }> {
  await query(
    `UPDATE otp_codes
        SET code_hash = $2, channel = $3, expires_at = NOW() + ($4 || ' seconds')::interval
      WHERE id = $1`,
    [reservationId, hashCode(phone, code), channel, String(OTP_TTL_SECONDS)]
  );
  query(`DELETE FROM otp_codes WHERE created_at < NOW() - INTERVAL '1 day'`).catch(() => undefined);
  return { expiresInSec: OTP_TTL_SECONDS };
}

/** The SMS failed: give the slot back. */
export async function cancelOtpSend(reservationId: string): Promise<void> {
  await query(`DELETE FROM otp_codes WHERE id = $1`, [reservationId]).catch(() => undefined);
}

/** A fresh random 6-digit code — not yet persisted (see persistOtp). */
export function generateOtpCode(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

/**
 * Persist a code AFTER it was successfully delivered — so a failed send never
 * burns the caller's per-hour quota or resend cooldown.
 */
export async function persistOtp(
  phone: string,
  code: string,
  channel: string,
  ip: string | null
): Promise<{ expiresInSec: number }> {
  await query(
    `INSERT INTO otp_codes (phone, code_hash, channel, request_ip, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::interval)`,
    [phone, hashCode(phone, code), channel, ip, String(OTP_TTL_SECONDS)]
  );

  // Housekeeping — codes older than a day carry no rate-limit signal anymore.
  query(`DELETE FROM otp_codes WHERE created_at < NOW() - INTERVAL '1 day'`).catch(() => undefined);

  return { expiresInSec: OTP_TTL_SECONDS };
}

/**
 * Check a submitted code against the latest unexpired code for the phone.
 * Single-use, with a short grace window for the two-step PIN-reset flow.
 */
export async function verifyStoredOtp(
  phone: string,
  code: string
): Promise<{ success: boolean; message: string }> {
  if (!(await ensureOtpTable())) {
    return { success: false, message: 'Verification is temporarily unavailable. Please try again.' };
  }

  const result = await query<{
    id: string;
    code_hash: string;
    attempts: number;
    verified_at: Date | null;
  }>(
    `SELECT id, code_hash, attempts, verified_at
       FROM otp_codes
      WHERE phone = $1 AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1`,
    [phone]
  );

  if (result.rows.length === 0) {
    return { success: false, message: 'Code expired or not found. Please request a new one.' };
  }

  const row = result.rows[0];

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { success: false, message: 'Too many wrong attempts. Please request a new code.' };
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(row.code_hash, 'hex'),
    Buffer.from(hashCode(phone, code), 'hex')
  );

  if (!matches) {
    const consumed = await query(
      `UPDATE otp_codes
          SET attempts = attempts + 1
        WHERE id = $1 AND attempts < $2 AND verified_at IS NULL
        RETURNING attempts`,
      [row.id, OTP_MAX_ATTEMPTS]
    );
    if (consumed.rows.length === 0) {
      return { success: false, message: 'Too many wrong attempts. Please request a new code.' };
    }
    return { success: false, message: 'Invalid OTP. Please try again.' };
  }

  if (row.verified_at) {
    const ageSec = (Date.now() - new Date(row.verified_at).getTime()) / 1000;
    if (ageSec > REVERIFY_GRACE_SECONDS) {
      return { success: false, message: 'Code already used. Please request a new one.' };
    }
    return { success: true, message: 'OTP verified' };
  }

  await query(`UPDATE otp_codes SET verified_at = NOW() WHERE id = $1`, [row.id]);
  return { success: true, message: 'OTP verified' };
}
