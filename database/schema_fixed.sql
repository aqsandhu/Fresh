-- ============================================================================
-- FRESHBAZAR - FIXED SCHEMA SETUP (Correct table order)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================
CREATE TYPE user_role AS ENUM ('customer', 'rider', 'admin', 'super_admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
CREATE TYPE rider_status AS ENUM ('available', 'busy', 'offline', 'on_leave');
CREATE TYPE rider_verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE product_status AS ENUM ('active', 'inactive', 'out_of_stock', 'discontinued');
CREATE TYPE unit_type AS ENUM ('kg', 'gram', 'piece', 'dozen', 'liter', 'ml', 'pack');
CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'preparing', 'ready_for_pickup', 
    'out_for_delivery', 'delivered', 'cancelled', 'refunded'
);
CREATE TYPE order_source AS ENUM ('app', 'website', 'whatsapp', 'manual', 'phone');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE payment_method AS ENUM ('cash_on_delivery', 'card', 'easypaisa', 'jazzcash', 'bank_transfer');
CREATE TYPE delivery_type AS ENUM ('standard', 'express', 'scheduled');
CREATE TYPE delivery_charge_type AS ENUM ('free', 'flat', 'distance_based', 'weight_based');
CREATE TYPE atta_request_status AS ENUM (
    'pending_pickup', 'picked_up', 'at_mill', 'milling', 
    'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'
);
CREATE TYPE wheat_quality AS ENUM ('desi', 'imported', 'mixed');
CREATE TYPE flour_type AS ENUM ('fine', 'medium', 'coarse');
CREATE TYPE task_type AS ENUM ('pickup', 'delivery', 'atta_pickup', 'atta_delivery');
CREATE TYPE task_status AS ENUM ('assigned', 'in_progress', 'completed', 'cancelled', 'failed');
CREATE TYPE notification_type AS ENUM (
    'order_placed', 'order_confirmed', 'order_ready', 'out_for_delivery', 
    'delivered', 'cancelled', 'payment_received', 'rider_assigned',
    'call_request', 'promotion', 'system'
);
CREATE TYPE slot_status AS ENUM ('available', 'full', 'closed');

-- ============================================================================
-- 1. USERS TABLE (no dependencies)
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255),
    password_hash TEXT,
    role user_role DEFAULT 'customer',
    status user_status DEFAULT 'active',
    profile_image TEXT,
    avatar_url TEXT,
    date_of_birth DATE,
    gender VARCHAR(20),
    preferred_language VARCHAR(10) DEFAULT 'ur',
    notification_enabled BOOLEAN DEFAULT TRUE,
    fcm_token TEXT,
    is_phone_verified BOOLEAN DEFAULT FALSE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    otp_code VARCHAR(6),
    otp_expires_at TIMESTAMPTZ,
    otp_attempts INTEGER DEFAULT 0,
    login_count INTEGER DEFAULT 0,
    phone_verified_at TIMESTAMPTZ,
    privacy_settings JSONB DEFAULT '{"show_phone_to_rider": false, "show_name_to_rider": true}'::jsonb,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 2. DELIVERY_ZONES TABLE (no dependencies) - MOVED UP
-- ============================================================================
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    boundary GEOGRAPHY(POLYGON, 4326),
    cities TEXT[],
    areas TEXT[],
    postal_codes TEXT[],
    standard_delivery_charge DECIMAL(10,2) DEFAULT 100.00,
    express_delivery_charge DECIMAL(10,2) DEFAULT 200.00,
    minimum_order_value DECIMAL(10,2) DEFAULT 500.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. MILLS TABLE (no dependencies) - MOVED UP
-- ============================================================================
CREATE TABLE mills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    location GEOGRAPHY(POINT, 4326),
    services_offered TEXT[],
    milling_rate_per_kg DECIMAL(8,2) DEFAULT 5.00,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. RIDERS TABLE (depends: users, delivery_zones)
-- ============================================================================
CREATE TABLE riders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    cnic VARCHAR(15) UNIQUE NOT NULL,
    cnic_front_image TEXT NOT NULL,
    cnic_back_image TEXT NOT NULL,
    driving_license_number VARCHAR(50),
    license_image TEXT,
    vehicle_type VARCHAR(50) NOT NULL,
    vehicle_number VARCHAR(20) NOT NULL,
    vehicle_image TEXT,
    status rider_status DEFAULT 'offline',
    verification_status rider_verification_status DEFAULT 'pending',
    current_location GEOGRAPHY(POINT, 4326),
    location_updated_at TIMESTAMPTZ,
    assigned_zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
    rating DECIMAL(2,1) DEFAULT 5.0 CHECK (rating >= 1.0 AND rating <= 5.0),
    total_deliveries INTEGER DEFAULT 0,
    total_earnings DECIMAL(12,2) DEFAULT 0.00,
    bank_account_title VARCHAR(255),
    bank_account_number VARCHAR(50),
    bank_name VARCHAR(100),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 5. ADMINS TABLE (depends: users)
