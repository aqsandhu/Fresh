-- ============================================================================
-- 69 — A shareholder payout records WHICH period it pays (round 6, bug A26).
--
-- The payout cap used to count only payouts CREATED inside the period being
-- paid. Paying last month's share in this month is the normal way of working,
-- and then last month's count stayed 0 — the same share could be paid again
-- and again. Every payout now carries the Pakistan days it pays for, and the
-- cap counts every payout whose period overlaps the one being paid.
--
-- Existing rows: the old screen paid "this month" unless the admin picked
-- another period, so each old payout is taken as paying the month it was made
-- in. (Check production's payouts before deploying — see the work log.)
-- ============================================================================

ALTER TABLE shareholder_payouts ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE shareholder_payouts ADD COLUMN IF NOT EXISTS period_end DATE;

UPDATE shareholder_payouts
   SET period_start = date_trunc('month', created_at AT TIME ZONE 'Asia/Karachi')::date,
       period_end   = (date_trunc('month', created_at AT TIME ZONE 'Asia/Karachi') + INTERVAL '1 month - 1 day')::date
 WHERE period_start IS NULL OR period_end IS NULL;

CREATE INDEX IF NOT EXISTS shareholder_payouts_period_idx
  ON shareholder_payouts (shareholder_id, period_start, period_end);
