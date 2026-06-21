-- ============================================================================
-- Migration 42 - OCP shortage controls, stock movement proof metadata, and
-- granular shortage permission.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ocp_stock_shortages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocp_id          UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE RESTRICT,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  quality         VARCHAR(1) NOT NULL DEFAULT 'A',
  shortage_qty    NUMERIC(12,3) NOT NULL CHECK (shortage_qty > 0),
  status          VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  note            TEXT,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ocp_stock_shortages_ocp_idx ON ocp_stock_shortages (ocp_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ocp_stock_shortages_order_idx ON ocp_stock_shortages (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS ocp_stock_shortages_open_line_uniq
  ON ocp_stock_shortages (ocp_id, product_id, order_id, quality)
  WHERE status = 'open';

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS evidence_quantity NUMERIC(12,3);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

INSERT INTO permissions (code, description, category) VALUES
  ('ocp.shortages.manage', 'View and resolve OCP stock shortages', 'OCP')
ON CONFLICT (code) DO UPDATE
  SET description = EXCLUDED.description,
      category = EXCLUDED.category;
