-- ============================================================================
-- Migration 30 — Restaurants (B2B accounts)
-- A restaurant registers (phone + 4-digit PIN), an admin reviews & approves it,
-- then it logs in to the restaurant storefront. Idempotent; also auto-applied at
-- startup by backend/src/config/restaurantSchema.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS restaurants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name   VARCHAR(255) NOT NULL,
  owner_name      VARCHAR(255),
  phone           VARCHAR(20)  NOT NULL UNIQUE,
  pin_hash        VARCHAR(255) NOT NULL,
  email           VARCHAR(255),
  address         TEXT,
  city            VARCHAR(120),
  city_id         UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  location        GEOGRAPHY(POINT, 4326),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','disabled','banned')),
  free_delivery_threshold NUMERIC(10,2),
  delivery_base_charge    NUMERIC(10,2),
  admin_notes     TEXT,
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  login_count     INTEGER NOT NULL DEFAULT 0,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS restaurants_status_idx ON restaurants (status);
CREATE INDEX IF NOT EXISTS restaurants_city_idx ON restaurants (city_id);
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_phone_live_idx ON restaurants (phone) WHERE deleted_at IS NULL;

INSERT INTO permissions (code, description, category) VALUES
  ('restaurants.view',   'View restaurant accounts + requests', 'Restaurants'),
  ('restaurants.manage', 'Approve / disable / ban / remove restaurants + settings', 'Restaurants')
ON CONFLICT (code) DO NOTHING;
