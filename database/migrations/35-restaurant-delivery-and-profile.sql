-- ============================================================================
-- Migration 35 — Restaurant delivery config + editable profile
-- ----------------------------------------------------------------------------
-- Restaurants get their OWN delivery configuration, independent of the consumer
-- one:
--   * time_slots.audience — 'consumer' (default) vs 'restaurant'. Restaurant
--     checkout shows only audience='restaurant' slots; the consumer storefront
--     keeps showing audience='consumer' slots. Booking capacity (max_orders /
--     booked_orders) is reused as-is.
--   * Restaurant urgent fee + ETA live in site_settings
--     (restaurant_delivery_urgent_charge / restaurant_delivery_urgent_eta),
--     mirroring restaurant_delivery_base_charge / _free_delivery_threshold.
--   * restaurants.front_image_url — storefront photo the rider/restaurant can
--     set so the delivery address is easy to find. Editable at checkout and by
--     the rider; updates the master restaurant row (shows everywhere) and is
--     snapshot onto each order.
--
-- Idempotent — safe to re-run. Also auto-applied at startup by
-- backend/src/config/restaurantSchema.ts (ensureRestaurantDeliveryColumns).
-- ============================================================================

BEGIN;

ALTER TABLE time_slots  ADD COLUMN IF NOT EXISTS audience VARCHAR(20) NOT NULL DEFAULT 'consumer';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS front_image_url TEXT;

CREATE INDEX IF NOT EXISTS time_slots_audience_idx ON time_slots (audience);

COMMENT ON COLUMN time_slots.audience IS 'Who the slot is for: consumer (default) or restaurant';
COMMENT ON COLUMN restaurants.front_image_url IS 'Storefront photo to help riders locate the restaurant; editable at checkout + by the rider';

COMMIT;
