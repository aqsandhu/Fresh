-- 72: duplicate-submit guard (A34, round 7).
-- One row per "this admin sent this exact money / stock request" fingerprint,
-- kept for a short window so a double / triple press is booked once.
-- The server also creates this table on first use; this file makes it explicit.
CREATE TABLE IF NOT EXISTS request_guards (
  key TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_guards_expires ON request_guards (expires_at);
