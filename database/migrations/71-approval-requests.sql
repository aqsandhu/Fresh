-- ============================================================================
-- 71 — One approval queue for every two-admin action (owner's decision J1,
-- 15 Nov 2026; work log W10).
--
-- Staff enter the action; the city admin approves each entry, rejects it, or
-- approves all. Covers what used to need a second admin's approval code on the
-- spot: waste, quality conversion, stock-count shortage, complaint refund,
-- other expenses, rider and worker payments, a manual order's discount — and
-- a worker's salary increase (J8, which needed no approval at all).
-- Stock purchases keep their own queue (migration 67).
--
-- A request stores what was asked (the route and its input). Approving runs
-- that same action again, as the person who asked, with the approver as the
-- second admin — so every check (stock still there, refund within what was
-- paid, the daily limit) is made again at that moment.
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       UUID REFERENCES service_cities(id) ON DELETE SET NULL,
  kind          VARCHAR(40) NOT NULL,
  label         TEXT NOT NULL,
  value         NUMERIC(12,2) NOT NULL DEFAULT 0,
  replay_key    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  fingerprint   TEXT NOT NULL,
  status        VARCHAR(12) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approving', 'approved', 'rejected', 'failed')),
  requested_by  UUID NOT NULL REFERENCES users(id),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by    UUID REFERENCES users(id),
  decided_at    TIMESTAMPTZ,
  note          TEXT,
  result        JSONB
);
CREATE INDEX IF NOT EXISTS approval_requests_city_idx ON approval_requests (city_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS approval_requests_requester_idx ON approval_requests (requested_by, requested_at DESC);
-- The same entry sent twice (double press) is one request.
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_pending_once ON approval_requests (fingerprint) WHERE status = 'pending';

INSERT INTO permissions (code, description, category) VALUES
  ('approvals.decide', 'Approve or reject entries staff sent for approval (waste, refunds, payments, discounts, increments)', 'Finance')
ON CONFLICT (code) DO NOTHING;

-- Who decides today: the roles that already approve stock purchases, plus
-- every role that can see the city's profit (manager level).
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT DISTINCT a.role_id, ad.id
  FROM admin_role_permissions a
  JOIN permissions p ON p.id = a.permission_id AND p.code IN ('finance.stock_purchase.approve', 'finance.profit.view')
  CROSS JOIN (SELECT id FROM permissions WHERE code = 'approvals.decide') ad
ON CONFLICT DO NOTHING;
