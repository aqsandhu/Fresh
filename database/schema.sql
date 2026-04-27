-- ============================================================================
-- PAKISTANI GROCERY DELIVERY PLATFORM - POSTGRESQL DATABASE SCHEMA
-- ============================================================================
-- Author: Database Architect
-- Description: Complete production-ready schema for Pakistani grocery delivery
-- Features: Smart delivery logic, Atta Chakki service, WhatsApp orders, Privacy controls
-- Version: 2.0 (With Schema Fixes Applied)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- For geolocation support

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- User types
CREATE TYPE user_role AS ENUM ('customer', 'rider', 'admin', 'super_admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');

-- Rider types
CREATE TYPE rider_status AS ENUM ('available', 'busy', 'offline', 'on_leave');
CREATE TYPE rider_verification_status AS ENUM ('pending', 'verified', 'rejected');

-- Product types
CREATE TYPE product_status AS ENUM ('active', 'inactive', 'out_of_stock', 'discontinued');
CREATE TYPE unit_type AS ENUM ('kg', 'gram', 'piece', 'dozen', 'liter', 'ml', 'pack');

-- Order types
CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'preparing', 'ready_for_pickup', 
    'out_for_delivery', 'delivered', 'cancelled', 'refunded'
);
CREATE TYPE order_source AS ENUM ('app', 'website', 'whatsapp', 'manual', 'phone');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE payment_method AS ENUM ('cash_on_delivery', 'card', 'easypaisa', 'jazzcash', 'bank_transfer');

-- Delivery types
CREATE TYPE delivery_type AS ENUM ('standard', 'express', 'scheduled');
CREATE TYPE delivery_charge_type AS ENUM ('free', 'flat', 'distance_based', 'weight_based');

-- Atta Chakki types
CREATE TYPE atta_request_status AS ENUM (
    'pending_pickup', 'picked_up', 'at_mill', 'milling', 
    'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'
);
CREATE TYPE wheat_quality AS ENUM ('desi', 'imported', 'mixed');
CREATE TYPE flour_type AS ENUM ('fine', 'medium', 'coarse');

-- Rider task types
CREATE TYPE task_type AS ENUM ('pickup', 'delivery', 'atta_pickup', 'atta_delivery');
CREATE TYPE task_status AS ENUM ('assigned', 'in_progress', 'completed', 'cancelled', 'failed');

-- Notification types
CREATE TYPE notification_type AS ENUM (
    'order_placed', 'order_confirmed', 'order_ready', 'out_for_delivery', 
    'delivered', 'cancelled', 'payment_received', 'rider_assigned',
    'call_request', 'promotion', 'system'
);

-- Time slot types
CREATE TYPE slot_status AS ENUM ('available', 'booked', 'blocked');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- ============================================================================
-- 1. USERS TABLE (Customers)
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),  -- Nullable for OTP-only users
    role user_role DEFAULT 'customer',
    status user_status DEFAULT 'active',
    
    -- Profile info
    avatar_url TEXT,
    date_of_birth DATE,
    gender VARCHAR(10),
    
    -- Verification
    is_phone_verified BOOLEAN DEFAULT FALSE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    phone_verified_at TIMESTAMPTZ,
    email_verified_at TIMESTAMPTZ,
    
    -- Preferences
    preferred_language VARCHAR(10) DEFAULT 'ur',
    notification_enabled BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    last_login_at TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    device_tokens TEXT[],  -- For push notifications
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID,
    updated_by UUID
);

COMMENT ON TABLE users IS 'Customer accounts with phone-based authentication';
COMMENT ON COLUMN users.phone IS 'Primary identifier - Pakistani phone number format';
COMMENT ON COLUMN users.device_tokens IS 'Array of FCM tokens for push notifications';

-- ============================================================================
-- 2. RIDERS TABLE
-- ============================================================================
CREATE TABLE riders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Rider info
    cnic VARCHAR(15) UNIQUE NOT NULL,  -- Pakistani CNIC format: 12345-1234567-8
    cnic_front_image TEXT NOT NULL,
    cnic_back_image TEXT NOT NULL,
    driving_license_number VARCHAR(50),
    license_image TEXT,
    
    -- Vehicle info
    vehicle_type VARCHAR(50) NOT NULL,  -- bike, car, van
    vehicle_number VARCHAR(20) NOT NULL,
    vehicle_image TEXT,
    
    -- Status
    status rider_status DEFAULT 'offline',
    verification_status rider_verification_status DEFAULT 'pending',
    
    -- Location tracking
    current_location GEOGRAPHY(POINT, 4326),
    location_updated_at TIMESTAMPTZ,
    
    -- Work area
    assigned_zone_id UUID,  -- Reference to delivery zones
    
    -- Performance
    rating DECIMAL(2,1) DEFAULT 5.0 CHECK (rating >= 1.0 AND rating <= 5.0),
    total_deliveries INTEGER DEFAULT 0,
    total_earnings DECIMAL(12,2) DEFAULT 0.00,
    
    -- Banking
    bank_account_title VARCHAR(255),
    bank_account_number VARCHAR(50),
    bank_name VARCHAR(100),
    
    -- Emergency contact
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
    -- FK riders.assigned_zone_id -> delivery_zones(id) is added later, after
    -- the delivery_zones table is created (forward references break psql).
);

COMMENT ON TABLE riders IS 'Delivery personnel with verification and tracking';
COMMENT ON COLUMN riders.cnic IS 'Pakistani Computerized National Identity Card';
COMMENT ON COLUMN riders.current_location IS 'Real-time GPS coordinates using PostGIS';
-- COMMENT ON CONSTRAINT fk_riders_assigned_zone is set later, after the
-- constraint is added via ALTER TABLE (delivery_zones is defined further
-- down the file).

-- ============================================================================
-- 3. ADMINS TABLE
-- ============================================================================
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Admin details
    admin_level INTEGER DEFAULT 1,  -- 1: Basic, 2: Manager, 3: Super Admin
    department VARCHAR(100),  -- operations, customer_service, finance
    employee_id VARCHAR(50) UNIQUE,
    
    -- Permissions (JSON for flexibility)
    permissions JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_active_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE admins IS 'Admin users with role-based permissions';
COMMENT ON COLUMN admins.permissions IS 'JSON object with granular permissions';

