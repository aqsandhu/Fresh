-- ============================================================================
-- FRESH BAZAR SEED DATA
-- Pakistani Grocery Products for Gujrat
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS categories (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ur varchar(255) NOT NULL,
    name_en varchar(255) NOT NULL,
    slug varchar(255) UNIQUE NOT NULL,
    icon_url varchar(500),
    image_url varchar(500),
    parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT TRUE,
    qualifies_for_free_delivery boolean DEFAULT FALSE,
    minimum_order_for_free_delivery decimal(10,2) DEFAULT 0,
    meta_title varchar(255),
    meta_description varchar(500),
    created_by uuid,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ur varchar(255) NOT NULL,
    name_en varchar(255) NOT NULL,
    slug varchar(255) UNIQUE NOT NULL,
    sku varchar(100),
    barcode varchar(100),
    category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    subcategory_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    price decimal(10,2) NOT NULL DEFAULT 0,
    compare_at_price decimal(10,2),
    cost_price decimal(10,2),
    unit_type varchar(50) DEFAULT 'kg',
    unit_value decimal(10,2) DEFAULT 1,
    stock_quantity integer DEFAULT 0,
    low_stock_threshold integer DEFAULT 5,
    stock_status varchar(50) DEFAULT 'in_stock',
    track_inventory boolean DEFAULT TRUE,
    primary_image varchar(500),
    images jsonb,
    short_description varchar(500),
    description_ur text,
    description_en text,
    attributes jsonb,
    meta_title varchar(255),
    meta_description varchar(500),
    tags text[],
    is_active boolean DEFAULT TRUE,
    is_featured boolean DEFAULT FALSE,
    is_new_arrival boolean DEFAULT FALSE,
    view_count integer DEFAULT 0,
    order_count integer DEFAULT 0,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);

-- Clear existing seed data (be careful in production!)
DELETE FROM products WHERE slug LIKE 'seed-%' OR slug IN (
    'aloo', 'tamatar', 'piyaz', 'hari-mirch', 'lahsun',
    'apple', 'banana', 'orange', ' grapes', 'pomegranate',
    'badam', 'akhrot', 'kaju', 'pista', 'kishmish',
    'chicken-whole', 'chicken-breast', 'chicken-drumstick',
    'doodh', 'dahi', 'paneer', 'ghee', 'anda',
    'rice', 'atta', 'dal-mong', 'dal-mash', 'cheeni', 'namak'
);
DELETE FROM categories WHERE slug IN ('sabzi', 'fruit', 'dry-fruit', 'chicken', 'dairy', 'grocery');

-- ============================================================================
-- CATEGORIES
-- ============================================================================

