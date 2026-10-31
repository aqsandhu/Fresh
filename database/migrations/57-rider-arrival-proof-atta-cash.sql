-- ============================================================================
-- Migration 57 — rider arrival stamp, atta COD collection + rider settlement
-- ----------------------------------------------------------------------------
-- 1) rider_tasks.arrived_at — set when the rider taps "I've arrived" (the
--    customer gets "Aapka order aapke darwaze par hai"). Admin order detail
--    shows it in the rider timeline.
-- 2) atta_requests.paid_amount / collected_by_rider_id — the delivery rider
--    collects the atta charges (service + milling + delivery) in cash when the
--    flour is handed over; before this nothing recorded that cash at all.
-- 3) rider_cash_settlement_atta — links that atta cash to the rider's cash
--    hand-over (same idea as rider_cash_settlement_orders for orders), so the
--    admin "Receive cash" settles it exactly once.
-- All statements are idempotent; the backend probes for these objects and
-- degrades gracefully when the migration has not run yet.
-- ============================================================================

ALTER TABLE rider_tasks ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

ALTER TABLE atta_requests ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE atta_requests ADD COLUMN IF NOT EXISTS collected_by_rider_id UUID REFERENCES riders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS rider_cash_settlement_atta (
  settlement_id   UUID NOT NULL REFERENCES rider_cash_settlements(id) ON DELETE CASCADE,
  atta_request_id UUID NOT NULL REFERENCES atta_requests(id) ON DELETE RESTRICT,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (settlement_id, atta_request_id),
  UNIQUE (atta_request_id)
);
CREATE INDEX IF NOT EXISTS rider_cash_settlement_atta_request_idx
  ON rider_cash_settlement_atta (atta_request_id);

CREATE INDEX IF NOT EXISTS atta_requests_collected_by_rider_idx
  ON atta_requests (collected_by_rider_id) WHERE collected_by_rider_id IS NOT NULL;

-- Rider dashboards filter rider_tasks by rider + status constantly.
CREATE INDEX IF NOT EXISTS rider_tasks_rider_status_idx ON rider_tasks (rider_id, status);

-- Same default-deny posture as every other table (migration 49).
ALTER TABLE rider_cash_settlement_atta ENABLE ROW LEVEL SECURITY;