-- ============================================================================
-- 4. CATEGORIES TABLE
-- ============================================================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Category info
    name_ur VARCHAR(255) NOT NULL,  -- Urdu name
    name_en VARCHAR(255) NOT NULL,  -- English name
    slug VARCHAR(255) UNIQUE NOT NULL,
    
    -- Media
    icon_url TEXT,
    image_url TEXT,
    
    -- Hierarchy
    parent_id UUID REFERENCES categories(id),
    level INTEGER DEFAULT 1,
    
    -- Display
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    
    -- Delivery config (for smart delivery logic)
    qualifies_for_free_delivery BOOLEAN DEFAULT TRUE,
    minimum_order_for_free_delivery DECIMAL(10,2) DEFAULT 500.00,
    
    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE categories IS 'Product categories with bilingual support';
COMMENT ON COLUMN categories.qualifies_for_free_delivery IS 'Used for smart delivery logic';

-- ============================================================================
-- 5. PRODUCTS TABLE
-- ============================================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Product info
    name_ur VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),
    
    -- Categorization
    category_id UUID NOT NULL REFERENCES categories(id),
    subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    
    -- Pricing
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    compare_at_price DECIMAL(10,2),  -- Original price for discounts
    cost_price DECIMAL(10,2),  -- For profit calculations
    
    -- Unit
    unit_type unit_type DEFAULT 'kg',
    unit_value DECIMAL(10,3) DEFAULT 1.000,  -- e.g., 1 kg, 500 gram
    
    -- Inventory
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    stock_status product_status DEFAULT 'active',
    track_inventory BOOLEAN DEFAULT TRUE,
    
    -- Media
    primary_image TEXT,
    images TEXT[],  -- Array of image URLs
    
    -- Description
    description_ur TEXT,
    description_en TEXT,
    short_description VARCHAR(500),
    
    -- Attributes (flexible storage)
    attributes JSONB DEFAULT '{}',
    
    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,
    tags TEXT[],
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    is_new_arrival BOOLEAN DEFAULT FALSE,
    
    -- Analytics
    view_count INTEGER DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE products IS 'Product catalog with bilingual support and inventory tracking';
COMMENT ON COLUMN products.attributes IS 'Flexible JSON for product-specific attributes';

-- ============================================================================
-- 6. ADDRESSES TABLE
-- ============================================================================
CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Address details
    address_type VARCHAR(50) DEFAULT 'home',  -- home, work, other
    house_number VARCHAR(50),  -- Assigned by admin on first order
    
    -- Location
    written_address TEXT NOT NULL,  -- Full written address
    landmark VARCHAR(255),  -- Nearby landmark
    
    -- Google Maps integration
    location GEOGRAPHY(POINT, 4326) NOT NULL,  -- Lat/Lng
    location_accuracy DECIMAL(5,2),  -- GPS accuracy in meters
    google_place_id VARCHAR(255),
    
    -- Door picture (required)
    door_picture_url TEXT NOT NULL,
    
    -- Area info
    area_name VARCHAR(255),
    city VARCHAR(100) DEFAULT 'Gujrat',
    province VARCHAR(100) DEFAULT 'Punjab',
    postal_code VARCHAR(20),

    -- Delivery zone (FK added later, after delivery_zones is created)
    zone_id UUID,
    
    -- Flags
    is_default BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    
    -- Delivery instructions
    delivery_instructions TEXT,
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE addresses IS 'Customer addresses with GPS location and door pictures';
COMMENT ON COLUMN addresses.house_number IS 'Assigned by admin on first order, editable later';
COMMENT ON COLUMN addresses.door_picture_url IS 'Required photo of customer door for easy identification';
COMMENT ON COLUMN addresses.zone_id IS 'Links address to delivery zone for zone-based delivery operations';

-- ============================================================================
-- 7. CARTS TABLE
-- ============================================================================
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Cart status
    status VARCHAR(50) DEFAULT 'active',  -- active, converted, abandoned
    
    -- Pricing (calculated)
    subtotal DECIMAL(10,2) DEFAULT 0.00,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    
    -- Applied promotions
    coupon_code VARCHAR(50),
    coupon_discount DECIMAL(10,2) DEFAULT 0.00,
    
    -- Metadata
    item_count INTEGER DEFAULT 0,
    total_weight_kg DECIMAL(8,2) DEFAULT 0.00,
    
    -- Session tracking
    session_id VARCHAR(255),
    device_info JSONB,
    
    -- Expiry
    expires_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    converted_to_order_id UUID  -- Reference when cart becomes order
);

COMMENT ON TABLE carts IS 'Shopping carts with calculated pricing';
COMMENT ON COLUMN carts.total_weight_kg IS 'Auto-calculated total weight of cart items';

-- ============================================================================
-- 8. CART_ITEMS TABLE
-- ============================================================================
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    
    -- Quantity
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    
    -- Calculated
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    weight_kg DECIMAL(8,3),
    
    -- Notes
    special_instructions TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(cart_id, product_id)
);

COMMENT ON TABLE cart_items IS 'Individual items in a shopping cart';

-- ============================================================================
-- 9. DELIVERY_CHARGES_CONFIG TABLE (Smart Delivery Logic)
-- ============================================================================
CREATE TABLE delivery_charges_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Rule identification
    rule_name VARCHAR(255) NOT NULL,
    rule_code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    
    -- Rule conditions
    condition_type VARCHAR(50) NOT NULL,  -- category_based, time_based, order_value, mixed
    applicable_categories UUID[],  -- NULL means all categories
    excluded_categories UUID[],  -- Categories that don't qualify
    
    -- Time-based conditions
    start_time TIME,
    end_time TIME,
    applicable_days INTEGER[],  -- 0=Sunday, 6=Saturday
    
    -- Order value conditions
    minimum_order_value DECIMAL(10,2),
    maximum_order_value DECIMAL(10,2),
    
    -- Charge calculation
    charge_type delivery_charge_type DEFAULT 'flat',
    charge_amount DECIMAL(10,2) DEFAULT 0.00,
    
    -- Special slots
    is_free_delivery_slot BOOLEAN DEFAULT FALSE,
    order_before_time TIME,  -- For "order before 10AM" rule
    delivery_slot_id UUID,  -- Reference to time_slots
    
    -- Priority (higher number = checked first)
    priority INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    valid_from DATE,
    valid_until DATE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE delivery_charges_config IS 'Configurable rules for smart delivery pricing';
