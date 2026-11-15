-- ============================================================================
-- 66 — Approval codes: the second admin approves from THEIR OWN phone.
--
-- Until now the approver typed their password on the requester's screen —
-- watched or remembered once, it could be reused without them. Now the
-- approver presses "Give approval code" in their own admin panel; a 6-digit
-- code (valid 3 minutes, one use, 5 wrong tries) is typed by the requester
-- instead of the password. Each code records what it was used for, by whom.
-- ============================================================================
CREATE TABLE IF NOT EXISTS approval_codes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approver_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash    VARCHAR(100) NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  used_at      TIMESTAMPTZ,
  used_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  used_for     VARCHAR(80),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_codes_open_idx ON approval_codes (approver_id, expires_at) WHERE used_at IS NULL;
