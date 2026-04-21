-- ============================================================================
-- RIDER SYSTEM MIGRATION
-- Adds: per-slot delivery charges, payment tracking, enhanced rider fields
-- ============================================================================

-- 1. Rider per-slot delivery charges (admin sets rates per rider per time slot)
CREATE TABLE IF NOT EXISTS rider_delivery_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    time_slot_id UUID NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
    charge_per_order DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(rider_id, time_slot_id)
);

CREATE INDEX IF NOT EXISTS idx_rider_delivery_charges_rider ON rider_delivery_charges(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_delivery_charges_slot ON rider_delivery_charges(time_slot_id);

-- 2. Add delivery_charge_for_rider to orders (snapshot of rider rate at assignment time)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_delivery_charge DECIMAL(10,2) DEFAULT 0.00;

-- 3. Add password field to rider creation (rider app uses phone+password login)
-- password_hash already exists on users table, no migration needed

-- 4. Add emergency_contact fields if not exist (schema already has them, this is safe)
-- Already in schema: emergency_contact_name, emergency_contact_phone

-- 5. Indexes for stats queries
CREATE INDEX IF NOT EXISTS idx_orders_rider_delivered ON orders(rider_id, status) WHERE status = 'delivered';
CREATE INDEX IF NOT EXISTS idx_orders_rider_placed_at ON orders(rider_id, placed_at);
CREATE INDEX IF NOT EXISTS idx_rider_tasks_completed ON rider_tasks(rider_id, completed_at) WHERE status = 'completed';
