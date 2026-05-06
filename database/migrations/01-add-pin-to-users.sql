-- ============================================================================
-- MIGRATION: Add 4-digit PIN authentication to users
-- ----------------------------------------------------------------------------
-- Run this in Supabase SQL Editor on your already-deployed database.
-- Idempotent — safe to re-run; uses IF NOT EXISTS guards.
--
-- After running this, any new user can:
--   1. Register with OTP (one-time)
--   2. Set a 4-digit PIN
--   3. Log in / re-auth with the PIN forever after
-- ============================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pin_hash    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS pin_set_at  TIMESTAMPTZ;

-- Make sure existing users without a PIN simply don't have one (NULL); they
-- can set one on next login or via Settings / Profile.
COMMENT ON COLUMN users.pin_hash IS '4-digit PIN, bcrypt-hashed. NULL means user must use OTP login until they set a PIN.';
COMMENT ON COLUMN users.pin_set_at IS 'When the current PIN was last set. Useful for analytics + future "force PIN refresh" flows.';
