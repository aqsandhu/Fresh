-- ============================================================================
-- 47: Backend-generated OTP codes (OTP_PROVIDER=backend)
-- ----------------------------------------------------------------------------
-- Stores hashed one-time codes the backend sends itself via WhatsApp Cloud
-- API / a Pakistani SMS gateway (replacing Firebase Phone Auth SMS).
-- Also powers anti-SMS-pumping rate limits (per-phone / per-IP send counts).
--
-- The backend auto-creates this table on first use (services/otpStore.service.ts),
-- but running it here explicitly is preferred on the Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,          -- sha256(phone:code), never plaintext
  channel VARCHAR(16) NOT NULL DEFAULT 'sms',   -- 'whatsapp' | 'sms'
  request_ip VARCHAR(64),
  attempts SMALLINT NOT NULL DEFAULT 0,    -- wrong tries against this code
  verified_at TIMESTAMPTZ,                 -- single-use marker
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_created
  ON otp_codes (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_codes_ip_created
  ON otp_codes (request_ip, created_at DESC);
