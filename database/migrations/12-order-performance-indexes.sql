-- Composite indexes for common admin order filters (city + status/date).
-- Safe to run multiple times (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_orders_city_status
  ON orders(city_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_city_placed
  ON orders(city_id, placed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_city_placed
  ON orders(status, city_id, placed_at DESC)
  WHERE deleted_at IS NULL;
