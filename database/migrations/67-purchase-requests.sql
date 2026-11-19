-- ============================================================================
-- 67 — Stock purchases entered by staff wait for the city admin's approval.
--
-- Owner decision J1 (15 Nov 2026): staff may ENTER a purchase, but it only
-- changes stock and the ledger once the city admin accepts it (one by one, or
-- "approve all"). The request is kept whole here; approving it runs the same
-- code that a direct purchase runs and links the resulting stock_purchases row.
-- Nothing else reads this table, so profit / reconciliation are unaffected
-- until a request is approved.
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       UUID,
  product_id    UUID NOT NULL,
  payload       JSONB NOT NULL,
  bill_photo_url TEXT,
  status        VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by  UUID,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  decision_note VARCHAR(300),
  purchase_id   UUID
);
CREATE INDEX IF NOT EXISTS purchase_requests_pending_idx ON purchase_requests (city_id, requested_at DESC) WHERE status = 'pending';
