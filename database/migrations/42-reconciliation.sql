-- ============================================================================
-- Migration 42 — reconciliation watchdog.
--
-- The owner's automatic books-checker. stock_snapshots holds the latest on-hand
-- per product+quality; each run compares the change since the last snapshot to
-- the audited ledger (stock_movements) — a gap means stock moved outside the
-- controlled path. reconciliation_runs stores each run's anomaly summary.
-- Mirrored by backend/src/config/reconciliationSchema.ts. Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_snapshots (
    product_id UUID NOT NULL,
    quality    VARCHAR(1) NOT NULL DEFAULT 'A',
    on_hand    NUMERIC(12,3) NOT NULL DEFAULT 0,
    taken_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (product_id, quality)
);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_from   TIMESTAMPTZ,
    anomaly_count INTEGER NOT NULL DEFAULT 0,
    summary       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by    UUID
);
CREATE INDEX IF NOT EXISTS reconciliation_runs_at_idx ON reconciliation_runs (run_at DESC);