-- ============================================================================
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    admin_level INTEGER DEFAULT 1,
    department VARCHAR(100),
    employee_id VARCHAR(50) UNIQUE,
    permissions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 6. CATEGORIES TABLE
-- ============================================================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name_ur VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description_ur TEXT,
    description_en TEXT,
    icon_url TEXT,
    image_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    qualifies_for_free_delivery BOOLEAN DEFAULT FALSE,
    minimum_order_for_free_delivery DECIMAL(10,2),
    meta_title VARCHAR(255),
    meta_description TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 7. PRODUCTS TABLE (depends: categories)
-- ============================================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES categories(id),
    subcategory_id UUID REFERENCES categories(id),
    name_ur VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description_ur TEXT,
    description_en TEXT,
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    compare_at_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    unit_type unit_type NOT NULL DEFAULT 'kg',
    unit_value DECIMAL(8,3) DEFAULT 1.000,
    min_order_quantity INTEGER DEFAULT 1,
    max_order_quantity INTEGER DEFAULT 100,
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    stock_status product_status DEFAULT 'active',
    track_inventory BOOLEAN DEFAULT TRUE,
    primary_image TEXT,
    images TEXT[],
    short_description TEXT,
    tags TEXT[],
    attributes JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    is_new BOOLEAN DEFAULT FALSE,
    is_new_arrival BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    meta_title VARCHAR(255),
    meta_description TEXT,
    weight_kg DECIMAL(8,3),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 8. ADDRESSES TABLE (depends: users, delivery_zones)
-- ============================================================================
CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_type VARCHAR(50) DEFAULT 'home',
    house_number VARCHAR(50),
    written_address TEXT NOT NULL,
    landmark VARCHAR(255),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    location_accuracy DECIMAL(5,2),
    google_place_id VARCHAR(255),
    door_picture_url TEXT NOT NULL,
    area_name VARCHAR(255),
    city VARCHAR(100) DEFAULT 'Karachi',
    province VARCHAR(100) DEFAULT 'Sindh',
    postal_code VARCHAR(20),
    zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    delivery_instructions TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 9. CARTS TABLE (depends: users)
-- ============================================================================
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active',
    subtotal DECIMAL(10,2) DEFAULT 0.00,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    coupon_code VARCHAR(50),
    coupon_discount DECIMAL(10,2) DEFAULT 0.00,
    item_count INTEGER DEFAULT 0,
    total_weight_kg DECIMAL(8,3) DEFAULT 0.000,
    notes TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. CART_ITEMS TABLE (depends: carts, products)
-- ============================================================================
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    special_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cart_id, product_id)
);

-- ============================================================================
-- 11. DELIVERY_CHARGES_CONFIG TABLE
-- ============================================================================
CREATE TABLE delivery_charges_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_name VARCHAR(255) NOT NULL,
    rule_code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    condition_type VARCHAR(50) NOT NULL,
    applicable_categories UUID[],
    excluded_categories UUID[],
    start_time TIME,
    end_time TIME,
    applicable_days INTEGER[],
    minimum_order_value DECIMAL(10,2),
    maximum_order_value DECIMAL(10,2),
    charge_type delivery_charge_type DEFAULT 'flat',
    charge_amount DECIMAL(10,2) DEFAULT 0.00,
    is_free_delivery_slot BOOLEAN DEFAULT FALSE,
    order_before_time TIME,
    delivery_slot_id UUID,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    valid_from DATE,
    valid_until DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 12. TIME_SLOTS TABLE
-- ============================================================================
CREATE TABLE time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_orders INTEGER DEFAULT 50,
    booked_orders INTEGER DEFAULT 0,
    status slot_status DEFAULT 'available',
    is_free_delivery_slot BOOLEAN DEFAULT FALSE,
    is_express_slot BOOLEAN DEFAULT FALSE,
    applicable_days INTEGER[],
    zone_ids UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_time_slots_unique UNIQUE (slot_name, start_time, end_time)
);