INSERT INTO categories (name_ur, name_en, slug, icon_url, image_url, display_order, is_active, qualifies_for_free_delivery, minimum_order_for_free_delivery) VALUES
('سبزیاں', 'Vegetables', 'sabzi', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800', 1, TRUE, TRUE, 500),
('پھل', 'Fruits', 'fruit', 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=400', 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=800', 2, TRUE, TRUE, 500),
('خشک میوہ', 'Dry Fruits', 'dry-fruit', 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=400', 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=800', 3, TRUE, TRUE, 500),
('چکن', 'Chicken', 'chicken', 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400', 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800', 4, TRUE, TRUE, 500),
('دودھ و دہی', 'Dairy & Eggs', 'dairy', 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400', 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=800', 5, TRUE, TRUE, 500),
('گروسری', 'Grocery', 'grocery', 'https://images.unsplash.com/photo-1582564286939-400a311013a2?w=400', 'https://images.unsplash.com/photo-1582564286939-400a311013a2?w=800', 6, TRUE, TRUE, 500);

-- ============================================================================
-- VEGETABLES (Sabzi)
-- ============================================================================

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images) 
SELECT 'آلو', 'Potato', 'aloo', c.id, 80.00, 100.00, 'kg', 1, 500, TRUE, FALSE, 'https://images.unsplash.com/photo-1518977676601-b53f82ber40f?w=400', 'Fresh potatoes', 'Premium quality fresh potatoes, perfect for curries and fries.', ARRAY['aloo', 'potato', 'sabzi'], '["https://images.unsplash.com/photo-1518977676601-b53f82ber40f?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'ٹماٹر', 'Tomato', 'tamatar', c.id, 120.00, 150.00, 'kg', 1, 400, TRUE, TRUE, 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400', 'Red juicy tomatoes', 'Farm fresh red tomatoes for salads, curries and raita.', ARRAY['tamatar', 'tomato', 'sabzi'], '["https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'پیاز', 'Onion', 'piyaz', c.id, 90.00, 110.00, 'kg', 1, 600, TRUE, FALSE, 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400', 'Fresh onions', 'Essential cooking ingredient, farm fresh onions.', ARRAY['piyaz', 'onion', 'sabzi'], '["https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'ہری مرچ', 'Green Chilli', 'hari-mirch', c.id, 60.00, 80.00, 'kg', 0.25, 300, TRUE, FALSE, 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=400', 'Fresh green chillies', 'Spicy green chillies for that perfect Pakistani taste.', ARRAY['hari mirch', 'green chilli', 'sabzi'], '["https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'لہسن', 'Garlic', 'lahsun', c.id, 350.00, 400.00, 'kg', 0.25, 200, TRUE, FALSE, 'https://images.unsplash.com/photo-1615477083313-0f261bb83547?w=400', 'Fresh garlic', 'Fresh garlic bulbs for cooking and health benefits.', ARRAY['lahsun', 'garlic', 'sabzi'], '["https://images.unsplash.com/photo-1615477083313-0f261bb83547?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'بنگن', 'Eggplant', 'baingan', c.id, 70.00, 90.00, 'kg', 1, 250, TRUE, FALSE, 'https://images.unsplash.com/photo-1613881553903-122b8fe0f801?w=400', 'Fresh eggplant', 'Purple eggplant for bhartha and curries.', ARRAY['baingan', 'eggplant', 'sabzi'], '["https://images.unsplash.com/photo-1613881553903-122b8fe0f801?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'کدو', 'Pumpkin', 'kaddu', c.id, 50.00, 65.00, 'kg', 1, 180, TRUE, FALSE, 'https://images.unsplash.com/photo-1570586437263-160f0a8e48f0?w=400', 'Sweet pumpkin', 'Fresh pumpkin for halwa and curries.', ARRAY['kaddu', 'pumpkin', 'sabzi'], '["https://images.unsplash.com/photo-1570586437263-160f0a8e48f0?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'بند گوبھی', 'Cabbage', 'band-gobhi', c.id, 55.00, 70.00, 'piece', 1, 150, TRUE, FALSE, 'https://images.unsplash.com/photo-1633342563724-b10df2363049?w=400', 'Fresh cabbage', 'Crisp fresh cabbage for salads and stir fry.', ARRAY['gobhi', 'cabbage', 'sabzi'], '["https://images.unsplash.com/photo-1633342563724-b10df2363049?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'گاجر', 'Carrot', 'gajar', c.id, 45.00, 60.00, 'kg', 1, 350, TRUE, TRUE, 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400', 'Fresh carrots', 'Sweet and crunchy carrots for gajar halwa and salads.', ARRAY['gajar', 'carrot', 'sabzi'], '["https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'پالک', 'Spinach', 'palak', c.id, 35.00, 45.00, 'bunch', 1, 400, TRUE, FALSE, 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400', 'Fresh spinach', 'Fresh green spinach leaves for palak paneer and saag.', ARRAY['palak', 'spinach', 'sabzi'], '["https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400"]'
FROM categories c WHERE c.slug = 'sabzi';

-- ============================================================================
-- FRUITS
-- ============================================================================

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'سیب', 'Apple', 'apple', c.id, 200.00, 250.00, 'kg', 1, 300, TRUE, TRUE, 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400', 'Fresh apples', 'Crisp and juicy apples, imported quality.', ARRAY['apple', 'seb', 'fruit'], '["https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400"]'
FROM categories c WHERE c.slug = 'fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'کیلا', 'Banana', 'banana', c.id, 120.00, 150.00, 'dozen', 1, 500, TRUE, FALSE, 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400', 'Fresh bananas', 'Sweet and ripe bananas for energy and health.', ARRAY['banana', 'kela', 'fruit'], '["https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400"]'
FROM categories c WHERE c.slug = 'fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'مالٹا', 'Orange', 'orange', c.id, 180.00, 220.00, 'kg', 1, 250, TRUE, FALSE, 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400', 'Fresh oranges', 'Juicy oranges packed with Vitamin C.', ARRAY['orange', 'malta', 'fruit'], '["https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400"]'
FROM categories c WHERE c.slug = 'fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'انگور', 'Grapes', 'grapes', c.id, 250.00, 300.00, 'kg', 1, 200, TRUE, FALSE, 'https://images.unsplash.com/photo-1537640538966-79f369143f6f?w=400', 'Fresh grapes', 'Sweet seedless grapes, perfect for snacking.', ARRAY['grapes', 'angoor', 'fruit'], '["https://images.unsplash.com/photo-1537640538966-79f369143f6f?w=400"]'
FROM categories c WHERE c.slug = 'fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'انار', 'Pomegranate', 'pomegranate', c.id, 350.00, 420.00, 'kg', 1, 150, TRUE, TRUE, 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400', 'Fresh pomegranate', 'Ruby red pomegranate with juicy arils.', ARRAY['pomegranate', 'anar', 'fruit'], '["https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400"]'
FROM categories c WHERE c.slug = 'fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'خربوزہ', 'Melon', 'melon', c.id, 80.00, 100.00, 'piece', 1, 100, TRUE, FALSE, 'https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=400', 'Sweet melon', 'Sweet and fragrant melon for summer refreshment.', ARRAY['melon', 'kharbuza', 'fruit'], '["https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=400"]'
FROM categories c WHERE c.slug = 'fruit';

