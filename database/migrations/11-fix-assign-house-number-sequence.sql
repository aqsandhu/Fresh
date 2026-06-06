-- Fix assign_house_number: MAX(NULL::INTEGER) always returned NULL, so every
-- address in a zone got the same sequence (ZONE-0001).

CREATE OR REPLACE FUNCTION assign_house_number(p_address_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_house_number VARCHAR(50);
    v_zone_code VARCHAR(10);
    v_sequence INTEGER;
BEGIN
    SELECT dz.code INTO v_zone_code
    FROM addresses a
    JOIN delivery_zones dz ON a.zone_id = dz.id
    WHERE a.id = p_address_id;

    IF v_zone_code IS NULL THEN
        v_zone_code := 'UNK';
    END IF;

    SELECT COALESCE(MAX(
        CAST(NULLIF(SPLIT_PART(house_number, '-', 2), '') AS INTEGER)
    ), 0) + 1 INTO v_sequence
    FROM addresses
    WHERE house_number LIKE v_zone_code || '-%';

    v_house_number := v_zone_code || '-' || LPAD(v_sequence::TEXT, 4, '0');

    UPDATE addresses
    SET house_number = v_house_number,
        updated_at = NOW()
    WHERE id = p_address_id AND house_number IS NULL;

    RETURN v_house_number;
END;
$$ LANGUAGE plpgsql;
