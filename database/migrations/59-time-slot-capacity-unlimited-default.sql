-- ============================================================================
-- Migration 59 — time slot capacity is UNLIMITED unless the admin sets a cap
-- ----------------------------------------------------------------------------
-- Owner rule: a slot has no order limit by default; the admin adds a limit only
-- on the slots that need one. NULL max_orders already means "no cap" in the
-- capacity claim (utils/timeSlots.ts); this drops the old DEFAULT 50 so a new
-- slot is created unlimited, and guards against 0 / negative caps.
-- Existing slots keep whatever limit they have — the admin clears the box in
-- Settings → Time slots to make one unlimited.
-- ============================================================================
ALTER TABLE time_slots ALTER COLUMN max_orders DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_slots_max_orders_positive') THEN
    ALTER TABLE time_slots ADD CONSTRAINT time_slots_max_orders_positive
      CHECK (max_orders IS NULL OR max_orders >= 1) NOT VALID;
  END IF;
END $$;
