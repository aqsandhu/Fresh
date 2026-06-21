-- ============================================================================
-- Migration 41 - Protect product history and seed finance permissions.
-- ============================================================================

DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.stock_movements') IS NOT NULL THEN
    SELECT conname INTO fk_name
      FROM pg_constraint
     WHERE conrelid = to_regclass('public.stock_movements')
       AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE '%REFERENCES products%'
     LIMIT 1;

    IF fk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE stock_movements DROP CONSTRAINT %I', fk_name);
    END IF;

    ALTER TABLE stock_movements ALTER COLUMN product_id DROP NOT NULL;
    ALTER TABLE stock_movements
      ADD CONSTRAINT stock_movements_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.ocp_stock') IS NOT NULL THEN
    SELECT conname INTO fk_name
      FROM pg_constraint
     WHERE conrelid = to_regclass('public.ocp_stock')
       AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE '%REFERENCES products%'
     LIMIT 1;

    IF fk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE ocp_stock DROP CONSTRAINT %I', fk_name);
    END IF;

    ALTER TABLE ocp_stock
      ADD CONSTRAINT ocp_stock_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.ocp_stock_request_items') IS NOT NULL THEN
    SELECT conname INTO fk_name
      FROM pg_constraint
     WHERE conrelid = to_regclass('public.ocp_stock_request_items')
       AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE '%REFERENCES products%'
     LIMIT 1;

    IF fk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE ocp_stock_request_items DROP CONSTRAINT %I', fk_name);
    END IF;

    ALTER TABLE ocp_stock_request_items ALTER COLUMN product_id DROP NOT NULL;
    ALTER TABLE ocp_stock_request_items
      ADD CONSTRAINT ocp_stock_request_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    SELECT conname INTO fk_name
      FROM pg_constraint
     WHERE conrelid = to_regclass('public.reviews')
       AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE '%REFERENCES products%'
     LIMIT 1;

    IF fk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT %I', fk_name);
    END IF;

    ALTER TABLE reviews
      ADD CONSTRAINT reviews_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rider_cash_settlements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id    UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  city_id     UUID REFERENCES service_cities(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status      VARCHAR(10) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'void')),
  note        TEXT,
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rider_cash_settlements_rider_idx ON rider_cash_settlements (rider_id, received_at DESC);
CREATE INDEX IF NOT EXISTS rider_cash_settlements_city_idx ON rider_cash_settlements (city_id, received_at DESC);

CREATE TABLE IF NOT EXISTS rider_cash_settlement_orders (
  settlement_id UUID NOT NULL REFERENCES rider_cash_settlements(id) ON DELETE CASCADE,
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (settlement_id, order_id),
  UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS rider_cash_settlement_orders_order_idx ON rider_cash_settlement_orders (order_id);

INSERT INTO permissions (code, description, category) VALUES
  ('stock.adjust', 'Emergency stock corrections', 'Products'),
  ('finance.expenses.view', 'View finance expenses', 'Finance'),
  ('finance.expenses.create', 'Create non-stock expenses', 'Finance'),
  ('finance.stock_purchase.create', 'Enter stock purchases', 'Finance'),
  ('finance.rider_payments.create', 'Record rider payments', 'Finance'),
  ('finance.rider_cash.receive', 'Receive COD cash from riders', 'Finance'),
  ('finance.workers.manage', 'Manage workers, attendance and pay', 'Finance'),
  ('finance.profit.view', 'View profit reports', 'Finance'),
  ('finance.profit.manage', 'Manage profit-sharing settings', 'Finance'),
  ('finance.shareholders.view', 'View shareholders and payouts', 'Finance'),
  ('finance.shareholders.manage', 'Create/edit shareholders', 'Finance'),
  ('finance.shareholders.pay', 'Record shareholder payouts', 'Finance')
ON CONFLICT (code) DO UPDATE
  SET description = EXCLUDED.description,
      category = EXCLUDED.category;