-- ============================================================================
-- DRY FRUITS
-- ============================================================================

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'بادام', 'Almonds', 'badam', c.id, 1200.00, 1400.00, 'kg', 0.5, 200, TRUE, TRUE, 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400', 'Premium almonds', 'Premium quality almonds, perfect for snacking and desserts.', ARRAY['badam', 'almonds', 'dry fruit'], '["https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400"]'
FROM categories c WHERE c.slug = 'dry-fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'اخروٹ', 'Walnuts', 'akhrot', c.id, 1500.00, 1700.00, 'kg', 0.5, 150, TRUE, FALSE, 'https://images.unsplash.com/photo-1575481636764-7f2365801443?w=400', 'Fresh walnuts', 'Brain-boosting walnuts, fresh and crunchy.', ARRAY['akhrot', 'walnuts', 'dry fruit'], '["https://images.unsplash.com/photo-1575481636764-7f2365801443?w=400"]'
FROM categories c WHERE c.slug = 'dry-fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'کاجو', 'Cashews', 'kaju', c.id, 1800.00, 2000.00, 'kg', 0.5, 180, TRUE, TRUE, 'https://images.unsplash.com/photo-1595309936298-95c56df94eb4?w=400', 'Premium cashews', 'Creamy and delicious cashews for korma and desserts.', ARRAY['kaju', 'cashews', 'dry fruit'], '["https://images.unsplash.com/photo-1595309936298-95c56df94eb4?w=400"]'
FROM categories c WHERE c.slug = 'dry-fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'پستہ', 'Pistachios', 'pista', c.id, 2500.00, 2800.00, 'kg', 0.5, 100, TRUE, FALSE, 'https://images.unsplash.com/photo-1616680213661-3c641750899c?w=400', 'Premium pistachios', 'Crunchy and salted pistachios for snacking.', ARRAY['pista', 'pistachios', 'dry fruit'], '["https://images.unsplash.com/photo-1616680213661-3c641750899c?w=400"]'
FROM categories c WHERE c.slug = 'dry-fruit';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'کشمش', 'Raisins', 'kishmish', c.id, 600.00, 750.00, 'kg', 0.5, 250, TRUE, FALSE, 'https://images.unsplash.com/photo-1596073419667-9d77d59f033f?w=400', 'Sweet raisins', 'Sweet and plump raisins for biryani and desserts.', ARRAY['kishmish', 'raisins', 'dry fruit'], '["https://images.unsplash.com/photo-1596073419667-9d77d59f033f?w=400"]'
FROM categories c WHERE c.slug = 'dry-fruit';

-- ============================================================================
-- CHICKEN
-- ============================================================================

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'چکن صاف', 'Whole Chicken', 'chicken-whole', c.id, 450.00, 500.00, 'kg', 1, 100, TRUE, TRUE, 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400', 'Fresh whole chicken', 'Farm fresh whole chicken, cleaned and ready to cook.', ARRAY['chicken', 'murgh', 'whole'], '["https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400"]'
FROM categories c WHERE c.slug = 'chicken';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'چکن بریسٹ', 'Chicken Breast', 'chicken-breast', c.id, 550.00, 620.00, 'kg', 1, 80, TRUE, FALSE, 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400', 'Boneless chicken breast', 'Premium boneless chicken breast for healthy meals.', ARRAY['chicken', 'breast', 'boneless'], '["https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400"]'
FROM categories c WHERE c.slug = 'chicken';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'چکن ڈرم اسٹک', 'Chicken Drumsticks', 'chicken-drumstick', c.id, 480.00, 550.00, 'kg', 1, 90, TRUE, FALSE, 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400', 'Chicken drumsticks', 'Juicy chicken drumsticks perfect for frying and grilling.', ARRAY['chicken', 'drumstick', 'leg piece'], '["https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400"]'
FROM categories c WHERE c.slug = 'chicken';

