-- ============================================================================
-- 70 — Every city has its own delivery time slots (owner's decision Q10,
-- 17 Nov 2026; work log A30).
--
-- Slots had no city: one list for every city, and any city admin could
-- change or delete slots another city's customers were booking. Now each slot
-- belongs to one city.
--
-- Existing slots:
--   * each slot stays with the city whose orders used it most (no orders →
--     the oldest active city) — existing orders keep their slot id;
--   * every OTHER active city that sells something gets its own copy of each
--     bookable slot (same times, limits and flags; its own booking counter),
--     and its riders keep their per-slot pay on the copy.
-- A slot left with no city (none existed yet) is treated as "every city" by
-- the API, so nothing breaks on an empty database.
-- ============================================================================

ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES service_cities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS time_slots_city_idx ON time_slots (city_id);

-- The same window may exist once per city and per audience (it was once in
-- the whole system — a restaurant slot with a consumer slot's times was
-- refused too).
ALTER TABLE time_slots DROP CONSTRAINT IF EXISTS uq_time_slots_unique;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'time_slots' AND column_name = 'audience') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_city_window ON time_slots (city_id, audience, slot_name, start_time, end_time)';
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_city_window ON time_slots (city_id, slot_name, start_time, end_time)';
  END IF;
END $$;

DO $$
DECLARE
  s RECORD;
  c RECORD;
  owner UUID;
  copy_id UUID;
  has_audience BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'time_slots' AND column_name = 'audience');
BEGIN
  FOR s IN SELECT * FROM time_slots WHERE city_id IS NULL LOOP
    owner := NULL;
    SELECT o.city_id INTO owner
      FROM orders o
     WHERE o.time_slot_id = s.id AND o.city_id IS NOT NULL
     GROUP BY o.city_id
     ORDER BY COUNT(*) DESC
     LIMIT 1;
    IF owner IS NULL THEN
      SELECT id INTO owner FROM service_cities WHERE is_active IS NOT FALSE ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF owner IS NULL THEN
      CONTINUE; -- no city yet: stays "every city"
    END IF;
    UPDATE time_slots SET city_id = owner WHERE id = s.id;

    IF s.status::text <> 'available' THEN
      CONTINUE; -- a switched-off slot is not copied
    END IF;

    FOR c IN
      SELECT sc.id FROM service_cities sc
       WHERE sc.is_active IS NOT FALSE AND sc.id <> owner
         AND EXISTS (SELECT 1 FROM products p WHERE p.city_id = sc.id AND p.is_active IS NOT FALSE)
    LOOP
      IF has_audience THEN
        EXECUTE
          'INSERT INTO time_slots (slot_name, start_time, end_time, max_orders, booked_orders, status, is_free_delivery_slot,
                                   is_express_slot, applicable_days, zone_ids, audience, city_id)
           SELECT slot_name, start_time, end_time, max_orders, 0, status, is_free_delivery_slot,
                  is_express_slot, applicable_days, zone_ids, audience, $2
             FROM time_slots WHERE id = $1
           RETURNING id'
          INTO copy_id USING s.id, c.id;
      ELSE
        INSERT INTO time_slots (slot_name, start_time, end_time, max_orders, booked_orders, status, is_free_delivery_slot,
                                is_express_slot, applicable_days, zone_ids, city_id)
        VALUES (s.slot_name, s.start_time, s.end_time, s.max_orders, 0, s.status, s.is_free_delivery_slot,
                s.is_express_slot, s.applicable_days, s.zone_ids, c.id)
        RETURNING id INTO copy_id;
      END IF;

      INSERT INTO rider_delivery_charges (rider_id, time_slot_id, charge_per_order, effective_from, created_by)
      SELECT rdc.rider_id, copy_id, rdc.charge_per_order, rdc.effective_from, rdc.created_by
        FROM rider_delivery_charges rdc
        JOIN riders r ON r.id = rdc.rider_id
       WHERE rdc.time_slot_id = s.id AND r.city_id = c.id
      ON CONFLICT (rider_id, time_slot_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
