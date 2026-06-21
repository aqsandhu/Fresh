-- ============================================================================
-- Migration 41 — internal-control / anti-fraud columns.
--
-- Records WHO co-approved high-value money/stock exits so a single admin can
-- never quietly drain value (free goods, refunds). Mirrored by
-- backend/src/config/controlSchema.ts (lazy bootstrap). Idempotent.
--
--   refunds : approved_by / approved_at  — second-admin sign-off on big refunds
--             proof_url / reason          — mandatory reason + optional proof
--   orders  : discount_approved_by/_at    — second-admin sign-off on a free or
--             discounted complaint-replacement order
-- ============================================================================

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS proof_url   TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS reason      TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_approved_by UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_approved_at TIMESTAMPTZ;
