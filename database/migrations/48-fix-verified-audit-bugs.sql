-- ============================================================================
-- Migration 48 — Fix verified audit bugs (DBP-2/3, DBP-4, DBP-5, DBP-10, DBP-13)
-- ----------------------------------------------------------------------------
-- 1) notification_type enum: add 'order_amount_updated' + 'reconciliation_alert'
--    (backend inserts both; without them the INSERTs fail with 22P02 and the
--    admin variable-weight adjustment transaction always rolls back).
-- 2) cart_items uniqueness must include `quality` (migration 34 added the
--    column but never widened the constraint — adding a Quality-B line of the
--    same product+unit raised 23505).
-- 3) assign_house_number(): the sequence was read from the MIDDLE '-'-segment
--    ('GJ-01-0001' → '01'), so MAX was always 1 and every address after the
--    first in a zone got the same house number. Parse the LAST segment.
-- 4) FREE_MORNING_SLOT seed never set order_before_time, but
--    calculate_delivery_charge() requires it non-NULL — the rule never fired.
-- 5) update_cart_weight() ignored unit fractions — cart weight was overstated
--    up to 4x for half_kg / quarter_kg / half_dozen lines.
--
-- Idempotent — safe to re-run. All of the above is already reflected in
-- database/schema.sql for fresh installs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) notification_type enum values
-- ----------------------------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_amount_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reconciliation_alert';

-- ----------------------------------------------------------------------------
-- 2) cart_items: widen the unique constraint to (cart_id, product_id, unit,
--    quality). Data valid under the OLD stricter 3-column constraint is always
--    valid under the new one, and cart_items.quality is NOT NULL, so this
--    cannot fail on existing rows.
-- ----------------------------------------------------------------------------
ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_cart_product_unit_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_cart_product_unit_quality_key'
  ) THEN
    ALTER TABLE cart_items
      ADD CONSTRAINT cart_items_cart_product_unit_quality_key
      UNIQUE (cart_id, product_id, unit, quality);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) assign_house_number(): sequence from the LAST '-'-segment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_house_number(p_address_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_house_number VARCHAR(50);
    v_zone_code VARCHAR(10);
    v_sequence INTEGER;
BEGIN
    -- Get zone code from address
    SELECT dz.code INTO v_zone_code
    FROM addresses a
    JOIN delivery_zones dz ON a.zone_id = dz.id
    WHERE a.id = p_address_id;

    IF v_zone_code IS NULL THEN
        v_zone_code := 'UNK';
    END IF;

    -- Generate sequence for this zone (numeric suffix after the LAST '-')
    SELECT COALESCE(MAX(
        CAST(regexp_replace(house_number, '^.*-', '') AS INTEGER)
    ), 0) + 1 INTO v_sequence
    FROM addresses
    WHERE house_number LIKE v_zone_code || '-%'
      AND regexp_replace(house_number, '^.*-', '') ~ '^\d+$';

    v_house_number := v_zone_code || '-' || LPAD(v_sequence::TEXT, 4, '0');

    UPDATE addresses
    SET house_number = v_house_number,
        updated_at = NOW()
    WHERE id = p_address_id AND house_number IS NULL;

    RETURN v_house_number;
END;
$$ LANGUAGE plpgsql;

-- NOTE: no UNIQUE constraint is added on addresses.house_number — databases
-- affected by the old bug can already contain duplicate house numbers, so a
-- uniqueness change would fail (or require data cleanup) on exactly the
-- deployments that need this fix. The corrected MAX()+1 logic restores
-- monotonic assignment going forward.

-- ----------------------------------------------------------------------------
-- 4) FREE_MORNING_SLOT: backfill the missing order cutoff time
-- ----------------------------------------------------------------------------
UPDATE delivery_charges_config
   SET order_before_time = '10:00'
 WHERE rule_code = 'FREE_MORNING_SLOT'
   AND order_before_time IS NULL;

-- ----------------------------------------------------------------------------
-- 5) update_cart_weight(): account for unit fractions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_cart_weight()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE carts
        SET total_weight_kg = (
            SELECT COALESCE(SUM(
                ci.quantity * p.unit_value * CASE p.unit_type
                    WHEN 'kg' THEN 1.0
                    WHEN 'gram' THEN 0.001
                    WHEN 'liter' THEN 1.0
                    WHEN 'ml' THEN 0.001
                    ELSE 0.1
                END
                -- Unit-fraction lines weigh a fraction of the full unit.
                * CASE ci.unit
                    WHEN 'half_kg' THEN 0.5
                    WHEN 'quarter_kg' THEN 0.25
                    WHEN 'half_dozen' THEN 0.5
                    ELSE 1.0
                END
            ), 0)
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.cart_id = OLD.cart_id
        ),
        updated_at = NOW()
        WHERE id = OLD.cart_id;
        RETURN OLD;
    ELSE
        UPDATE carts
        SET total_weight_kg = (
            SELECT COALESCE(SUM(
                ci.quantity * p.unit_value * CASE p.unit_type
                    WHEN 'kg' THEN 1.0
                    WHEN 'gram' THEN 0.001
                    WHEN 'liter' THEN 1.0
                    WHEN 'ml' THEN 0.001
                    ELSE 0.1
                END
                * CASE ci.unit
                    WHEN 'half_kg' THEN 0.5
                    WHEN 'quarter_kg' THEN 0.25
                    WHEN 'half_dozen' THEN 0.5
                    ELSE 1.0
                END
            ), 0)
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.cart_id = NEW.cart_id
        ),
        updated_at = NOW()
        WHERE id = NEW.cart_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
