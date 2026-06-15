-- ============================================================================
-- MIGRATION 29 — "Work as a rider" applications
-- ----------------------------------------------------------------------------
-- Stores rider applications submitted from the website/app "Work as Rider"
-- page. Page content (benefits, hours, terms) lives in site_settings.
--
-- Idempotent. Mirrored by backend/src/config/riderApplicationSchema.ts.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS rider_applications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     VARCHAR(255) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  city          VARCHAR(120),
  city_id       UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  area          VARCHAR(255),
  vehicle_type  VARCHAR(50),
  message       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','reviewing','approved','rejected')),
  admin_notes   TEXT,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rider_applications_status_idx ON rider_applications (status);
CREATE INDEX IF NOT EXISTS rider_applications_city_idx ON rider_applications (city_id);

INSERT INTO permissions (code, description, category) VALUES
  ('rider_applications.view',   'View rider applications',   'Riders'),
  ('rider_applications.manage', 'Manage rider applications + page content', 'Riders')
ON CONFLICT (code) DO NOTHING;

COMMIT;
