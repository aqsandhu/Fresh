-- ============================================================================
-- Migration 60 — anti-corruption controls (2026-11-01 QA, report §Q7)
--
--  * approval_value_log — every value-out action an admin takes (waste,
--    quality conversion, refund, discount, stock-count shortage). The
--    second-admin rule now looks at the admin's whole Pakistan DAY, so five
--    Rs 4,900 wastes can no longer slip under the Rs 5,000 limit.
--  * stock_counts — physical shelf counts vs the system. The only control
--    that catches goods walking out of the store; every variance is posted
--    to the ledger with who counted and (for shortages) who co-approved.
--  * orders.cash_received_by / cash_received_at — who took the cash when the
--    office marks "Payment received" (and so the rider is not asked for the
--    same cash again).
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_value_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  kind         VARCHAR(40) NOT NULL,
  value        NUMERIC(12,2) NOT NULL CHECK (value >= 0),
  approved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS approval_value_log_admin_day_idx ON approval_value_log (admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_counts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id         UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  quality         VARCHAR(1) NOT NULL DEFAULT 'A' CHECK (quality IN ('A', 'B', 'C')),
  expected_qty    NUMERIC(12,3) NOT NULL,
  counted_qty     NUMERIC(12,3) NOT NULL CHECK (counted_qty >= 0),
  variance        NUMERIC(12,3) NOT NULL,
  variance_value  NUMERIC(12,2) NOT NULL,
  note            TEXT,
  counted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_counts_city_created_idx ON stock_counts (city_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_counts_product_idx ON stock_counts (product_id, quality, created_at DESC);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_received_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_received_at TIMESTAMPTZ;

-- Same default-deny posture as every other table (migration 49).
ALTER TABLE approval_value_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
