/**
 * Migration: Create core application tables
 * Description: Creates categories, products, users, and other essential tables if they don't exist
 * Created: 2024-01-20
 */

exports.up = (pgm) => {
  // Enable UUID extension if not already enabled
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

  // Create categories table
  pgm.sql(`
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
  `);

  // Create index on categories slug
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);`);

  // Create products table
  pgm.sql(`
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
      unit_type varchar(50) DEFAULT 'piece',
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
  `);

  // Create indexes on products
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);`);

  // Seed default categories if table is empty
  pgm.sql(`
    INSERT INTO categories (name_ur, name_en, slug, display_order, is_active)
    SELECT 'گروسری', 'Grocery', 'grocery', 1, TRUE
    WHERE NOT EXISTS (SELECT 1 FROM categories LIMIT 1);
  `);

  // Seed a default product if table is empty
  pgm.sql(`
    INSERT INTO products (name_ur, name_en, slug, category_id, price, stock_quantity, is_active)
    SELECT 'چاول', 'Rice', 'rice',
      (SELECT id FROM categories WHERE slug = 'grocery' LIMIT 1),
      150.00, 100, TRUE
    WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1)
    AND EXISTS (SELECT 1 FROM categories WHERE slug = 'grocery');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS products;`);
  pgm.sql(`DROP TABLE IF EXISTS categories;`);
};

exports.config = { transaction: true };
