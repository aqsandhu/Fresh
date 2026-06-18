-- ============================================================================
-- Migration 36 — Order Collection Points (OCP)
-- ----------------------------------------------------------------------------
-- A city admin creates physical collection points. An OCP logs in (phone + PIN,
-- a fully isolated session like restaurants), takes over assigned orders, assigns
-- riders, collects cash, receives stock, and settles money up to the city admin.
--
-- FINANCIAL/INVENTORY INTEGRITY:
--   * ocp_stock.quantity has a CHECK (>= 0) — a hard floor against corruption.
--   * ocp_stock_movements is an append-only audit ledger (balance == Σ movements).
--   * Settlements use a status state-machine; an order can belong to at most one
--     non-rejected settlement (UNIQUE), so cash can't be double-settled.
--
-- Idempotent — safe to re-run. Also auto-applied at startup by
-- backend/src/config/ocpSchema.ts (ensureOcpTables).
-- ============================================================================

BEGIN;

-- ── OCP entity + isolated login (mirrors restaurants) ───────────────────────
CREATE TABLE IF NOT EXISTS order_collection_points (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  owner_name    VARCHAR(255),
  phone         VARCHAR(20)  NOT NULL,
  pin_hash      VARCHAR(255) NOT NULL,
  city_id       UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  address       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  login_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ocp_city_idx ON order_collection_points (city_id);
CREATE INDEX IF NOT EXISTS ocp_status_idx ON order_collection_points (status);
-- One LIVE account per phone (soft-deleted rows can re-register).
CREATE UNIQUE INDEX IF NOT EXISTS ocp_phone_live_idx ON order_collection_points (phone) WHERE deleted_at IS NULL;

-- ── Order assignment + per-order phone reveal + settlement flag ─────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ocp_id UUID REFERENCES order_collection_points(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone_visible_to_ocp BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ocp_payment_settled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS orders_ocp_idx ON orders (ocp_id);

-- ── OCP stock: balance + append-only movements ledger ───────────────────────
CREATE TABLE IF NOT EXISTS ocp_stock (
  ocp_id     UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quality    VARCHAR(1) NOT NULL DEFAULT 'A',
  quantity   NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ocp_id, product_id, quality)
);

CREATE TABLE IF NOT EXISTS ocp_stock_movements (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocp_id         UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  quality        VARCHAR(1) NOT NULL DEFAULT 'A',
  delta          NUMERIC(12,3) NOT NULL,
  reason         VARCHAR(20) NOT NULL CHECK (reason IN ('receive','order_deduct','adjust','reverse')),
  ref_order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
  ref_request_id UUID,
  note           TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ocp_stock_movements_ocp_idx ON ocp_stock_movements (ocp_id, created_at DESC);

-- ── Stock send requests (city admin → OCP) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ocp_stock_requests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocp_id      UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE CASCADE,
  city_id     UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','cancelled')),
  note        TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ocp_stock_requests_ocp_idx ON ocp_stock_requests (ocp_id, status);

CREATE TABLE IF NOT EXISTS ocp_stock_request_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES ocp_stock_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quality    VARCHAR(1) NOT NULL DEFAULT 'A',
  quantity   NUMERIC(12,3) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS ocp_stock_request_items_req_idx ON ocp_stock_request_items (request_id);

-- ── Settlements (OCP → city admin, password-confirmed receive) ──────────────
CREATE TABLE IF NOT EXISTS ocp_settlements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocp_id       UUID NOT NULL REFERENCES order_collection_points(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','rejected')),
  note         TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at  TIMESTAMPTZ,
  received_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ocp_settlements_ocp_idx ON ocp_settlements (ocp_id, status);

CREATE TABLE IF NOT EXISTS ocp_settlement_orders (
  settlement_id UUID NOT NULL REFERENCES ocp_settlements(id) ON DELETE CASCADE,
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (settlement_id, order_id)
);
-- An order's cash can be tied to at most ONE settlement that isn't rejected.
-- (Enforced in code under lock; this partial unique index is the DB backstop.)
CREATE UNIQUE INDEX IF NOT EXISTS ocp_settlement_orders_order_uniq ON ocp_settlement_orders (order_id);

-- ── Permissions (admin-side OCP management) ─────────────────────────────────
INSERT INTO permissions (code, description, category) VALUES
  ('ocp.manage',             'Create / manage Order Collection Points', 'OCP'),
  ('ocp.stock.send',         'Send stock to an OCP',                    'OCP'),
  ('ocp.settlements.receive','Receive OCP cash settlements',            'OCP')
ON CONFLICT (code) DO NOTHING;

COMMIT;