-- ============================================================================
-- 13. ATTA_REQUESTS TABLE (depends: users, addresses, mills, riders)
-- ============================================================================
CREATE TABLE atta_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    address_id UUID NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
    wheat_quality wheat_quality DEFAULT 'desi',
    wheat_quantity_kg DECIMAL(8,2) NOT NULL,
    wheat_description TEXT,
    flour_type flour_type DEFAULT 'fine',
    flour_quantity_expected_kg DECIMAL(8,2),
    special_instructions TEXT,
    mill_id UUID REFERENCES mills(id) ON DELETE SET NULL,
    mill_name VARCHAR(255),
    status atta_request_status DEFAULT 'pending_pickup',
    pickup_scheduled_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    pickup_proof_image TEXT,
    milling_started_at TIMESTAMPTZ,
    milling_completed_at TIMESTAMPTZ,
    actual_flour_quantity_kg DECIMAL(8,2),
    delivery_scheduled_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    delivery_proof_image TEXT,
    pickup_rider_id UUID REFERENCES riders(id),
    delivery_rider_id UUID REFERENCES riders(id),
    service_charge DECIMAL(10,2) DEFAULT 0.00,
    milling_charge DECIMAL(10,2) DEFAULT 0.00,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    payment_status payment_status DEFAULT 'pending',
    payment_method payment_method DEFAULT 'cash_on_delivery',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 14. ORDERS TABLE (depends: users, addresses, time_slots, delivery_charges_config, riders)
-- Note: whatsapp_order_id FK added later to break circular dependency
-- ============================================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    source order_source DEFAULT 'app',
    address_id UUID NOT NULL REFERENCES addresses(id),
    delivery_address_snapshot JSONB NOT NULL,
    time_slot_id UUID REFERENCES time_slots(id),
    requested_delivery_date DATE,
    subtotal DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    delivery_charge_rule_id UUID REFERENCES delivery_charges_config(id),
    payment_method payment_method DEFAULT 'cash_on_delivery',
    payment_status payment_status DEFAULT 'pending',
    paid_amount DECIMAL(10,2) DEFAULT 0.00,
    status order_status DEFAULT 'pending',
    rider_id UUID REFERENCES riders(id),
    assigned_at TIMESTAMPTZ,
    placed_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    preparing_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    out_for_delivery_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    delivered_by UUID REFERENCES riders(id),
    delivery_proof_image TEXT,
    customer_signature TEXT,
    customer_notes TEXT,
    admin_notes TEXT,
    -- whatsapp_order_id added via ALTER TABLE below
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 15. WHATSAPP_ORDERS TABLE (depends: orders, users)
-- ============================================================================
CREATE TABLE whatsapp_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    whatsapp_number VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    items JSONB NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    address_text TEXT,
    location GEOGRAPHY(POINT, 4326),
    status VARCHAR(50) DEFAULT 'pending',
    converted_to_order_id UUID REFERENCES orders(id),
    converted_by UUID REFERENCES users(id),
    converted_at TIMESTAMPTZ,
    entered_by UUID NOT NULL REFERENCES users(id),
    admin_notes TEXT,
    customer_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add the circular FK from orders -> whatsapp_orders
ALTER TABLE orders ADD COLUMN whatsapp_order_id UUID REFERENCES whatsapp_orders(id) ON DELETE SET NULL;

-- ============================================================================
-- 16. ORDER_ITEMS TABLE (depends: orders, products)
-- ============================================================================
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    product_image TEXT,
    product_sku VARCHAR(100),
    unit_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_price DECIMAL(10,2) NOT NULL,
    weight_kg DECIMAL(8,3),
    status VARCHAR(50) DEFAULT 'pending',
    special_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 17. RIDER_TASKS TABLE (depends: riders, orders, atta_requests)
-- ============================================================================
CREATE TABLE rider_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rider_id UUID NOT NULL REFERENCES riders(id),
    task_type task_type NOT NULL,
    status task_status DEFAULT 'assigned',
    order_id UUID REFERENCES orders(id),
    atta_request_id UUID REFERENCES atta_requests(id) ON DELETE CASCADE,
    pickup_location GEOGRAPHY(POINT, 4326),
    delivery_location GEOGRAPHY(POINT, 4326),
    pickup_address TEXT,
    delivery_address TEXT,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_duration INTEGER,
    sequence_number INTEGER DEFAULT 1,
    batch_id UUID,
    pickup_proof_image TEXT,
    delivery_proof_image TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================================================
-- 18. PAYMENTS TABLE (depends: orders, atta_requests)
-- ============================================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    atta_request_id UUID REFERENCES atta_requests(id),
    payment_method payment_method NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'PKR',
    status payment_status DEFAULT 'pending',
    transaction_id VARCHAR(255),
    gateway_response JSONB,
    refunded_amount DECIMAL(10,2) DEFAULT 0.00,
    refund_reason TEXT,
    refunded_at TIMESTAMPTZ,
    refunded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    CONSTRAINT chk_payment_entity CHECK (
        (order_id IS NOT NULL) OR (atta_request_id IS NOT NULL)
    )
);

