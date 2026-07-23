-- ============================================================================
-- MIGRATION 26 — admin-managed user guidance tips
-- ----------------------------------------------------------------------------
-- Per-page Urdu guidance tips an admin can add, reorder (priority), and pause.
-- city_id NULL = global (shown in every city); a city_id scopes the tip to one
-- city. The storefront/app merge global + city tips for the page they're on.
--
-- Recommended defaults are seeded as global rows by
-- backend/src/config/tipsSchema.ts (idempotent) so they appear in the admin
-- list and can be paused / prioritised.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_tips (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city_id     UUID REFERENCES service_cities(id) ON DELETE CASCADE,
  page        VARCHAR(40) NOT NULL,
  text_ur     TEXT NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_seed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_tips_page_idx ON user_tips (page);
CREATE INDEX IF NOT EXISTS user_tips_city_idx ON user_tips (city_id);
CREATE INDEX IF NOT EXISTS user_tips_active_idx ON user_tips (page, is_active);

INSERT INTO permissions (code, description, category) VALUES
  ('tips.view',   'View user guidance tips', 'Settings'),
  ('tips.manage', 'Add / edit / pause user guidance tips', 'Settings')
ON CONFLICT (code) DO NOTHING;

COMMIT;