COMMENT ON COLUMN delivery_charges_config.order_before_time IS 'Cutoff time for same-day delivery slots';

-- ============================================================================
-- 10. TIME_SLOTS TABLE
-- ============================================================================
CREATE TABLE time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Slot details
    slot_name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    
    -- Capacity
    max_orders INTEGER DEFAULT 50,
    booked_orders INTEGER DEFAULT 0,
    
    -- Status
    status slot_status DEFAULT 'available',
    
    -- Special flags
    is_free_delivery_slot BOOLEAN DEFAULT FALSE,
    is_express_slot BOOLEAN DEFAULT FALSE,
    
    -- Applicability
    applicable_days INTEGER[],  -- NULL means all days
    zone_ids UUID[],  -- NULL means all zones
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- UNIQUE CONSTRAINT FIX: Prevent duplicate time slots
    CONSTRAINT uq_time_slots_unique UNIQUE (slot_name, start_time, end_time)
);

COMMENT ON TABLE time_slots IS 'Delivery time slots with capacity management';
COMMENT ON CONSTRAINT uq_time_slots_unique ON time_slots IS 'Prevents duplicate time slot definitions';

-- ============================================================================
-- 11. ORDERS TABLE
-- ============================================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Order identification
    order_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Customer info
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Source
    source order_source DEFAULT 'app',
    
    -- Address (snapshot at order time)
    address_id UUID NOT NULL REFERENCES addresses(id),
    delivery_address_snapshot JSONB NOT NULL,  -- Full address copy
    
    -- Time slot
    time_slot_id UUID REFERENCES time_slots(id),
    requested_delivery_date DATE,
    
    -- Pricing
    subtotal DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Applied delivery rule
    delivery_charge_rule_id UUID REFERENCES delivery_charges_config(id),
    
    -- Payment
    payment_method payment_method DEFAULT 'cash_on_delivery',
    payment_status payment_status DEFAULT 'pending',
    paid_amount DECIMAL(10,2) DEFAULT 0.00,
    
    -- Status
    status order_status DEFAULT 'pending',
    
    -- Rider assignment
    rider_id UUID REFERENCES riders(id),
    assigned_at TIMESTAMPTZ,
    
    -- Timestamps
    placed_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    preparing_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    out_for_delivery_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    
    -- Cancellation
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    
    -- Delivery
    delivered_by UUID REFERENCES riders(id),
    delivery_proof_image TEXT,
    customer_signature TEXT,
    
    -- Notes
    customer_notes TEXT,
    admin_notes TEXT,
    
    -- WhatsApp order reference (FK added later — whatsapp_orders is defined further down)
    whatsapp_order_id UUID,
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE orders IS 'Customer orders with full lifecycle tracking';
COMMENT ON COLUMN orders.delivery_address_snapshot IS 'Snapshot of address at order time for historical accuracy';
COMMENT ON COLUMN orders.whatsapp_order_id IS 'Links order to originating WhatsApp order for tracking';

-- ============================================================================
-- 12. ORDER_ITEMS TABLE
-- ============================================================================
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    
    -- Product snapshot
    product_name VARCHAR(255) NOT NULL,
    product_image TEXT,
    product_sku VARCHAR(100),
    
    -- Pricing
    unit_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_price DECIMAL(10,2) NOT NULL,
    
    -- Weight tracking
    weight_kg DECIMAL(8,3),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',  -- pending, packed, delivered, returned
    
    -- Special instructions
    special_instructions TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_items IS 'Individual items in an order';

-- ============================================================================
-- 13. RIDER_TASKS TABLE
-- ============================================================================
CREATE TABLE rider_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Assignment
    rider_id UUID NOT NULL REFERENCES riders(id),
    
    -- Task details
    task_type task_type NOT NULL,
    status task_status DEFAULT 'assigned',
    
    -- Related entities (atta_requests FK added later — defined further down)
    order_id UUID REFERENCES orders(id),
    atta_request_id UUID,
    
    -- Location
    pickup_location GEOGRAPHY(POINT, 4326),
    delivery_location GEOGRAPHY(POINT, 4326),
    
    -- Addresses
    pickup_address TEXT,
    delivery_address TEXT,
    
    -- Timing
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_duration INTEGER,  -- in minutes
    
    -- Sequence in batch
    sequence_number INTEGER DEFAULT 1,
    batch_id UUID,  -- For grouping multiple tasks
    
    -- Proof
    pickup_proof_image TEXT,
    delivery_proof_image TEXT,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE rider_tasks IS 'Individual pickup/delivery tasks assigned to riders';
COMMENT ON COLUMN rider_tasks.batch_id IS 'Groups multiple tasks assigned together';
COMMENT ON COLUMN rider_tasks.atta_request_id IS 'Links rider task to atta request for pickup/delivery tasks';

-- ============================================================================
-- 14. ATTA_REQUESTS TABLE (Atta Chakki Service)
-- ============================================================================
CREATE TABLE atta_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Customer
    user_id UUID NOT NULL REFERENCES users(id),
    address_id UUID NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
    
    -- Wheat details
    wheat_quality wheat_quality DEFAULT 'desi',
    wheat_quantity_kg DECIMAL(8,2) NOT NULL,
    wheat_description TEXT,
    
    -- Flour preferences
    flour_type flour_type DEFAULT 'fine',
    flour_quantity_expected_kg DECIMAL(8,2),
    special_instructions TEXT,
    
    -- Mill info (FK added later — mills is defined further down)
    mill_id UUID,
    mill_name VARCHAR(255),
    
    -- Status workflow
    status atta_request_status DEFAULT 'pending_pickup',
    
    -- Pickup
    pickup_scheduled_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    pickup_proof_image TEXT,
    
    -- Milling
    milling_started_at TIMESTAMPTZ,
    milling_completed_at TIMESTAMPTZ,
    actual_flour_quantity_kg DECIMAL(8,2),
    
    -- Delivery
    delivery_scheduled_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    delivery_proof_image TEXT,
    
    -- Rider assignments
    pickup_rider_id UUID REFERENCES riders(id),
    delivery_rider_id UUID REFERENCES riders(id),
    
    -- Pricing
    service_charge DECIMAL(10,2) DEFAULT 0.00,
    milling_charge DECIMAL(10,2) DEFAULT 0.00,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    
    -- Payment
    payment_status payment_status DEFAULT 'pending',
    payment_method payment_method DEFAULT 'cash_on_delivery',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE atta_requests IS 'Atta Chakki (flour mill) service requests';
