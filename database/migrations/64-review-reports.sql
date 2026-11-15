-- ============================================================================
-- 64 — Customers can REPORT a published review (App Store guideline 1.2:
-- an app that shows other people's content needs a way to report it).
--
-- One report per customer per review. When REVIEW_AUTO_HIDE_REPORTS different
-- customers (default 3) have reported a review it is unpublished until an
-- admin looks at it; the admin list shows how many reports each review has.
-- ============================================================================
CREATE TABLE IF NOT EXISTS review_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id   UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      VARCHAR(40) NOT NULL DEFAULT 'other',
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT review_reports_one_per_customer UNIQUE (review_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS review_reports_review_idx ON review_reports (review_id);

-- When the admin last dealt with the reports (cleared / kept the review).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reports_reviewed_at TIMESTAMPTZ;