-- ============================================================================
-- 19. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    rider_id UUID REFERENCES riders(id),
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    order_id UUID REFERENCES orders(id),
    atta_request_id UUID REFERENCES atta_requests(id),
    action_url TEXT,
    action_type VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    sent_via VARCHAR(50)[],
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_notifications_recipient CHECK (
        (user_id IS NOT NULL) OR (rider_id IS NOT NULL)
    )
);

-- ============================================================================
-- 20. CALL_REQUESTS TABLE (depends: riders, orders)
-- ============================================================================
CREATE TABLE call_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rider_id UUID NOT NULL REFERENCES riders(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    virtual_number VARCHAR(20),
    status VARCHAR(50) DEFAULT 'requested',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 21. SITE_SETTINGS TABLE
-- ============================================================================
CREATE TABLE site_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default banner settings
INSERT INTO site_settings (key, value) VALUES
    ('banner_left_text', 'Free Delivery on Orders Above Rs. 500'),
    ('banner_middle_text', 'Fresh Fruits & Vegetables Daily'),
    ('banner_right_text_en', 'Download App'),
    ('banner_right_text_ur', 'ایپ ڈاؤن لوڈ کریں'),
    ('banner_is_active', 'true'),
    ('banner_bg_color', '#1a7431')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_riders_user_id ON riders(user_id);
CREATE INDEX idx_riders_status ON riders(status);
CREATE INDEX idx_riders_location ON riders USING GIST(current_location) WHERE current_location IS NOT NULL;
CREATE INDEX idx_riders_zone ON riders(assigned_zone_id) WHERE assigned_zone_id IS NOT NULL;

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_active ON categories(is_active);
CREATE INDEX idx_categories_slug ON categories(slug);

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
CREATE INDEX idx_products_search ON products 
    USING gin(to_tsvector('english', COALESCE(name_en, '') || ' ' || COALESCE(description_en, '')));

CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_location ON addresses USING GIST(location);
CREATE INDEX idx_addresses_default ON addresses(user_id, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_addresses_house ON addresses(house_number) WHERE house_number IS NOT NULL;
CREATE INDEX idx_addresses_zone ON addresses(zone_id) WHERE zone_id IS NOT NULL;

CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_status ON carts(status);
CREATE INDEX idx_carts_expires ON carts(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product ON cart_items(product_id);

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

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE INDEX idx_delivery_config_active ON delivery_charges_config(is_active);
CREATE INDEX idx_delivery_config_priority ON delivery_charges_config(priority DESC);

CREATE INDEX idx_time_slots_time ON time_slots(start_time, end_time);
CREATE INDEX idx_time_slots_status ON time_slots(status);

CREATE INDEX idx_rider_tasks_rider ON rider_tasks(rider_id);
CREATE INDEX idx_rider_tasks_order ON rider_tasks(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_rider_tasks_status ON rider_tasks(status);
CREATE INDEX idx_rider_tasks_batch ON rider_tasks(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_rider_tasks_atta ON rider_tasks(atta_request_id) WHERE atta_request_id IS NOT NULL;

CREATE INDEX idx_atta_user ON atta_requests(user_id);
CREATE INDEX idx_atta_status ON atta_requests(status);
CREATE INDEX idx_atta_request_number ON atta_requests(request_number);
CREATE INDEX idx_atta_pickup_rider ON atta_requests(pickup_rider_id) WHERE pickup_rider_id IS NOT NULL;
CREATE INDEX idx_atta_delivery_rider ON atta_requests(delivery_rider_id) WHERE delivery_rider_id IS NOT NULL;
CREATE INDEX idx_atta_address ON atta_requests(address_id);
CREATE INDEX idx_atta_mill ON atta_requests(mill_id) WHERE mill_id IS NOT NULL;

CREATE INDEX idx_whatsapp_number ON whatsapp_orders(whatsapp_number);
CREATE INDEX idx_whatsapp_status ON whatsapp_orders(status);
CREATE INDEX idx_whatsapp_entered_by ON whatsapp_orders(entered_by);

CREATE INDEX idx_payments_order ON payments(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_payments_atta ON payments(atta_request_id) WHERE atta_request_id IS NOT NULL;
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_transaction ON payments(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE INDEX idx_notifications_user ON notifications(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_notifications_rider ON notifications(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(type);

CREATE INDEX idx_call_requests_rider ON call_requests(rider_id);
CREATE INDEX idx_call_requests_order ON call_requests(order_id);

CREATE INDEX idx_zones_boundary ON delivery_zones USING GIST(boundary);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_riders_updated_at BEFORE UPDATE ON riders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_config_updated_at BEFORE UPDATE ON delivery_charges_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_time_slots_updated_at BEFORE UPDATE ON time_slots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rider_tasks_updated_at BEFORE UPDATE ON rider_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_atta_requests_updated_at BEFORE UPDATE ON atta_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whatsapp_orders_updated_at BEFORE UPDATE ON whatsapp_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE SEQUENCE order_number_seq START 1;
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('order_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER set_order_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION generate_order_number();

CREATE SEQUENCE atta_request_seq START 1;
CREATE OR REPLACE FUNCTION generate_atta_request_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.request_number := 'ATTA-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('atta_request_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER set_atta_request_number BEFORE INSERT ON atta_requests FOR EACH ROW EXECUTE FUNCTION generate_atta_request_number();

CREATE OR REPLACE FUNCTION update_cart_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE carts SET subtotal = (SELECT COALESCE(SUM(total_price), 0) FROM cart_items WHERE cart_id = OLD.cart_id),
        item_count = (SELECT COALESCE(SUM(quantity), 0) FROM cart_items WHERE cart_id = OLD.cart_id), updated_at = NOW() WHERE id = OLD.cart_id;
        RETURN OLD;
    ELSE
        UPDATE carts SET subtotal = (SELECT COALESCE(SUM(total_price), 0) FROM cart_items WHERE cart_id = NEW.cart_id),
        item_count = (SELECT COALESCE(SUM(quantity), 0) FROM cart_items WHERE cart_id = NEW.cart_id), updated_at = NOW() WHERE id = NEW.cart_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_cart_on_item_change AFTER INSERT OR UPDATE OR DELETE ON cart_items FOR EACH ROW EXECUTE FUNCTION update_cart_totals();

CREATE OR REPLACE FUNCTION set_default_address()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE addresses SET is_default = FALSE WHERE user_id = NEW.user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ensure_single_default_address BEFORE INSERT OR UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION set_default_address();

CREATE OR REPLACE FUNCTION decrement_stock_on_order()
RETURNS TRIGGER AS $$
DECLARE
    v_item RECORD;
    v_current_stock INTEGER;
BEGIN
    FOR v_item IN SELECT product_id, quantity FROM order_items WHERE order_id = NEW.id LOOP
        SELECT stock_quantity INTO v_current_stock FROM products WHERE id = v_item.product_id;
        IF v_current_stock < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_item.product_id;
        END IF;
        UPDATE products SET stock_quantity = stock_quantity - v_item.quantity,
            stock_status = CASE WHEN (stock_quantity - v_item.quantity) <= 0 THEN 'out_of_stock'::product_status
            WHEN (stock_quantity - v_item.quantity) <= low_stock_threshold THEN 'active'::product_status
            ELSE stock_status END, updated_at = NOW() WHERE id = v_item.product_id;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_decrement_stock_on_confirm AFTER UPDATE OF status ON orders FOR EACH ROW WHEN (OLD.status = 'pending' AND NEW.status = 'confirmed') EXECUTE FUNCTION decrement_stock_on_order();

CREATE OR REPLACE FUNCTION update_cart_weight()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE carts SET total_weight_kg = (
            SELECT COALESCE(SUM(ci.quantity * p.unit_value * CASE p.unit_type
                WHEN 'kg' THEN 1.0 WHEN 'gram' THEN 0.001 WHEN 'liter' THEN 1.0 WHEN 'ml' THEN 0.001 ELSE 0.1 END), 0)
            FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = OLD.cart_id
        ), updated_at = NOW() WHERE id = OLD.cart_id;
        RETURN OLD;
    ELSE
        UPDATE carts SET total_weight_kg = (
            SELECT COALESCE(SUM(ci.quantity * p.unit_value * CASE p.unit_type
                WHEN 'kg' THEN 1.0 WHEN 'gram' THEN 0.001 WHEN 'liter' THEN 1.0 WHEN 'ml' THEN 0.001 ELSE 0.1 END), 0)
            FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = NEW.cart_id
        ), updated_at = NOW() WHERE id = NEW.cart_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_update_cart_weight AFTER INSERT OR UPDATE OR DELETE ON cart_items FOR EACH ROW EXECUTE FUNCTION update_cart_weight();

CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_title VARCHAR(255);
    v_message TEXT;
    v_type notification_type;
BEGIN
    CASE NEW.status
        WHEN 'confirmed' THEN v_title := 'Order Confirmed'; v_message := 'Your order ' || NEW.order_number || ' has been confirmed!'; v_type := 'order_confirmed';
        WHEN 'out_for_delivery' THEN v_title := 'Out for Delivery'; v_message := 'Your order ' || NEW.order_number || ' is on the way!'; v_type := 'out_for_delivery';
        WHEN 'delivered' THEN v_title := 'Order Delivered'; v_message := 'Your order ' || NEW.order_number || ' has been delivered.'; v_type := 'delivered';
        WHEN 'cancelled' THEN v_title := 'Order Cancelled'; v_message := 'Your order ' || NEW.order_number || ' has been cancelled.'; v_type := 'cancelled';
        ELSE RETURN NEW;
    END CASE;
    INSERT INTO notifications (user_id, type, title, message, order_id) VALUES (NEW.user_id, v_type, v_title, v_message, NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER order_status_notification AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION notify_order_status_change();

CREATE OR REPLACE FUNCTION calculate_delivery_charge(p_cart_id UUID, p_time_slot_id UUID, p_order_time TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (delivery_charge DECIMAL(10,2), rule_applied VARCHAR(100), rule_name VARCHAR(255)) AS $$
DECLARE
    v_cart_categories UUID[];
    v_cart_total DECIMAL(10,2);
    v_time_slot RECORD;
    v_rule RECORD;
    v_charge DECIMAL(10,2) := 100.00;
    v_rule_code VARCHAR(100) := 'STANDARD_DELIVERY';
    v_rule_name VARCHAR(255) := 'Standard Delivery Charge';
BEGIN
    SELECT ARRAY_AGG(DISTINCT p.category_id), c.subtotal INTO v_cart_categories, v_cart_total
    FROM carts c JOIN cart_items ci ON c.id = ci.cart_id JOIN products p ON ci.product_id = p.id
    WHERE c.id = p_cart_id GROUP BY c.id, c.subtotal;
    SELECT * INTO v_time_slot FROM time_slots WHERE id = p_time_slot_id;
    FOR v_rule IN SELECT * FROM delivery_charges_config WHERE is_active = TRUE 
        AND (valid_from IS NULL OR valid_from <= CURRENT_DATE) AND (valid_until IS NULL OR valid_until >= CURRENT_DATE) ORDER BY priority DESC LOOP
        IF v_rule.condition_type = 'time_based' AND v_time_slot IS NOT NULL THEN
            IF v_rule.is_free_delivery_slot AND v_rule.order_before_time IS NOT NULL THEN
                IF v_time_slot.start_time >= v_rule.start_time AND v_time_slot.end_time <= v_rule.end_time
                   AND EXTRACT(HOUR FROM p_order_time) < EXTRACT(HOUR FROM v_rule.order_before_time) THEN
                    v_charge := 0.00; v_rule_code := v_rule.rule_code; v_rule_name := v_rule.rule_name; EXIT;
                END IF;
            END IF;
        END IF;
        IF v_rule.condition_type = 'category_based' AND v_cart_categories IS NOT NULL THEN
            IF v_rule.applicable_categories IS NOT NULL THEN
                IF v_cart_categories <@ v_rule.applicable_categories THEN
                    IF v_rule.minimum_order_value IS NULL OR v_cart_total >= v_rule.minimum_order_value THEN
                        v_charge := v_rule.charge_amount; v_rule_code := v_rule.rule_code; v_rule_name := v_rule.rule_name; EXIT;
                    END IF;
                END IF;
            END IF;
        END IF;
        IF v_rule.condition_type = 'mixed' THEN
            v_charge := v_rule.charge_amount; v_rule_code := v_rule.rule_code; v_rule_name := v_rule.rule_name;
        END IF;
    END LOOP;
    RETURN QUERY SELECT v_charge, v_rule_code, v_rule_name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_house_number(p_address_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_house_number VARCHAR(50);
    v_zone_code VARCHAR(10);
    v_sequence INTEGER;
BEGIN
    SELECT dz.code INTO v_zone_code FROM addresses a JOIN delivery_zones dz ON a.zone_id = dz.id WHERE a.id = p_address_id;
    IF v_zone_code IS NULL THEN v_zone_code := 'UNK'; END IF;
    SELECT COALESCE(MAX(NULL::INTEGER), 0) + 1 INTO v_sequence FROM addresses WHERE house_number LIKE v_zone_code || '-%';
    v_house_number := v_zone_code || '-' || LPAD(v_sequence::TEXT, 4, '0');
    UPDATE addresses SET house_number = v_house_number, updated_at = NOW() WHERE id = p_address_id AND house_number IS NULL;
    RETURN v_house_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE VIEW active_products_view AS
SELECT p.id, p.name_ur, p.name_en, p.slug, p.price, p.unit_type, p.unit_value,
    p.stock_quantity, p.stock_status, p.primary_image,
    c.name_en as category_name, c.slug as category_slug,
    c.qualifies_for_free_delivery, c.minimum_order_for_free_delivery
FROM products p JOIN categories c ON p.category_id = c.id
WHERE p.is_active = TRUE AND p.deleted_at IS NULL;

CREATE VIEW orders_detail_view AS
SELECT o.id, o.order_number, o.status, o.total_amount,
    u.full_name as customer_name, u.phone as customer_phone,
    r.id as rider_id, ru.full_name as rider_name,
    o.placed_at, o.delivered_at, o.payment_status
FROM orders o JOIN users u ON o.user_id = u.id
LEFT JOIN riders r ON o.rider_id = r.id LEFT JOIN users ru ON r.user_id = ru.id
WHERE o.deleted_at IS NULL;

CREATE VIEW rider_tasks_view AS
SELECT rt.id, rt.task_type, rt.status, r.id as rider_id, u.full_name as rider_name, o.order_number,
    ST_X(rt.pickup_location::geometry) as pickup_lng, ST_Y(rt.pickup_location::geometry) as pickup_lat,
    ST_X(rt.delivery_location::geometry) as delivery_lng, ST_Y(rt.delivery_location::geometry) as delivery_lat,
    rt.assigned_at, rt.completed_at
FROM rider_tasks rt JOIN riders r ON rt.rider_id = r.id JOIN users u ON r.user_id = u.id LEFT JOIN orders o ON rt.order_id = o.id;

CREATE VIEW atta_requests_view AS
SELECT ar.id, ar.request_number, ar.status, u.full_name as customer_name,
    ar.wheat_quality, ar.wheat_quantity_kg, ar.flour_type, ar.actual_flour_quantity_kg,
    ar.total_amount, ar.payment_status, pu.full_name as pickup_rider, du.full_name as delivery_rider,
    ar.created_at, ar.delivered_at
FROM atta_requests ar JOIN users u ON ar.user_id = u.id
LEFT JOIN riders pr ON ar.pickup_rider_id = pr.id LEFT JOIN users pu ON pr.user_id = pu.id
LEFT JOIN riders dr ON ar.delivery_rider_id = dr.id LEFT JOIN users du ON dr.user_id = du.id;

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT INTO categories (name_ur, name_en, slug, icon_url, display_order, qualifies_for_free_delivery, minimum_order_for_free_delivery) VALUES
('سبزیاں', 'Vegetables', 'vegetables', NULL, 1, TRUE, 500.00),
('پھل', 'Fruits', 'fruits', NULL, 2, TRUE, 500.00),
('خشک میوہ', 'Dry Fruits', 'dry-fruits', NULL, 3, TRUE, 1000.00),
('چکن', 'Chicken', 'chicken', NULL, 4, FALSE, NULL),
('گوشت', 'Meat', 'meat', NULL, 5, FALSE, NULL),
('دودھ اور ڈیری', 'Dairy', 'dairy', NULL, 6, TRUE, 500.00),
('گروسری', 'Grocery', 'grocery', NULL, 7, TRUE, 500.00),
('مشروبات', 'Beverages', 'beverages', NULL, 8, TRUE, 500.00),
('اسنیکس', 'Snacks', 'snacks', NULL, 9, TRUE, 500.00),
('گھریلو سامان', 'Household', 'household', NULL, 10, TRUE, 500.00);

INSERT INTO time_slots (slot_name, start_time, end_time, max_orders, is_free_delivery_slot, applicable_days) VALUES
('Morning (10AM - 12PM)', '10:00', '12:00', 30, TRUE, ARRAY[0,1,2,3,4,5,6]),
('Afternoon (12PM - 2PM)', '12:00', '14:00', 30, TRUE, ARRAY[0,1,2,3,4,5,6]),
('Evening (2PM - 4PM)', '14:00', '16:00', 40, FALSE, ARRAY[0,1,2,3,4,5,6]),
('Evening (4PM - 6PM)', '16:00', '18:00', 40, FALSE, ARRAY[0,1,2,3,4,5,6]),
('Night (6PM - 8PM)', '18:00', '20:00', 50, FALSE, ARRAY[0,1,2,3,4,5,6]),
('Night (8PM - 10PM)', '20:00', '22:00', 50, FALSE, ARRAY[0,1,2,3,4,5,6]);

INSERT INTO delivery_charges_config (rule_name, rule_code, description, condition_type, applicable_categories, minimum_order_value, charge_type, charge_amount, is_free_delivery_slot, start_time, end_time, priority, is_active) VALUES
('Free Delivery - Morning Slot', 'FREE_MORNING_SLOT', 'Free delivery for orders placed before 10AM', 'time_based', NULL, 0, 'free', 0.00, TRUE, '10:00', '14:00', 100, TRUE),
('Free Delivery - Vegetables/Fruits/Dry Fruits', 'FREE_VEG_FRUIT_MIN', 'Free delivery for veg/fruit orders above minimum', 'category_based', (SELECT ARRAY_AGG(id) FROM categories WHERE slug IN ('vegetables', 'fruits', 'dry-fruits')), 500.00, 'free', 0.00, FALSE, NULL, NULL, 90, TRUE),
('Paid Delivery - Chicken Only Orders', 'PAID_CHICKEN_ONLY', 'Always paid delivery for chicken-only orders', 'category_based', (SELECT ARRAY_AGG(id) FROM categories WHERE slug = 'chicken'), 0, 'flat', 100.00, FALSE, NULL, NULL, 80, TRUE),
('Standard Delivery Charge', 'STANDARD_DELIVERY', 'Default delivery charge', 'mixed', NULL, 0, 'flat', 100.00, FALSE, NULL, NULL, 10, TRUE);

INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 'آلو', 'Potato', 'potato', c.id, 80.00, 'kg', 1.000, 100, NULL, 'Fresh farm potatoes' FROM categories c WHERE c.slug = 'vegetables';
INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 'ٹماٹر', 'Tomato', 'tomato', c.id, 120.00, 'kg', 1.000, 80, NULL, 'Fresh red tomatoes' FROM categories c WHERE c.slug = 'vegetables';
INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 'سیب', 'Apple', 'apple', c.id, 250.00, 'kg', 1.000, 50, NULL, 'Fresh imported apples' FROM categories c WHERE c.slug = 'fruits';
INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 'بادام', 'Almonds', 'almonds', c.id, 1200.00, 'kg', 0.500, 30, NULL, 'Premium quality almonds' FROM categories c WHERE c.slug = 'dry-fruits';
INSERT INTO products (name_ur, name_en, slug, category_id, price, unit_type, unit_value, stock_quantity, primary_image, description_en) 
SELECT 'چکن بریسٹ', 'Chicken Breast', 'chicken-breast', c.id, 450.00, 'kg', 1.000, 40, NULL, 'Fresh chicken breast' FROM categories c WHERE c.slug = 'chicken';

INSERT INTO delivery_zones (name, code, cities, areas, standard_delivery_charge, minimum_order_value) VALUES
('North Karachi', 'NK-01', ARRAY['Karachi'], ARRAY['North Karachi', 'New Karachi', 'North Nazimabad'], 100.00, 500.00),
('Gulshan', 'GL-01', ARRAY['Karachi'], ARRAY['Gulshan-e-Iqbal', 'Gulistan-e-Johar', 'Johar'], 100.00, 500.00),
('Clifton/DHA', 'CD-01', ARRAY['Karachi'], ARRAY['Clifton', 'DHA', 'Defence'], 150.00, 500.00),
('Saddar', 'SD-01', ARRAY['Karachi'], ARRAY['Saddar', 'Soldier Bazaar', 'Garden'], 100.00, 500.00),
('Malir', 'ML-01', ARRAY['Karachi'], ARRAY['Malir', 'Airport', 'Model Colony'], 120.00, 500.00),
('Korangi', 'KR-01', ARRAY['Karachi'], ARRAY['Korangi', 'Landhi', 'Shah Faisal'], 120.00, 500.00);

INSERT INTO users (phone, email, full_name, password_hash, role, status, is_phone_verified, is_email_verified)
VALUES ('+923001234567', 'admin@freshbazar.pk', 'System Administrator', '$2a$12$tPTh4eedXG85bZmEE12GJu4J7NJJPq8MRwIN3CYbO.2Zy9XYH0lNG', 'super_admin', 'active', TRUE, TRUE)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO admins (user_id, admin_level, department, employee_id, permissions, is_active)
SELECT id, 3, 'operations', 'ADMIN-001',
    '{"users": {"read": true, "write": true, "delete": true}, "orders": {"read": true, "write": true, "delete": true}, "products": {"read": true, "write": true, "delete": true}, "riders": {"read": true, "write": true, "delete": true}, "reports": {"read": true, "write": true}, "settings": {"read": true, "write": true}}'::jsonb, TRUE
FROM users WHERE phone = '+923001234567' ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO mills (name, owner_name, phone, email, address, services_offered, milling_rate_per_kg, is_active, is_verified) VALUES 
('Karachi Flour Mill', 'Ahmed Khan', '+923211234567', 'info@karachiflourmill.pk', 'Plot 123, Industrial Area, Karachi', ARRAY['fine', 'medium', 'coarse'], 5.00, TRUE, TRUE),
('Al-Rehman Chakki', 'Muhammad Rehman', '+923221234567', 'alrehman.chakki@email.com', 'Shop 45, Main Market, North Karachi', ARRAY['fine', 'medium'], 4.50, TRUE, TRUE),
('Madina Flour Mill', 'Hassan Ali', '+923231234567', 'madina.mill@email.com', 'Block 7, Gulshan-e-Iqbal, Karachi', ARRAY['fine', 'medium', 'coarse'], 5.50, TRUE, FALSE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- END OF FIXED SCHEMA
-- ============================================================================