COMMENT ON COLUMN atta_requests.wheat_quality IS 'Type of wheat: desi (local), imported, or mixed';
COMMENT ON COLUMN atta_requests.mill_id IS 'Links atta request to partner flour mill';
COMMENT ON COLUMN atta_requests.address_id IS 'Links atta request to customer address. Address deletion removes request.';

-- ============================================================================
-- 15. WHATSAPP_ORDERS TABLE (Manual Entry)
-- ============================================================================
CREATE TABLE whatsapp_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source info
    whatsapp_number VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    
    -- Order details (entered by admin)
    items JSONB NOT NULL,  -- Array of {product_id, quantity, notes}
    
    -- Pricing
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Address
    address_text TEXT,
    location GEOGRAPHY(POINT, 4326),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',  -- pending, confirmed, converted, cancelled
    
    -- Conversion
    converted_to_order_id UUID REFERENCES orders(id),
    converted_by UUID REFERENCES users(id),
    converted_at TIMESTAMPTZ,
    
    -- Admin who entered
    entered_by UUID NOT NULL REFERENCES users(id),
    
    -- Notes
    admin_notes TEXT,
    customer_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE whatsapp_orders IS 'Orders received via WhatsApp, manually entered by admin';
COMMENT ON COLUMN whatsapp_orders.items IS 'JSON array of order items before conversion';

-- ============================================================================
-- 16. PAYMENTS TABLE
-- ============================================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Related entity
    order_id UUID REFERENCES orders(id),
    atta_request_id UUID REFERENCES atta_requests(id),
    
    -- Payment details
    payment_method payment_method NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'PKR',
    
    -- Status
    status payment_status DEFAULT 'pending',
    
    -- Transaction details
    transaction_id VARCHAR(255),
    gateway_response JSONB,
    
    -- Refund info
    refunded_amount DECIMAL(10,2) DEFAULT 0.00,
    refund_reason TEXT,
    refunded_at TIMESTAMPTZ,
    refunded_by UUID REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    -- CHECK CONSTRAINT FIX: Ensure at least one related entity
    CONSTRAINT chk_payment_entity CHECK (
        (order_id IS NOT NULL) OR (atta_request_id IS NOT NULL)
    )
);

COMMENT ON TABLE payments IS 'Payment records for orders and services';
COMMENT ON CONSTRAINT chk_payment_entity ON payments IS 
    'Ensures payment is linked to at least one entity (order or atta request).';

-- ============================================================================
-- 17. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Recipient
    user_id UUID REFERENCES users(id),
    rider_id UUID REFERENCES riders(id),
    
    -- Notification details
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    -- Related entity
    order_id UUID REFERENCES orders(id),
    atta_request_id UUID REFERENCES atta_requests(id),
    
    -- Deep link
    action_url TEXT,
    action_type VARCHAR(50),
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    
    -- Delivery tracking
    sent_via VARCHAR(50)[],  -- push, sms, email
    delivered_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- CHECK CONSTRAINT FIX: Ensure at least one recipient
    CONSTRAINT chk_notifications_recipient CHECK (
        (user_id IS NOT NULL) OR (rider_id IS NOT NULL)
    )
);

COMMENT ON TABLE notifications IS 'User and rider notifications with multi-channel delivery';
COMMENT ON CONSTRAINT chk_notifications_recipient ON notifications IS 
    'Ensures notification has at least one recipient (user or rider).';

-- ============================================================================
-- 18. CALL_REQUESTS TABLE (Privacy - Rider calls customer)
-- ============================================================================
CREATE TABLE call_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Participants
    rider_id UUID NOT NULL REFERENCES riders(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    
    -- Call details (rider never sees actual phone number)
    virtual_number VARCHAR(20),  -- Masked number for call
    
    -- Status
    status VARCHAR(50) DEFAULT 'requested',  -- requested, connected, completed, failed
    
    -- Timestamps
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE call_requests IS 'Privacy-protected call requests between riders and customers';
COMMENT ON COLUMN call_requests.virtual_number IS 'Masked phone number - rider never sees real customer phone';

-- ============================================================================
-- 19. DELIVERY_ZONES TABLE
-- ============================================================================
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Zone info
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    
    -- Geographic boundary (PostGIS polygon)
    boundary GEOGRAPHY(POLYGON, 4326),
    
    -- Coverage
    cities TEXT[],
    areas TEXT[],
    postal_codes TEXT[],
    
    -- Delivery settings
    standard_delivery_charge DECIMAL(10,2) DEFAULT 100.00,
    express_delivery_charge DECIMAL(10,2) DEFAULT 200.00,
    minimum_order_value DECIMAL(10,2) DEFAULT 500.00,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE delivery_zones IS 'Geographic delivery zones with boundaries';

-- Forward-declared FKs touching delivery_zones / whatsapp_orders / mills /
-- atta_requests are wired up later, after EVERY referenced table exists.
-- See the "Forward-declared foreign keys" block below the mills table.

-- ============================================================================
-- 19b. SERVICE CITIES TABLE
-- ----------------------------------------------------------------------------
-- Cities where the platform operates. Editable from the admin panel
-- (Service Cities page → POST /api/admin/cities). Customers / website read
-- the active list via the public endpoint GET /api/site-settings/cities.
-- Decoupled from delivery_zones so the city list can be expanded without
-- touching geographic zone polygons.
-- ============================================================================
CREATE TABLE service_cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_service_cities_name UNIQUE (name)
);

