-- ============================================================================
-- Migration 62 — AI corruption audit (super admin) + cash hand-over ledger
--
--  * corruption_audit_runs — one row per audit the owner runs for a period.
--    `evidence` is the deterministic fact pack computed from the books (what
--    was sent to the AI, with people replaced by aliases); `result` is the
--    validated verdict shown on the Audit page. Nothing here is ever written
--    by a staff admin: every endpoint is super-admin only.
--  * admin_cash_handovers — cash an admin handed to the owner. Closes the
--    loop left open by "cash each admin collected": collected − handed over
--    = what that admin should still be holding. Recorded by the super admin
--    (the receiver), never by the admin who hands the cash over.
-- ============================================================================

CREATE TABLE IF NOT EXISTS corruption_audit_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from  DATE NOT NULL,
  period_to    DATE NOT NULL,
  city_id      UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  status       VARCHAR(12) NOT NULL DEFAULT 'running'
               CHECK (status IN ('running', 'done', 'failed')),
  ai_used      BOOLEAN NOT NULL DEFAULT FALSE,
  ai_provider  VARCHAR(40),
  ai_model     VARCHAR(100),
  evidence     JSONB,
  result       JSONB,
  error        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  CHECK (period_to >= period_from)
);
CREATE INDEX IF NOT EXISTS corruption_audit_runs_created_idx ON corruption_audit_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS admin_cash_handovers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note         TEXT,
  received_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  handed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_cash_handovers_admin_idx ON admin_cash_handovers (admin_id, handed_at DESC);

-- Same default-deny posture as every other table (migration 49).
ALTER TABLE corruption_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_cash_handovers ENABLE ROW LEVEL SECURITY;
