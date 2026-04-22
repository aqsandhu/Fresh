-- ============================================================================
-- SEED ADMIN USER
-- ============================================================================
-- Run this in Supabase SQL Editor to create the default admin user
-- 
-- Default Login:
--   Phone: +923001234567
--   Password: admin123
--
-- IMPORTANT: Change the password after first login!
-- ============================================================================

-- Insert admin user into users table
INSERT INTO users (
    id, phone, password, full_name, email, role, status, created_at, updated_at
) VALUES (
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
    password = '$2b$12$O1eTnwAsfXPH6BSQ3ejQT.hXI1xXreglp.2Ec8CylEvTpvQAPmLzm',
    full_name = 'Fresh Bazar Admin',
    email = 'admin@freshbazar.pk',
    role = 'super_admin',
    status = 'active',
    updated_at = NOW();

-- Insert into admins table
INSERT INTO admins (
    id, user_id, permissions, last_login_at, created_at, updated_at
) VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    '{"all": true}'::jsonb,
    NOW(),
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Verify
SELECT u.id, u.phone, u.full_name, u.email, u.role, u.status, a.permissions
FROM users u
LEFT JOIN admins a ON a.user_id = u.id
WHERE u.phone = '+923001234567';
