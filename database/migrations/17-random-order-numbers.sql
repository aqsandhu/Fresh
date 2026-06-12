-- ============================================================================
-- 17 — RANDOM (NON-GUESSABLE) ORDER NUMBERS
-- ----------------------------------------------------------------------------
-- Order numbers were 'ORD-YYYYMMDD-000001' with a global sequence — fully
-- enumerable. The public tracking endpoint requires the matching phone, so
-- this was not directly exploitable, but predictable identifiers leak order
-- volume and make any future endpoint that forgets the phone check instantly
-- harvestable. Switch the suffix to 8 random hex chars (~4.3e9 space) with a
-- uniqueness retry loop; the orders.order_number UNIQUE constraint remains
-- the hard backstop.
--
-- Existing order numbers are left untouched (they are referenced in chats,
-- notifications and customer history).
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_candidate TEXT;
BEGIN
    LOOP
        v_candidate := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                       UPPER(SUBSTRING(MD5(random()::text || clock_timestamp()::text) FOR 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE order_number = v_candidate);
    END LOOP;
    NEW.order_number := v_candidate;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The old sequence is no longer read by the trigger. Keep it dropped so a
-- future contributor doesn't wire it back in by accident.
DROP SEQUENCE IF EXISTS order_number_seq;
