-- ============================================================================
-- FRESHBAZAR DATABASE SCHEMA FIXES
-- ============================================================================
-- Description: Production-ready fixes for missing foreign keys, indexes,
--              constraints, triggers, and seed data
-- Generated: Database Fix Specialist
-- ============================================================================

-- ============================================================================
-- HIGH PRIORITY: MISSING FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Fix 1: riders.assigned_zone_id → delivery_zones(id)
-- Description: Links riders to their assigned delivery zone
-- ON DELETE SET NULL: If zone is deleted, rider becomes unassigned but record preserved
ALTER TABLE riders
    ADD CONSTRAINT fk_riders_assigned_zone
    FOREIGN KEY (assigned_zone_id) REFERENCES delivery_zones(id)
    ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_riders_assigned_zone ON riders IS 
    'Links rider to their assigned delivery zone. Zone deletion unassigns rider.';

-- Fix 2: addresses.zone_id → delivery_zones(id)
-- Description: Links addresses to delivery zones for zone-based operations
-- ON DELETE SET NULL: If zone is deleted, address remains but zone reference cleared
ALTER TABLE addresses
    ADD CONSTRAINT fk_addresses_zone
    FOREIGN KEY (zone_id) REFERENCES delivery_zones(id)
    ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_addresses_zone ON addresses IS 
    'Links address to delivery zone for zone-based delivery operations.';

-- Fix 3: atta_requests.mill_id → mills(id)
-- Description: Links atta requests to partner mills
-- ON DELETE SET NULL: If mill is deleted, request remains but mill reference cleared
ALTER TABLE atta_requests
    ADD CONSTRAINT fk_atta_requests_mill
    FOREIGN KEY (mill_id) REFERENCES mills(id)
    ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_atta_requests_mill ON atta_requests IS 
    'Links atta request to partner flour mill.';

-- Fix 4: atta_requests.address_id → addresses(id) with ON DELETE
-- Note: This FK already exists but needs ON DELETE CASCADE added
-- First drop existing constraint if it exists without proper ON DELETE
ALTER TABLE atta_requests
    DROP CONSTRAINT IF EXISTS atta_requests_address_id_fkey;

ALTER TABLE atta_requests
    ADD CONSTRAINT fk_atta_requests_address
    FOREIGN KEY (address_id) REFERENCES addresses(id)
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT fk_atta_requests_address ON atta_requests IS 
    'Links atta request to customer address. Address deletion removes request.';

-- Fix 5: rider_tasks.atta_request_id → atta_requests(id)
-- Description: Links rider tasks to atta requests for atta pickup/delivery tasks
-- ON DELETE CASCADE: If atta request is deleted, related tasks are removed
ALTER TABLE rider_tasks
    ADD CONSTRAINT fk_rider_tasks_atta_request
    FOREIGN KEY (atta_request_id) REFERENCES atta_requests(id)
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT fk_rider_tasks_atta_request ON rider_tasks IS 
    'Links rider task to atta request for pickup/delivery tasks.';

-- Fix 6: products.subcategory_id → categories(id)
-- Note: This FK already exists but needs explicit ON DELETE SET NULL
-- First drop existing constraint if it exists
ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_subcategory_id_fkey;

ALTER TABLE products
    ADD CONSTRAINT fk_products_subcategory
    FOREIGN KEY (subcategory_id) REFERENCES categories(id)
    ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_products_subcategory ON products IS 
    'Links product to subcategory. Category deletion removes subcategory reference.';

-- Fix 7: orders.whatsapp_order_id → whatsapp_orders(id)
-- Description: Links orders to their originating WhatsApp order
-- ON DELETE SET NULL: If WhatsApp order is deleted, order remains but reference cleared
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_whatsapp_order
    FOREIGN KEY (whatsapp_order_id) REFERENCES whatsapp_orders(id)
    ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_orders_whatsapp_order ON orders IS 
    'Links order to originating WhatsApp order for tracking.';

-- ============================================================================
-- MEDIUM PRIORITY: MISSING INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on products.barcode for quick product lookup by barcode
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
COMMENT ON INDEX idx_products_barcode IS 'Quick lookup by product barcode';

-- Index on atta_requests.address_id for address-based queries
CREATE INDEX IF NOT EXISTS idx_atta_address ON atta_requests(address_id);
COMMENT ON INDEX idx_atta_address IS 'Query atta requests by address';

-- Index on atta_requests.mill_id for mill-based queries
CREATE INDEX IF NOT EXISTS idx_atta_mill ON atta_requests(mill_id) WHERE mill_id IS NOT NULL;
COMMENT ON INDEX idx_atta_mill IS 'Query atta requests by mill';

