-- ============================================================================
-- Migration 58 — separate per-rider pay for URGENT deliveries
-- ----------------------------------------------------------------------------
-- Rider pay is set per rider per time slot (rider_delivery_charges). Urgent
-- orders carry no slot, so until now they borrowed the rider's most recently
-- configured slot rate. The owner wants a dedicated urgent rate: set per rider
-- from the admin panel (Riders → rider → Pay per delivered order).
-- NULL = not set → the old fallback (latest slot rate) still applies.
-- Snapshotted onto orders.rider_delivery_charge at assignment, like slot pay.
-- ============================================================================
ALTER TABLE riders ADD COLUMN IF NOT EXISTS urgent_delivery_charge NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riders_urgent_delivery_charge_nonnegative') THEN
    ALTER TABLE riders ADD CONSTRAINT riders_urgent_delivery_charge_nonnegative
      CHECK (urgent_delivery_charge IS NULL OR urgent_delivery_charge >= 0);
  END IF;
END $$;
