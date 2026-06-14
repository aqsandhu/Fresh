-- ============================================================================
-- MIGRATION 24 — Reviews / Ratings + Complaints (Feature 3)
-- ----------------------------------------------------------------------------
-- * Product rating aggregates (riders already carry a `rating` column 1.0–5.0).
-- * Unified `reviews` table covering products, riders, and the service/order
--   experience, tied to the order the customer actually received.
-- * Full `complaints` ticketing table with status workflow + admin response.
-- * Support permission codes for admin moderation.
--
-- Idempotent: safe to run repeatedly. Mirrored by backend/src/config/feedbackSchema.ts
-- which auto-applies the same statements at startup.
-- ============================================================================

BEGIN;

-- ── Aggregates ──────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_average DECIMAL(3,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count   INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE riders   ADD COLUMN IF NOT EXISTS rating_count   INTEGER     NOT NULL DEFAULT 0;

-- ── Reviews ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  VARCHAR(20) NOT NULL CHECK (target_type IN ('product','rider','service')),
  product_id   UUID REFERENCES products(id) ON DELETE CASCADE,
  rider_id     UUID REFERENCES riders(id)   ON DELETE CASCADE,
  order_id     UUID REFERENCES orders(id)   ON DELETE SET NULL,
  city_id      UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  rating       SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment      TEXT,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  admin_reply  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One review per customer per target per order.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_product
  ON reviews (user_id, order_id, product_id) WHERE target_type = 'product';
CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_rider
  ON reviews (user_id, order_id) WHERE target_type = 'rider';
CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_service
  ON reviews (user_id, order_id) WHERE target_type = 'service';

CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews (product_id) WHERE target_type = 'product';
CREATE INDEX IF NOT EXISTS reviews_rider_idx   ON reviews (rider_id)   WHERE target_type = 'rider';
CREATE INDEX IF NOT EXISTS reviews_user_idx     ON reviews (user_id);
CREATE INDEX IF NOT EXISTS reviews_city_idx     ON reviews (city_id);

-- ── Complaints ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number  VARCHAR(20) UNIQUE NOT NULL,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id       UUID REFERENCES orders(id)  ON DELETE SET NULL,
  rider_id       UUID REFERENCES riders(id)  ON DELETE SET NULL,
  city_id        UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  category       VARCHAR(40)  NOT NULL DEFAULT 'other',
  subject        VARCHAR(200) NOT NULL,
  message        TEXT NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','in_progress','resolved','closed')),
  priority       VARCHAR(10)  NOT NULL DEFAULT 'normal'
                 CHECK (priority IN ('low','normal','high')),
  admin_response TEXT,
  resolved_at    TIMESTAMPTZ,
  resolved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS complaints_user_idx   ON complaints (user_id);
CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status);
CREATE INDEX IF NOT EXISTS complaints_city_idx   ON complaints (city_id);
CREATE INDEX IF NOT EXISTS complaints_order_idx  ON complaints (order_id);

-- ── Permissions ─────────────────────────────────────────────────────────────
INSERT INTO permissions (code, description, category) VALUES
  ('reviews.view',     'View product / rider / service reviews', 'Support'),
  ('reviews.manage',   'Moderate / reply to reviews',            'Support'),
  ('complaints.view',  'View customer complaints',               'Support'),
  ('complaints.manage','Respond to / resolve complaints',        'Support')
ON CONFLICT (code) DO NOTHING;

COMMIT;
