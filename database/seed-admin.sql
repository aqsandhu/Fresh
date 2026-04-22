-- ============================================================================
-- QUICK SETUP: Create minimal tables + Admin User
-- ============================================================================
-- Run this in Supabase SQL Editor
-- 
-- Default Admin Login:
--   Phone: +923001234567
--   Password: admin123
--
-- IMPORTANT: Change password after first login!
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user_role enum
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'rider', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create user_status enum  
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role user_role DEFAULT 'customer',
    status user_status DEFAULT 'active',
    avatar_url TEXT,
    is_phone_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. ADMINS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    permissions JSONB DEFAULT '{}',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. SEED ADMIN USER
-- ============================================================================
INSERT INTO users (id, phone, password_hash, full_name, email, role, status, created_at, updated_at)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    '+923001234567',
    '$2b$12$O1eTnwAsfXPH6BSQ3ejQT.hXI1xXreglp.2Ec8CylEvTpvQAPmLzm',
    'Fresh Bazar Admin',
    'admin@freshbazar.pk',
    'super_admin',
    'active',
    NOW(),
    NOW()
) ON CONFLICT (phone) DO UPDATE SET
    password_hash = '$2b$12$O1eTnwAsfXPH6BSQ3ejQT.hXI1xXreglp.2Ec8CylEvTpvQAPmLzm',
    full_name = 'Fresh Bazar Admin',
    email = 'admin@freshbazar.pk',
    role = 'super_admin',
    status = 'active',
    updated_at = NOW();

INSERT INTO admins (id, user_id, permissions, last_login_at, created_at, updated_at)
VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    '{"all": true}'::jsonb,
    NOW(), NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Verify
SELECT 'Admin created successfully!' as result;
SELECT u.phone, u.full_name, u.role, u.status FROM users u WHERE u.phone = '+923001234567';
