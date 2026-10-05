-- ============================================================================
-- Migration 54 — Serialise assign_house_number() per zone (no duplicate numbers)
-- ----------------------------------------------------------------------------
-- The function computes MAX(sequence)+1 over the zone's existing house numbers
-- and writes it back. Two checkouts that create new addresses in the same zone
-- at the same moment both read the same MAX and both receive the SAME house
-- number. Migration 48 fixed the parsing bug but could not add a UNIQUE
-- constraint, because legacy data already contains duplicates.
--
-- A transaction-scoped advisory lock keyed on the zone code makes the
-- read-then-write atomic across concurrent transactions without touching any
-- existing rows. The only caller (checkout) runs this inside the order
-- transaction, so the lock is released at COMMIT/ROLLBACK and never outlives
-- the request.
--
-- Idempotent — safe to re-run. No BEGIN/COMMIT: the migration runner wraps
-- each file in its own transaction. database/schema.sql mirrors this body for
-- fresh installs.
-- ============================================================================

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

    -- Serialise concurrent assignments within this zone. Transaction-scoped,
    -- so it is released automatically at COMMIT/ROLLBACK.
    PERFORM pg_advisory_xact_lock(hashtext('assign_house_number'), hashtext(v_zone_code));

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
