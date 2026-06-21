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

-- Audit trail for every variable-weight edit (customer alert + per-editor
-- upward-bias monitoring).
CREATE TABLE IF NOT EXISTS order_item_weight_edits (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL,
    order_item_id UUID NOT NULL,
    product_id    UUID,
    edited_by     UUID,
    old_weight    NUMERIC(12,3),
    new_weight    NUMERIC(12,3),
    delta         NUMERIC(12,3),
    old_total     NUMERIC(12,2),
    new_total     NUMERIC(12,2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oiwe_editor_idx ON order_item_weight_edits (edited_by, created_at DESC);
CREATE INDEX IF NOT EXISTS oiwe_order_idx  ON order_item_weight_edits (order_id);
