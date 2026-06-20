-- ============================================================================
-- Migration 40 — per-date time-slot capacity.
--
-- time_slots.booked_orders is a SINGLE global counter shared across every
-- delivery date, so capacity could never be enforced per day (a slot "filled"
-- on one date blocked all dates, and a cancellation freed capacity on every
-- date). This adds a per-(slot, date) counter that checkout claims against.
-- Mirrored by backend/src/config/timeSlotSchema.ts (lazy bootstrap).
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS time_slot_bookings (
    time_slot_id  UUID NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
    delivery_date DATE NOT NULL,
    booked_count  INTEGER NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (time_slot_id, delivery_date)
);

CREATE INDEX IF NOT EXISTS time_slot_bookings_date_idx ON time_slot_bookings (delivery_date);

COMMENT ON TABLE time_slot_bookings IS 'Per-(slot, delivery_date) booked seat count — authoritative capacity gate (replaces the global time_slots.booked_orders for enforcement).';
