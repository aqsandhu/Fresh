-- ============================================================================
-- Migration 38 — Finance: expenses, stock purchasing (with grading), workers
-- (attendance + salary increments), profit-sharing settings, and shareholders
-- (+ payouts). All money-out flows through `expenses` (one ledger) so totals and
-- filters have a single source of truth. Idempotent.
-- ============================================================================

-- ── EXPENSES — single money-out ledger ──────────────────────────────────────
-- type: stock_purchase | rider_payment | worker_payment | other
-- For 'other', `category` is the free-text expense type (rent, utilities, …).
-- For payments, `category` is the kind (salary | bonus | commission | other).
CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id      UUID REFERENCES service_cities(id),
  type         VARCHAR(20) NOT NULL,
  category     VARCHAR(80),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  comment      TEXT,
  ref_type     VARCHAR(20),            -- stock_purchase | rider_payment | worker_payment
  ref_id       UUID,                   -- the detail row / rider / worker
  for_month    DATE,                   -- optional: month a salary/payment is for
  incurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS expenses_city_idx     ON expenses (city_id);
CREATE INDEX IF NOT EXISTS expenses_type_idx     ON expenses (type);
CREATE INDEX IF NOT EXISTS expenses_incurred_idx ON expenses (incurred_at DESC);
CREATE INDEX IF NOT EXISTS expenses_ref_idx      ON expenses (ref_type, ref_id);

-- ── STOCK PURCHASES — grading detail; grades add to system stock A/B/C ───────
CREATE TABLE IF NOT EXISTS stock_purchases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id        UUID REFERENCES service_cities(id),
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  purchased_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_weight     NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (raw_weight >= 0),
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  grade_a        NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (grade_a >= 0),
  grade_b        NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (grade_b >= 0),
  grade_c        NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (grade_c >= 0),
  waste          NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (waste >= 0),
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_purchases_product_idx ON stock_purchases (product_id);
CREATE INDEX IF NOT EXISTS stock_purchases_city_idx    ON stock_purchases (city_id, purchased_at DESC);

-- ── WORKERS + attendance + salary increments ────────────────────────────────
CREATE TABLE IF NOT EXISTS workers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       UUID REFERENCES service_cities(id),
  name          VARCHAR(120) NOT NULL,
  phone         VARCHAR(20),
  designation   VARCHAR(80),
  basic_salary  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  status        VARCHAR(10) NOT NULL DEFAULT 'active',  -- active | inactive
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workers_city_idx ON workers (city_id, status);

CREATE TABLE IF NOT EXISTS worker_attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id  UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  status     VARCHAR(10) NOT NULL DEFAULT 'present',  -- present | absent | half | leave
  note       TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, date)
);

-- Append-only salary history (each row = an increment effective from a month).
CREATE TABLE IF NOT EXISTS worker_salary_changes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id        UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  effective_from   DATE NOT NULL,
  new_basic_salary NUMERIC(12,2) NOT NULL CHECK (new_basic_salary >= 0),
  note             TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS worker_salary_changes_idx ON worker_salary_changes (worker_id, effective_from DESC);

-- ── PROFIT-SHARING settings (per city; super-admin edits, city-admin views) ──
-- FreshBazar share mode: per_order_fixed | category_percent | profit_margin_percent
CREATE TABLE IF NOT EXISTS profit_settings (
  city_id                   UUID PRIMARY KEY REFERENCES service_cities(id),
  freshbazar_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  freshbazar_mode           VARCHAR(24) NOT NULL DEFAULT 'per_order_fixed',
  freshbazar_per_order      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (freshbazar_per_order >= 0),
  freshbazar_margin_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (freshbazar_margin_percent >= 0 AND freshbazar_margin_percent <= 100),
  updated_by                UUID,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-category % of sale that FreshBazar takes (when mode = category_percent).
CREATE TABLE IF NOT EXISTS profit_category_shares (
  city_id     UUID NOT NULL REFERENCES service_cities(id),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  percent     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  PRIMARY KEY (city_id, category_id)
);

-- ── SHAREHOLDERS (isolated auth) + payouts ──────────────────────────────────
CREATE TABLE IF NOT EXISTS shareholders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       UUID REFERENCES service_cities(id),
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  password_hash TEXT,
  share_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (share_percent >= 0 AND share_percent <= 100),
  status        VARCHAR(10) NOT NULL DEFAULT 'active',  -- active | inactive
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS shareholders_email_uq ON shareholders (LOWER(email));
CREATE INDEX IF NOT EXISTS shareholders_city_idx ON shareholders (city_id, status);

-- City admin pays a shareholder → 'pending' until the shareholder RECEIVES it
-- via their own login (then 'received'). 'rejected' returns it to due.
CREATE TABLE IF NOT EXISTS shareholder_payouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shareholder_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
  city_id        UUID REFERENCES service_cities(id),
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status         VARCHAR(10) NOT NULL DEFAULT 'pending',  -- pending | received | rejected
  note           TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS shareholder_payouts_idx ON shareholder_payouts (shareholder_id, status, created_at DESC);