-- Index on rider_tasks.atta_request_id for task lookups
CREATE INDEX IF NOT EXISTS idx_rider_tasks_atta ON rider_tasks(atta_request_id) WHERE atta_request_id IS NOT NULL;
COMMENT ON INDEX idx_rider_tasks_atta IS 'Query rider tasks by atta request';

-- Index on addresses.zone_id for zone-based address queries
CREATE INDEX IF NOT EXISTS idx_addresses_zone ON addresses(zone_id) WHERE zone_id IS NOT NULL;
COMMENT ON INDEX idx_addresses_zone IS 'Query addresses by delivery zone';

-- Index on riders.assigned_zone_id for zone-based rider queries
CREATE INDEX IF NOT EXISTS idx_riders_zone ON riders(assigned_zone_id) WHERE assigned_zone_id IS NOT NULL;
COMMENT ON INDEX idx_riders_zone IS 'Query riders by assigned zone';

-- Index on orders.address_id for order lookups by address
CREATE INDEX IF NOT EXISTS idx_orders_address ON orders(address_id);
COMMENT ON INDEX idx_orders_address IS 'Query orders by delivery address';

-- Index on payments.atta_request_id for payment lookups
CREATE INDEX IF NOT EXISTS idx_payments_atta ON payments(atta_request_id) WHERE atta_request_id IS NOT NULL;
COMMENT ON INDEX idx_payments_atta IS 'Query payments by atta request';

-- Composite index on orders for status + date range queries (common for dashboards)
CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, placed_at);
COMMENT ON INDEX idx_orders_status_date IS 'Dashboard queries by status and date range';

-- Index on products for low stock alerts
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON products(stock_quantity, low_stock_threshold) 
    WHERE stock_quantity <= low_stock_threshold;
COMMENT ON INDEX idx_products_low_stock IS 'Quick identification of low stock products';

-- ============================================================================
-- MEDIUM PRIORITY: CHECK CONSTRAINTS
-- ============================================================================

-- CHECK constraint for notifications: Ensure at least one recipient (user_id OR rider_id)
-- First, add a constraint that prevents notifications with no recipient
ALTER TABLE notifications
    ADD CONSTRAINT chk_notifications_recipient
    CHECK (
        (user_id IS NOT NULL) OR (rider_id IS NOT NULL)
    );

COMMENT ON CONSTRAINT chk_notifications_recipient ON notifications IS 
    'Ensures notification has at least one recipient (user or rider).';

-- CHECK constraint for payments: Ensure at least one related entity (order_id OR atta_request_id)
ALTER TABLE payments
    ADD CONSTRAINT chk_payment_entity
    CHECK (
        (order_id IS NOT NULL) OR (atta_request_id IS NOT NULL)
    );

COMMENT ON CONSTRAINT chk_payment_entity ON payments IS 
    'Ensures payment is linked to at least one entity (order or atta request).';

-- Unique constraint on time_slots to prevent duplicate time slots
-- A time slot is unique by its name, start_time, and end_time combination
ALTER TABLE time_slots
    ADD CONSTRAINT uq_time_slots_unique
    UNIQUE (slot_name, start_time, end_time);

COMMENT ON CONSTRAINT uq_time_slots_unique ON time_slots IS 
    'Prevents duplicate time slot definitions.';

-- ============================================================================
-- MEDIUM PRIORITY: STOCK DECREMENT TRIGGER ON ORDER CREATION
-- ============================================================================

-- Function to decrement product stock when order is created
CREATE OR REPLACE FUNCTION decrement_stock_on_order()
RETURNS TRIGGER AS $$
DECLARE
    v_item RECORD;
    v_current_stock INTEGER;
BEGIN
    -- Loop through all items in the new order
    FOR v_item IN 
        SELECT product_id, quantity 
        FROM order_items 
        WHERE order_id = NEW.id
    LOOP
        -- Get current stock
        SELECT stock_quantity INTO v_current_stock
        FROM products
        WHERE id = v_item.product_id;
        
        -- Check if sufficient stock
        IF v_current_stock < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Required: %', 
                v_item.product_id, v_current_stock, v_item.quantity;
        END IF;
        
        -- Decrement stock
        UPDATE products 
        SET 
            stock_quantity = stock_quantity - v_item.quantity,
            stock_status = CASE 
                WHEN (stock_quantity - v_item.quantity) <= 0 THEN 'out_of_stock'::product_status
                WHEN (stock_quantity - v_item.quantity) <= low_stock_threshold THEN 'active'::product_status
                ELSE stock_status
            END,
            updated_at = NOW()
        WHERE id = v_item.product_id;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION decrement_stock_on_order() IS 
    'Decrements product stock when an order is confirmed (status changed from pending to confirmed).';