-- ============================================================================
-- DAIRY & EGGS
-- ============================================================================

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'تازہ دودھ', 'Fresh Milk', 'doodh', c.id, 130.00, 150.00, 'liter', 1, 200, TRUE, TRUE, 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400', 'Fresh full cream milk', 'Farm fresh full cream milk, delivered chilled.', ARRAY['doodh', 'milk', 'dairy'], '["https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400"]'
FROM categories c WHERE c.slug = 'dairy';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'دہی', 'Yogurt', 'dahi', c.id, 80.00, 100.00, 'kg', 0.5, 150, TRUE, FALSE, 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400', 'Fresh yogurt', 'Thick and creamy fresh yogurt for raita and lassi.', ARRAY['dahi', 'yogurt', 'dairy'], '["https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400"]'
FROM categories c WHERE c.slug = 'dairy';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'پنیر', 'Paneer', 'paneer', c.id, 450.00, 500.00, 'kg', 0.5, 80, TRUE, TRUE, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400', 'Fresh paneer', 'Soft and fresh paneer for palak paneer and tikka.', ARRAY['paneer', 'cottage cheese', 'dairy'], '["https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400"]'
FROM categories c WHERE c.slug = 'dairy';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'دیسی گھی', 'Desi Ghee', 'ghee', c.id, 1800.00, 2000.00, 'kg', 0.5, 60, TRUE, FALSE, 'https://images.unsplash.com/photo-1588165171080-c89acfa5ee83?w=400', 'Pure desi ghee', 'Pure desi ghee for authentic Pakistani cooking.', ARRAY['ghee', 'desi ghee', 'dairy'], '["https://images.unsplash.com/photo-1588165171080-c89acfa5ee83?w=400"]'
FROM categories c WHERE c.slug = 'dairy';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'انڈے', 'Eggs', 'anda', c.id, 180.00, 220.00, 'dozen', 1, 300, TRUE, FALSE, 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400', 'Fresh farm eggs', 'Farm fresh eggs for breakfast and baking.', ARRAY['eggs', 'ande', 'dairy'], '["https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400"]'
FROM categories c WHERE c.slug = 'dairy';

-- ============================================================================
-- GROCERY
-- ============================================================================

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'چاول', 'Basmati Rice', 'rice', c.id, 250.00, 300.00, 'kg', 5, 500, TRUE, TRUE, 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400', 'Premium basmati rice', 'Long grain premium basmati rice for biryani and pulao.', ARRAY['rice', 'chawal', 'basmati'], '["https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400"]'
FROM categories c WHERE c.slug = 'grocery';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'گندم کا آٹا', 'Wheat Flour', 'atta', c.id, 90.00, 110.00, 'kg', 5, 400, TRUE, TRUE, 'https://images.unsplash.com/photo-1621993202323-c430e85ba169?w=400', 'Fresh wheat flour', 'Fine quality wheat flour for daily roti.', ARRAY['atta', 'wheat flour', 'roti'], '["https://images.unsplash.com/photo-1621993202323-c430e85ba169?w=400"]'
FROM categories c WHERE c.slug = 'grocery';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'مونگ دال', 'Mong Lentils', 'dal-mong', c.id, 180.00, 210.00, 'kg', 1, 350, TRUE, FALSE, 'https://images.unsplash.com/photo-1610725664285-7c7761f73127?w=400', 'Yellow mong lentils', 'Premium yellow mong dal for daily meals.', ARRAY['mong dal', 'lentils', 'dal'], '["https://images.unsplash.com/photo-1610725664285-7c7761f73127?w=400"]'
FROM categories c WHERE c.slug = 'grocery';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'ماش دال', 'Mash Lentils', 'dal-mash', c.id, 220.00, 250.00, 'kg', 1, 300, TRUE, FALSE, 'https://images.unsplash.com/photo-1610725664285-7c7761f73127?w=400', 'White mash lentils', 'Premium white mash dal for daal maash.', ARRAY['mash dal', 'lentils', 'dal'], '["https://images.unsplash.com/photo-1610725664285-7c7761f73127?w=400"]'
FROM categories c WHERE c.slug = 'grocery';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'چینی', 'Sugar', 'cheeni', c.id, 95.00, 110.00, 'kg', 1, 600, TRUE, FALSE, 'https://images.unsplash.com/photo-1622484212153-3593a59b032f?w=400', 'White sugar', 'Fine quality white sugar for tea and desserts.', ARRAY['sugar', 'chini', 'cheeni'], '["https://images.unsplash.com/photo-1622484212153-3593a59b032f?w=400"]'
FROM categories c WHERE c.slug = 'grocery';

INSERT INTO products (name_ur, name_en, slug, category_id, price, compare_at_price, unit_type, unit_value, stock_quantity, is_active, is_featured, primary_image, short_description, description_en, tags, images)
SELECT 'نمک', 'Salt', 'namak', c.id, 25.00, 35.00, 'kg', 1, 1000, TRUE, FALSE, 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=400', 'Iodized salt', 'Pure iodized salt for daily cooking.', ARRAY['salt', 'namak'], '["https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=400"]'
FROM categories c WHERE c.slug = 'grocery';

-- ============================================================================
-- VERIFY: Count seeded data
-- ============================================================================
SELECT 'Categories' as table_name, COUNT(*) as count FROM categories
UNION ALL
SELECT 'Products', COUNT(*) FROM products;
