-- ============================================================================
-- Migration 37 — Catalog v2 + city stock ledger
--
-- 1) Per-quality consumer/restaurant ENABLE flags + explicit B/C and restaurant
--    half/quarter/half-dozen fraction prices (A already had half_kg/quarter_kg/
--    half_dozen). Blank fraction => derive from the per-kg price.
-- 2) Reservation columns on products (soft holds) + orders.stock_reserved flag.
-- 3) System stock movement ledger (append-only audit; balance == Σ deltas).
-- 4) Complaint refunds ledger + order links for free/partial replacement orders.
--
-- Idempotent: safe to re-run. The OCP location ledger (ocp_stock /
-- ocp_stock_movements) already exists from migration 36.
-- ============================================================================

-- ── 1) Per-quality enable flags ─────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS consumer_enabled_a   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS consumer_enabled_b   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS consumer_enabled_c   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_enabled_a BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_enabled_b BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_enabled_c BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Consumer fraction prices for B & C (A already has half_kg_price etc.) ────
ALTER TABLE products ADD COLUMN IF NOT EXISTS half_kg_price_b     NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS quarter_kg_price_b  NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS half_dozen_price_b  NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS half_kg_price_c     NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS quarter_kg_price_c  NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS half_dozen_price_c  NUMERIC(10,2);

-- ── Restaurant fraction prices per quality (restaurant_price_a/b/c exist) ────
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_half_kg_price_a     NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_quarter_kg_price_a  NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_half_dozen_price_a  NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_half_kg_price_b     NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_quarter_kg_price_b  NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_half_dozen_price_b  NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_half_kg_price_c     NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_quarter_kg_price_c  NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS restaurant_half_dozen_price_c  NUMERIC(10,2);

-- ── 2) Reservation (soft holds) per quality ─────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_quantity   NUMERIC(12,3) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_quantity_b NUMERIC(12,3) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_quantity_c NUMERIC(12,3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_reserved_nonneg') THEN
    ALTER TABLE products ADD CONSTRAINT products_reserved_nonneg
      CHECK (reserved_quantity >= 0 AND reserved_quantity_b >= 0 AND reserved_quantity_c >= 0);
  END IF;
END $$;

-- Orders that went through the reservation model (vs. legacy hard-deduct).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Complaint replacement order links ───────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS replacement_for_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS complaint_id UUID;
CREATE INDEX IF NOT EXISTS orders_replacement_for_idx ON orders (replacement_for_order_id);

-- ── 3) System stock movement ledger (append-only) ───────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quality       VARCHAR(1) NOT NULL DEFAULT 'A',
  city_id       UUID REFERENCES service_cities(id),
  delta         NUMERIC(12,3) NOT NULL,
  reason        VARCHAR(20) NOT NULL,  -- purchase|reserve|release|sale|waste|convert_out|convert_in|adjust
  ref_order_id  UUID,
  ref_ocp_id    UUID,
  note          TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements (product_id, quality);
CREATE INDEX IF NOT EXISTS stock_movements_order_idx   ON stock_movements (ref_order_id);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements (created_at DESC);

-- ── 4) Complaint refunds ledger (admin-only outflow) ────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  complaint_id             UUID,
  amount                   NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  original_payment_source  VARCHAR(10) NOT NULL DEFAULT 'admin',  -- admin | ocp (record only)
  note                     TEXT,
  refunded_by              UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refunds_order_idx     ON refunds (order_id);
CREATE INDEX IF NOT EXISTS refunds_complaint_idx ON refunds (complaint_id);