-- Trigger to call stock decrement when order status changes to confirmed
CREATE TRIGGER trg_decrement_stock_on_confirm
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    WHEN (OLD.status = 'pending' AND NEW.status = 'confirmed')
    EXECUTE FUNCTION decrement_stock_on_order();

COMMENT ON TRIGGER trg_decrement_stock_on_confirm ON orders IS 
    'Triggers stock decrement when order is confirmed.';

-- ============================================================================
-- LOW PRIORITY: SEED DATA
-- ============================================================================

-- Seed data: Admin user (password should be changed immediately after setup)
-- Note: This creates a super admin user. In production, use proper password hashing.
INSERT INTO users (phone, email, full_name, password_hash, role, status, is_phone_verified, is_email_verified)
VALUES (
    '+923001234567', 
    'admin@freshbazar.pk', 
    'System Administrator',
    '$2b$10$YourHashedPasswordHere', -- Placeholder - replace with actual hash
    'super_admin',
    'active',
    TRUE,
    TRUE
)
ON CONFLICT (phone) DO NOTHING;

-- Create admin record for the user
INSERT INTO admins (user_id, admin_level, department, employee_id, permissions, is_active)
SELECT 
    id, 
    3, 
    'operations',
    'ADMIN-001',
    '{
        "users": {"read": true, "write": true, "delete": true},
        "orders": {"read": true, "write": true, "delete": true},
        "products": {"read": true, "write": true, "delete": true},
        "riders": {"read": true, "write": true, "delete": true},
        "reports": {"read": true, "write": true},
        "settings": {"read": true, "write": true}
    }'::jsonb,
    TRUE
FROM users 
WHERE phone = '+923001234567'
ON CONFLICT (employee_id) DO NOTHING;

COMMENT ON TABLE admins IS 
    'Admin users with role-based permissions. Default super admin created on setup.';

-- Seed data: Sample mills for Atta Chakki service
INSERT INTO mills (name, owner_name, phone, email, address, services_offered, milling_rate_per_kg, is_active, is_verified)
VALUES 
    (
        'Karachi Flour Mill',
        'Ahmed Khan',
        '+923211234567',
        'info@karachiflourmill.pk',
        'Plot 123, Industrial Area, Karachi',
        ARRAY['fine', 'medium', 'coarse'],
        5.00,
        TRUE,
        TRUE
    ),
    (
        'Al-Rehman Chakki',
        'Muhammad Rehman',
        '+923221234567',
        'alrehman.chakki@email.com',
        'Shop 45, Main Market, North Karachi',
        ARRAY['fine', 'medium'],
        4.50,
        TRUE,
        TRUE
    ),
    (
        'Madina Flour Mill',
        'Hassan Ali',
        '+923231234567',
        'madina.mill@email.com',
        'Block 7, Gulshan-e-Iqbal, Karachi',
        ARRAY['fine', 'medium', 'coarse'],
        5.50,
        TRUE,
        FALSE
    )
ON CONFLICT DO NOTHING;

COMMENT ON TABLE mills IS 
    'Partner flour mills for Atta Chakki service. Sample mills added on setup.';

-- ============================================================================
-- LOW PRIORITY: CART WEIGHT AUTO-UPDATE TRIGGER
-- ============================================================================

-- Function to update cart total weight when items change
CREATE OR REPLACE FUNCTION update_cart_weight()
RETURNS TRIGGER AS $$
DECLARE
    v_weight_multiplier DECIMAL(8,4);
    v_unit_type unit_type;
BEGIN
    -- Get unit type and calculate weight
    IF TG_OP = 'DELETE' THEN
        SELECT p.unit_type INTO v_unit_type
        FROM products p
        WHERE p.id = OLD.product_id;
        
        -- Calculate weight based on unit type
        v_weight_multiplier := CASE v_unit_type
            WHEN 'kg' THEN 1.0
            WHEN 'gram' THEN 0.001
            WHEN 'liter' THEN 1.0  -- Approximate
            WHEN 'ml' THEN 0.001
            ELSE 0.1  -- Default for piece, dozen, pack
        END;
        
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

COMMENT ON FUNCTION update_cart_weight() IS 
    'Updates cart total weight when items are added, updated, or removed.';

-- Trigger to update cart weight on item changes
CREATE TRIGGER trg_update_cart_weight
    AFTER INSERT OR UPDATE OR DELETE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_cart_weight();

COMMENT ON TRIGGER trg_update_cart_weight ON cart_items IS 
    'Automatically updates cart total weight when items change.';

-- ============================================================================
-- END OF SCHEMA FIXES
-- ============================================================================
