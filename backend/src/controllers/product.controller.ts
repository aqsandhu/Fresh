// ============================================================================
// PRODUCT CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, paginatedResponse } from '../utils/response';

/**
 * Get all products with filters
 * GET /api/products
 */
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const {
    category,
    search,
    minPrice,
    maxPrice,
    page = 1,
    limit = 20,
    sortBy = 'created_at',
    sortOrder = 'desc',
    featured,
    inStock,
  } = req.query;

  // Build base query
  let sql = `
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = TRUE
  `;

  const params: any[] = [];
  let paramIndex = 1;

  // Category filter
  if (category) {
    sql += ` AND (p.category_id = $${paramIndex} OR p.subcategory_id = $${paramIndex})`;
    params.push(category);
    paramIndex++;
  }

  // Search filter - SECURITY FIX: Sanitize search term to prevent SQL injection
  if (search && typeof search === 'string') {
    // Remove potentially dangerous characters and limit length
    const sanitizedSearch = search
      .replace(/[%_\\]/g, '\\$&') // Escape SQL wildcards
      .trim()
      .substring(0, 100); // Limit search length
    
    if (sanitizedSearch.length > 0) {
      sql += ` AND (
        p.name_en ILIKE $${paramIndex} 
        OR p.name_ur ILIKE $${paramIndex}
        OR p.description_en ILIKE $${paramIndex}
        OR p.tags @> ARRAY[$${paramIndex}]
      )`;
      params.push(`%${sanitizedSearch}%`);
      paramIndex++;
    }
  }

  // Price range filter
  if (minPrice) {
    sql += ` AND p.price >= $${paramIndex}`;
    params.push(minPrice);
    paramIndex++;
  }

  if (maxPrice) {
    sql += ` AND p.price <= $${paramIndex}`;
    params.push(maxPrice);
    paramIndex++;
  }

  // Featured filter
  if (featured === 'true') {
    sql += ` AND p.is_featured = TRUE`;
  }

  // In stock filter
  if (inStock === 'true') {
    sql += ` AND p.stock_quantity > 0`;
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Build sort clause - SECURITY FIX: Whitelist validation for both field and order
  const allowedSortFields = ['created_at', 'price', 'name_en', 'popularity', 'view_count'];
  const allowedSortOrders = ['asc', 'desc'];
  const sortField = allowedSortFields.includes(sortBy as string) ? sortBy : 'created_at';
  const order = allowedSortOrders.includes((sortOrder as string)?.toLowerCase()) ? (sortOrder as string).toUpperCase() : 'DESC';

  // Get products
  const productsSql = `
    SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.slug as category_slug,
      p.subcategory_id, p.price, p.compare_at_price, p.cost_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.stock_status,
      p.primary_image, p.images, p.short_description,
      p.description_ur, p.description_en, p.attributes,
      p.is_active, p.is_featured, p.is_new_arrival,
      p.view_count, p.order_count,
      p.created_at, p.updated_at
    ${sql}
    ORDER BY p.${sortField} ${order}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(productsSql, params);

  paginatedResponse(
    res,
    result.rows,
    parseInt(page as string),
    parseInt(limit as string),
    total,
    'Products retrieved successfully'
  );
});

/**
 * Get product by ID
 * GET /api/products/:id
 */
export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await query(
    `SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.name_ur as category_name_ur,
      c.slug as category_slug, c.qualifies_for_free_delivery,
      c.minimum_order_for_free_delivery,
      p.subcategory_id, sc.name_en as subcategory_name,
      p.price, p.compare_at_price, p.cost_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.low_stock_threshold,
      p.stock_status, p.track_inventory,
      p.primary_image, p.images, p.short_description,
      p.description_ur, p.description_en, p.attributes,
      p.meta_title, p.meta_description, p.tags,
      p.is_active, p.is_featured, p.is_new_arrival,
      p.view_count, p.order_count,
      p.created_at, p.updated_at
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN categories sc ON p.subcategory_id = sc.id
    WHERE p.id = $1 AND p.is_active = TRUE`,
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Product not found');
  }

  // Increment view count
  await query(
    'UPDATE products SET view_count = view_count + 1 WHERE id = $1',
    [id]
  );

  successResponse(res, result.rows[0], 'Product retrieved successfully');
});

/**
 * Get product by slug
 * GET /api/products/slug/:slug
 */
export const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;

  const result = await query(
    `SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.name_ur as category_name_ur,
      c.slug as category_slug, c.qualifies_for_free_delivery,
      c.minimum_order_for_free_delivery,
      p.subcategory_id, sc.name_en as subcategory_name,
      p.price, p.compare_at_price, p.cost_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.low_stock_threshold,
      p.stock_status, p.track_inventory,
      p.primary_image, p.images, p.short_description,
      p.description_ur, p.description_en, p.attributes,
      p.meta_title, p.meta_description, p.tags,
      p.is_active, p.is_featured, p.is_new_arrival,
      p.view_count, p.order_count,
      p.created_at, p.updated_at
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN categories sc ON p.subcategory_id = sc.id
    WHERE p.slug = $1 AND p.is_active = TRUE`,
    [slug]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Product not found');
  }

  // Increment view count
  await query(
    'UPDATE products SET view_count = view_count + 1 WHERE id = $1',
    [result.rows[0].id]
  );

  successResponse(res, result.rows[0], 'Product retrieved successfully');
});

/**
 * Get featured products
 * GET /api/products/featured/list
 */
export const getFeaturedProducts = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 10 } = req.query;

  const result = await query(
    `SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name, c.slug as category_slug
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = TRUE
    ORDER BY p.is_featured DESC, p.order_count DESC, p.created_at DESC
    LIMIT $1`,
    [limit]
  );

  successResponse(res, result.rows, 'Featured products retrieved successfully');
});

/**
 * Get new arrivals
 * GET /api/products/new-arrivals
 */
export const getNewArrivals = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 10 } = req.query;

  const result = await query(
    `SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name, c.slug as category_slug
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = TRUE AND p.is_new_arrival = TRUE
    ORDER BY p.created_at DESC
    LIMIT $1`,
    [limit]
  );

  successResponse(res, result.rows, 'New arrivals retrieved successfully');
});

/**
 * Get related products
 * GET /api/products/:id/related
 */
export const getRelatedProducts = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { limit = 8 } = req.query;

  // Get product's category
  const productResult = await query(
    'SELECT category_id FROM products WHERE id = $1',
    [id]
  );

  if (productResult.rows.length === 0) {
    return notFoundResponse(res, 'Product not found');
  }

  const categoryId = productResult.rows[0].category_id;

  const result = await query(
    `SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.category_id = $1 
      AND p.id != $2 
      AND p.is_active = TRUE
    ORDER BY p.order_count DESC, p.created_at DESC
    LIMIT $3`,
    [categoryId, id, limit]
  );

  successResponse(res, result.rows, 'Related products retrieved successfully');
});

/**
 * Search products
 * GET /api/products/search?q=query
 */
export const searchProducts = asyncHandler(async (req: Request, res: Response) => {
  const { q, page = 1, limit = 20 } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return successResponse(res, [], 'Search query is empty');
  }

  // SECURITY FIX: Sanitize search term to prevent SQL injection
  const searchTerm = q
    .replace(/[%_\\]/g, '\\$&') // Escape SQL wildcards
    .trim()
    .substring(0, 100); // Limit search length

  // Use full-text search
  const result = await query(
    `SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name, c.slug as category_slug,
      ts_rank(
        to_tsvector('english', COALESCE(p.name_en, '') || ' ' || COALESCE(p.description_en, '')),
        plainto_tsquery('english', $1)
      ) as rank
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = TRUE
      AND (
        to_tsvector('english', COALESCE(p.name_en, '') || ' ' || COALESCE(p.description_en, ''))
        @@ plainto_tsquery('english', $1)
        OR p.name_ur ILIKE $2
        OR p.name_en ILIKE $2
      )
    ORDER BY rank DESC, p.order_count DESC
    LIMIT $3 OFFSET $4`,
    [searchTerm, `%${searchTerm}%`, limit, (parseInt(page as string) - 1) * parseInt(limit as string)]
  );

  successResponse(res, result.rows, 'Search results retrieved successfully');
});