CREATE INDEX idx_service_cities_active ON service_cities(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE service_cities IS 'Cities where delivery is offered. Managed by admins.';

-- ============================================================================
-- 20. MILLS TABLE (Partner mills for Atta Chakki)
-- ============================================================================
CREATE TABLE mills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Mill info
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    
    -- Location
    address TEXT,
    location GEOGRAPHY(POINT, 4326),
    
    -- Services
    services_offered TEXT[],  -- fine, medium, coarse
    milling_rate_per_kg DECIMAL(8,2) DEFAULT 5.00,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE mills IS 'Partner flour mills for Atta Chakki service';

-- ============================================================================
-- FORWARD-DECLARED FOREIGN KEYS
-- ----------------------------------------------------------------------------
-- These FKs reference tables that are defined later than the source table
-- (or that form a cycle). The columns themselves are declared as plain UUID
-- on the source tables; the FKs are added here, after every referenced
-- table exists. Same ON DELETE semantics they had as inline FKs originally.
-- ============================================================================
ALTER TABLE riders
    ADD CONSTRAINT fk_riders_assigned_zone
    FOREIGN KEY (assigned_zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL;

ALTER TABLE addresses
    ADD CONSTRAINT fk_addresses_zone
    FOREIGN KEY (zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL;

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_whatsapp_order
    FOREIGN KEY (whatsapp_order_id) REFERENCES whatsapp_orders(id) ON DELETE SET NULL;

ALTER TABLE rider_tasks
    ADD CONSTRAINT fk_rider_tasks_atta_request
    FOREIGN KEY (atta_request_id) REFERENCES atta_requests(id) ON DELETE CASCADE;

ALTER TABLE atta_requests
    ADD CONSTRAINT fk_atta_requests_mill
    FOREIGN KEY (mill_id) REFERENCES mills(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_riders_assigned_zone ON riders IS
    'Links rider to their assigned delivery zone. Zone deletion unassigns rider.';

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Users indexes
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Riders indexes
CREATE INDEX idx_riders_user_id ON riders(user_id);
CREATE INDEX idx_riders_status ON riders(status);
CREATE INDEX idx_riders_location ON riders USING GIST(current_location) WHERE current_location IS NOT NULL;
CREATE INDEX idx_riders_zone ON riders(assigned_zone_id) WHERE assigned_zone_id IS NOT NULL;

-- Categories indexes
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_active ON categories(is_active);
CREATE INDEX idx_categories_slug ON categories(slug);

-- Products indexes
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_subcategory ON products(subcategory_id) WHERE subcategory_id IS NOT NULL;
CREATE INDEX idx_products_status ON products(stock_status);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_low_stock ON products(stock_quantity, low_stock_threshold) 
    WHERE stock_quantity <= low_stock_threshold;

-- Full-text search on products
CREATE INDEX idx_products_search ON products 
    USING gin(to_tsvector('english', COALESCE(name_en, '') || ' ' || COALESCE(description_en, '')));

-- Addresses indexes
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_location ON addresses USING GIST(location);
CREATE INDEX idx_addresses_default ON addresses(user_id, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_addresses_house ON addresses(house_number) WHERE house_number IS NOT NULL;
CREATE INDEX idx_addresses_zone ON addresses(zone_id) WHERE zone_id IS NOT NULL;

-- Carts indexes
CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_status ON carts(status);
CREATE INDEX idx_carts_expires ON carts(expires_at) WHERE expires_at IS NOT NULL;

-- Cart items indexes
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product ON cart_items(product_id);

-- Orders indexes
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_rider ON orders(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX idx_orders_placed ON orders(placed_at);
CREATE INDEX idx_orders_delivery_date ON orders(requested_delivery_date);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_source ON orders(source);
CREATE INDEX idx_orders_whatsapp ON orders(whatsapp_order_id) WHERE whatsapp_order_id IS NOT NULL;
CREATE INDEX idx_orders_address ON orders(address_id);
CREATE INDEX idx_orders_status_date ON orders(status, placed_at);

-- Order items indexes
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Delivery charges config indexes
CREATE INDEX idx_delivery_config_active ON delivery_charges_config(is_active);
CREATE INDEX idx_delivery_config_priority ON delivery_charges_config(priority DESC);

-- Time slots indexes
CREATE INDEX idx_time_slots_time ON time_slots(start_time, end_time);
CREATE INDEX idx_time_slots_status ON time_slots(status);

-- Rider tasks indexes
CREATE INDEX idx_rider_tasks_rider ON rider_tasks(rider_id);
CREATE INDEX idx_rider_tasks_order ON rider_tasks(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_rider_tasks_status ON rider_tasks(status);
CREATE INDEX idx_rider_tasks_batch ON rider_tasks(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_rider_tasks_atta ON rider_tasks(atta_request_id) WHERE atta_request_id IS NOT NULL;

-- Atta requests indexes
CREATE INDEX idx_atta_user ON atta_requests(user_id);
CREATE INDEX idx_atta_status ON atta_requests(status);
CREATE INDEX idx_atta_request_number ON atta_requests(request_number);
CREATE INDEX idx_atta_pickup_rider ON atta_requests(pickup_rider_id) WHERE pickup_rider_id IS NOT NULL;
CREATE INDEX idx_atta_delivery_rider ON atta_requests(delivery_rider_id) WHERE delivery_rider_id IS NOT NULL;
CREATE INDEX idx_atta_address ON atta_requests(address_id);
CREATE INDEX idx_atta_mill ON atta_requests(mill_id) WHERE mill_id IS NOT NULL;

-- WhatsApp orders indexes
CREATE INDEX idx_whatsapp_number ON whatsapp_orders(whatsapp_number);
CREATE INDEX idx_whatsapp_status ON whatsapp_orders(status);
CREATE INDEX idx_whatsapp_entered_by ON whatsapp_orders(entered_by);

-- Payments indexes
CREATE INDEX idx_payments_order ON payments(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_payments_atta ON payments(atta_request_id) WHERE atta_request_id IS NOT NULL;
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_transaction ON payments(transaction_id) WHERE transaction_id IS NOT NULL;

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_notifications_rider ON notifications(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(type);

-- Call requests indexes
CREATE INDEX idx_call_requests_rider ON call_requests(rider_id);
CREATE INDEX idx_call_requests_order ON call_requests(order_id);

-- Delivery zones indexes
CREATE INDEX idx_zones_boundary ON delivery_zones USING GIST(boundary);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_riders_updated_at BEFORE UPDATE ON riders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_carts_updated_at BEFORE UPDATE ON carts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON cart_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_config_updated_at BEFORE UPDATE ON delivery_charges_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_slots_updated_at BEFORE UPDATE ON time_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rider_tasks_updated_at BEFORE UPDATE ON rider_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_atta_requests_updated_at BEFORE UPDATE ON atta_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_orders_updated_at BEFORE UPDATE ON whatsapp_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                        LPAD(NEXTVAL('order_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sequence for order numbers
CREATE SEQUENCE order_number_seq START 1;

CREATE TRIGGER set_order_number BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- Function to generate atta request number
CREATE OR REPLACE FUNCTION generate_atta_request_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.request_number := 'ATTA-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                          LPAD(NEXTVAL('atta_request_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE atta_request_seq START 1;

CREATE TRIGGER set_atta_request_number BEFORE INSERT ON atta_requests
    FOR EACH ROW EXECUTE FUNCTION generate_atta_request_number();

-- Function to update cart totals when items change
CREATE OR REPLACE FUNCTION update_cart_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE carts 
        SET subtotal = (
            SELECT COALESCE(SUM(total_price), 0) 
            FROM cart_items 
            WHERE cart_id = OLD.cart_id
        ),
        item_count = (
            SELECT COALESCE(SUM(quantity), 0) 
            FROM cart_items 
            WHERE cart_id = OLD.cart_id
        ),
        updated_at = NOW()
        WHERE id = OLD.cart_id;
        RETURN OLD;
    ELSE
        UPDATE carts 
        SET subtotal = (
            SELECT COALESCE(SUM(total_price), 0) 
            FROM cart_items 
            WHERE cart_id = NEW.cart_id
        ),
        item_count = (
            SELECT COALESCE(SUM(quantity), 0) 
            FROM cart_items 
            WHERE cart_id = NEW.cart_id
        ),
        updated_at = NOW()
        WHERE id = NEW.cart_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cart_on_item_change
    AFTER INSERT OR UPDATE OR DELETE ON cart_items
    FOR EACH ROW EXECUTE FUNCTION update_cart_totals();

-- Function to set default address
CREATE OR REPLACE FUNCTION set_default_address()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE addresses 
        SET is_default = FALSE 
        WHERE user_id = NEW.user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_default_address
    BEFORE INSERT OR UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION set_default_address();

-- ============================================================================
-- NEW TRIGGERS (Schema Fixes)
-- ============================================================================

-- Function to decrement product stock when order is confirmed
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

CREATE TRIGGER trg_decrement_stock_on_confirm
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    WHEN (OLD.status = 'pending' AND NEW.status = 'confirmed')
    EXECUTE FUNCTION decrement_stock_on_order();

COMMENT ON TRIGGER trg_decrement_stock_on_confirm ON orders IS 
    'Triggers stock decrement when order is confirmed.';

-- Function to update cart total weight when items change
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

CREATE TRIGGER trg_update_cart_weight
    AFTER INSERT OR UPDATE OR DELETE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_cart_weight();

COMMENT ON TRIGGER trg_update_cart_weight ON cart_items IS 
    'Automatically updates cart total weight when items change.';

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Categories (Pakistani grocery categories)
INSERT INTO categories (name_ur, name_en, slug, icon_url, display_order, qualifies_for_free_delivery, minimum_order_for_free_delivery) VALUES
('سبزیاں', 'Vegetables', 'vegetables', 'https://cdn.example.com/icons/vegetables.png', 1, TRUE, 500.00),
('پھل', 'Fruits', 'fruits', 'https://cdn.example.com/icons/fruits.png', 2, TRUE, 500.00),
('خشک میوہ', 'Dry Fruits', 'dry-fruits', 'https://cdn.example.com/icons/dry-fruits.png', 3, TRUE, 1000.00),
('چکن', 'Chicken', 'chicken', 'https://cdn.example.com/icons/chicken.png', 4, FALSE, NULL),
('گوشت', 'Meat', 'meat', 'https://cdn.example.com/icons/meat.png', 5, FALSE, NULL),
('دودھ اور ڈیری', 'Dairy', 'dairy', 'https://cdn.example.com/icons/dairy.png', 6, TRUE, 500.00),
('گروسری', 'Grocery', 'grocery', 'https://cdn.example.com/icons/grocery.png', 7, TRUE, 500.00),
('مشروبات', 'Beverages', 'beverages', 'https://cdn.example.com/icons/beverages.png', 8, TRUE, 500.00),
('اسنیکس', 'Snacks', 'snacks', 'https://cdn.example.com/icons/snacks.png', 9, TRUE, 500.00),
('گھریلو سامان', 'Household', 'household', 'https://cdn.example.com/icons/household.png', 10, TRUE, 500.00);

-- Time slots
INSERT INTO time_slots (slot_name, start_time, end_time, max_orders, is_free_delivery_slot, applicable_days) VALUES
('Morning (10AM - 12PM)', '10:00', '12:00', 30, TRUE, ARRAY[0,1,2,3,4,5,6]),
('Afternoon (12PM - 2PM)', '12:00', '14:00', 30, TRUE, ARRAY[0,1,2,3,4,5,6]),
('Evening (2PM - 4PM)', '14:00', '16:00', 40, FALSE, ARRAY[0,1,2,3,4,5,6]),
('Evening (4PM - 6PM)', '16:00', '18:00', 40, FALSE, ARRAY[0,1,2,3,4,5,6]),
('Night (6PM - 8PM)', '18:00', '20:00', 50, FALSE, ARRAY[0,1,2,3,4,5,6]),
('Night (8PM - 10PM)', '20:00', '22:00', 50, FALSE, ARRAY[0,1,2,3,4,5,6]);

-- Delivery charges configuration (Smart Delivery Logic)
INSERT INTO delivery_charges_config (
    rule_name, rule_code, description, condition_type, 
    applicable_categories, minimum_order_value,
    charge_type, charge_amount, is_free_delivery_slot,
    start_time, end_time, priority, is_active
) VALUES
(
    'Free Delivery - Morning Slot (Order before 10AM)',
    'FREE_MORNING_SLOT',
    'Free delivery for orders placed before 10AM for 10AM-2PM delivery slot',
    'time_based',
    NULL,  -- All categories
    0,     -- No minimum
    'free',
    0.00,
    TRUE,
    '10:00',
    '14:00',
    100,   -- Highest priority
    TRUE
),
(
    'Free Delivery - Vegetables/Fruits/Dry Fruits (Above Minimum)',
    'FREE_VEG_FRUIT_MIN',
    'Free delivery for vegetable/fruit/dry fruit orders above minimum value',
    'category_based',
    (SELECT ARRAY_AGG(id) FROM categories WHERE slug IN ('vegetables', 'fruits', 'dry-fruits')),
    500.00,
    'free',
    0.00,
    FALSE,
    NULL,
    NULL,
    90,
    TRUE
),
(
    'Paid Delivery - Chicken Only Orders',
    'PAID_CHICKEN_ONLY',
    'Always paid delivery for chicken-only orders',
    'category_based',
    (SELECT ARRAY_AGG(id) FROM categories WHERE slug = 'chicken'),
    0,
    'flat',
    100.00,
    FALSE,
    NULL,
    NULL,
    80,
    TRUE
),
(
    'Standard Delivery Charge',
    'STANDARD_DELIVERY',
    'Default delivery charge for all other orders',
    'mixed',
    NULL,
    0,
    'flat',
    100.00,
    FALSE,
    NULL,
    NULL,
    10,   -- Lowest priority
    TRUE
);

-- Sample products (for reference)
INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 
    'آلو', 'Potato', 'potato', c.id, 80.00, 'kg', 1.000, 100,
    'https://cdn.example.com/products/potato.jpg',
    'Fresh farm potatoes, perfect for curries and fries'
FROM categories c WHERE c.slug = 'vegetables';

INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 
    'ٹماٹر', 'Tomato', 'tomato', c.id, 120.00, 'kg', 1.000, 80,
    'https://cdn.example.com/products/tomato.jpg',
    'Fresh red tomatoes for salads and cooking'
FROM categories c WHERE c.slug = 'vegetables';

INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 
    'سیب', 'Apple', 'apple', c.id, 250.00, 'kg', 1.000, 50,
    'https://cdn.example.com/products/apple.jpg',
    'Fresh imported apples, crisp and sweet'
FROM categories c WHERE c.slug = 'fruits';

INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 
    'بادام', 'Almonds', 'almonds', c.id, 1200.00, 'kg', 0.500, 30,
    'https://cdn.example.com/products/almonds.jpg',
    'Premium quality almonds'
FROM categories c WHERE c.slug = 'dry-fruits';

INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 
    'چکن بریسٹ', 'Chicken Breast', 'chicken-breast', c.id, 450.00, 'kg', 1.000, 40,
    'https://cdn.example.com/products/chicken-breast.jpg',
    'Fresh chicken breast, boneless'
FROM categories c WHERE c.slug = 'chicken';

-- Initial service city (more can be added later from the admin panel).
INSERT INTO service_cities (name, province, is_active) VALUES
('Gujrat', 'Punjab', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Delivery zones for Gujrat. Add more zones as you expand into other cities.
INSERT INTO delivery_zones (name, code, cities, areas, standard_delivery_charge, minimum_order_value) VALUES
('Gujrat City',     'GJ-01', ARRAY['Gujrat'], ARRAY['Gujrat City', 'Civil Lines', 'Model Town'],          100.00, 500.00),
('Kachehri Chowk',  'GJ-02', ARRAY['Gujrat'], ARRAY['Kachehri Chowk', 'Rehman Shaheed Road', 'GT Road'],  100.00, 500.00),
('Small Industries','GJ-03', ARRAY['Gujrat'], ARRAY['Small Industries', 'Jalalpur Jattan Road'],          120.00, 500.00),
('Servis Chowk',    'GJ-04', ARRAY['Gujrat'], ARRAY['Servis Chowk', 'Bhimber Road'],                     120.00, 500.00);

-- ============================================================================
-- ADMIN USER BOOTSTRAP
-- ----------------------------------------------------------------------------
-- The admin user is NOT seeded from SQL — embedding a password hash here is a
-- security risk and using a placeholder produces a broken login.
--
-- Instead, the backend bootstraps the super-admin at startup (or via
-- `npm run create-admin`) using the ADMIN_PHONE and ADMIN_PASSWORD env vars.
-- See backend/src/scripts/bootstrapAdmin.ts.
-- ============================================================================

-- ============================================================================
-- SEED DATA: Mills for Atta Chakki Service (Schema Fixes Addition)
-- ============================================================================
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

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active products with category info
-- (products has no soft-delete column; is_active is the only liveness flag)
CREATE VIEW active_products_view AS
SELECT
    p.id, p.name_ur, p.name_en, p.slug, p.price, p.unit_type, p.unit_value,
    p.stock_quantity, p.stock_status, p.primary_image,
    c.name_en as category_name, c.slug as category_slug,
    c.qualifies_for_free_delivery, c.minimum_order_for_free_delivery
FROM products p
JOIN categories c ON p.category_id = c.id
WHERE p.is_active = TRUE;

-- Orders with customer and rider info
CREATE VIEW orders_detail_view AS
SELECT 
    o.id, o.order_number, o.status, o.total_amount,
    u.full_name as customer_name, u.phone as customer_phone,
    r.id as rider_id, ru.full_name as rider_name,
    o.placed_at, o.delivered_at, o.payment_status
FROM orders o
JOIN users u ON o.user_id = u.id
LEFT JOIN riders r ON o.rider_id = r.id
LEFT JOIN users ru ON r.user_id = ru.id
WHERE o.deleted_at IS NULL;

-- Rider tasks with location info
CREATE VIEW rider_tasks_view AS
SELECT 
    rt.id, rt.task_type, rt.status,
    r.id as rider_id, u.full_name as rider_name,
    o.order_number,
    ST_X(rt.pickup_location::geometry) as pickup_lng,
    ST_Y(rt.pickup_location::geometry) as pickup_lat,
    ST_X(rt.delivery_location::geometry) as delivery_lng,
    ST_Y(rt.delivery_location::geometry) as delivery_lat,
    rt.assigned_at, rt.completed_at
FROM rider_tasks rt
JOIN riders r ON rt.rider_id = r.id
JOIN users u ON r.user_id = u.id
LEFT JOIN orders o ON rt.order_id = o.id;

-- Atta requests with status
CREATE VIEW atta_requests_view AS
SELECT 
    ar.id, ar.request_number, ar.status,
    u.full_name as customer_name,
    ar.wheat_quality, ar.wheat_quantity_kg,
    ar.flour_type, ar.actual_flour_quantity_kg,
    ar.total_amount, ar.payment_status,
    pu.full_name as pickup_rider,
    du.full_name as delivery_rider,
    ar.created_at, ar.delivered_at
FROM atta_requests ar
JOIN users u ON ar.user_id = u.id
LEFT JOIN riders pr ON ar.pickup_rider_id = pr.id
LEFT JOIN users pu ON pr.user_id = pu.id
LEFT JOIN riders dr ON ar.delivery_rider_id = dr.id
LEFT JOIN users du ON dr.user_id = du.id;

-- ============================================================================
-- STORED PROCEDURES
-- ============================================================================

-- Calculate delivery charge based on cart contents and time
CREATE OR REPLACE FUNCTION calculate_delivery_charge(
    p_cart_id UUID,
    p_time_slot_id UUID,
    p_order_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    delivery_charge DECIMAL(10,2),
    rule_applied VARCHAR(100),
    rule_name VARCHAR(255)
) AS $$
DECLARE
    v_cart_categories UUID[];
    v_cart_total DECIMAL(10,2);
    v_time_slot RECORD;
    v_rule RECORD;
    v_charge DECIMAL(10,2) := 100.00;  -- Default
    v_rule_code VARCHAR(100) := 'STANDARD_DELIVERY';
    v_rule_name VARCHAR(255) := 'Standard Delivery Charge';
BEGIN
    -- Get cart info
    SELECT 
        ARRAY_AGG(DISTINCT p.category_id),
        c.subtotal
    INTO v_cart_categories, v_cart_total
    FROM carts c
    JOIN cart_items ci ON c.id = ci.cart_id
    JOIN products p ON ci.product_id = p.id
    WHERE c.id = p_cart_id
    GROUP BY c.id, c.subtotal;
    
    -- Get time slot info
    SELECT * INTO v_time_slot FROM time_slots WHERE id = p_time_slot_id;
    
    -- Check each active rule by priority
    FOR v_rule IN 
        SELECT * FROM delivery_charges_config 
        WHERE is_active = TRUE 
        AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
        AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        ORDER BY priority DESC
    LOOP
        -- Check if rule applies
        IF v_rule.condition_type = 'time_based' AND v_time_slot IS NOT NULL THEN
            -- Check time-based free delivery slot (order before 10AM for 10AM-2PM)
            IF v_rule.is_free_delivery_slot AND v_rule.order_before_time IS NOT NULL THEN
                IF v_time_slot.start_time >= v_rule.start_time 
                   AND v_time_slot.end_time <= v_rule.end_time
                   AND EXTRACT(HOUR FROM p_order_time) < EXTRACT(HOUR FROM v_rule.order_before_time) THEN
                    v_charge := 0.00;
                    v_rule_code := v_rule.rule_code;
                    v_rule_name := v_rule.rule_name;
                    EXIT;  -- Highest priority rule matched
                END IF;
            END IF;
        END IF;
        
        -- Check category-based rules
        IF v_rule.condition_type = 'category_based' AND v_cart_categories IS NOT NULL THEN
            -- Check if cart contains only qualifying categories
            IF v_rule.applicable_categories IS NOT NULL THEN
                IF v_cart_categories <@ v_rule.applicable_categories THEN
                    -- Check minimum order value
                    IF v_rule.minimum_order_value IS NULL OR v_cart_total >= v_rule.minimum_order_value THEN
                        v_charge := v_rule.charge_amount;
                        v_rule_code := v_rule.rule_code;
                        v_rule_name := v_rule.rule_name;
                        EXIT;
                    END IF;
                END IF;
            END IF;
        END IF;
        
        -- Check mixed rules (default)
        IF v_rule.condition_type = 'mixed' THEN
            v_charge := v_rule.charge_amount;
            v_rule_code := v_rule.rule_code;
            v_rule_name := v_rule.rule_name;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_charge, v_rule_code, v_rule_name;
END;
$$ LANGUAGE plpgsql;

-- Assign house number to address on first order
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
    
    -- Generate sequence for this zone
    SELECT COALESCE(MAX(NULL::INTEGER), 0) + 1 INTO v_sequence
    FROM addresses
    WHERE house_number LIKE v_zone_code || '-%';
    
    v_house_number := v_zone_code || '-' || LPAD(v_sequence::TEXT, 4, '0');
    
    -- Update address
    UPDATE addresses 
    SET house_number = v_house_number,
        updated_at = NOW()
    WHERE id = p_address_id AND house_number IS NULL;
    
    RETURN v_house_number;
END;
$$ LANGUAGE plpgsql;

-- Create notification for order status change
CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_notification_title VARCHAR(255);
    v_notification_message TEXT;
    v_notification_type notification_type;
BEGIN
    CASE NEW.status
        WHEN 'confirmed' THEN
            v_notification_title := 'Order Confirmed';
            v_notification_message := 'Your order ' || NEW.order_number || ' has been confirmed!';
            v_notification_type := 'order_confirmed';
        WHEN 'preparing' THEN
            v_notification_title := 'Order Being Prepared';
            v_notification_message := 'We are preparing your order ' || NEW.order_number;
            v_notification_type := 'order_confirmed';
        WHEN 'out_for_delivery' THEN
            v_notification_title := 'Out for Delivery';
            v_notification_message := 'Your order ' || NEW.order_number || ' is on the way!';
            v_notification_type := 'out_for_delivery';
        WHEN 'delivered' THEN
            v_notification_title := 'Order Delivered';
            v_notification_message := 'Your order ' || NEW.order_number || ' has been delivered. Enjoy!';
            v_notification_type := 'delivered';
        WHEN 'cancelled' THEN
            v_notification_title := 'Order Cancelled';
            v_notification_message := 'Your order ' || NEW.order_number || ' has been cancelled.';
            v_notification_type := 'cancelled';
        ELSE
            RETURN NEW;
    END CASE;

    -- Insert notification for customer (NEW.user_id IS the user id from orders table)
    INSERT INTO notifications (user_id, type, title, message, order_id)
    VALUES (NEW.user_id, v_notification_type, v_notification_title, v_notification_message, NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_status_notification
    AFTER UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION notify_order_status_change();

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
