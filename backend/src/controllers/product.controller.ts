// ============================================================================
// PRODUCT CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, paginatedResponse } from '../utils/response';
import { resolvePublicCityId } from '../utils/cityScope';
import { tagSearchSql } from '../utils/productTags';

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

  const publicCityId = await resolvePublicCityId(req);
  if (publicCityId) {
    sql += ` AND p.city_id = $${paramIndex}`;
    params.push(publicCityId);
    paramIndex++;
  }

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
        OR ${tagSearchSql(paramIndex)}
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

  // Build sort clause — map each allowed sortBy value to a REAL column.
  // ("popularity" used to be interpolated verbatim; products has no such
  // column, so any sortBy=popularity request was a guaranteed SQL 500.)
  const SORT_COLUMNS: Record<string, string> = {
    created_at: 'created_at',
    price: 'price',
    name_en: 'name_en',
    name: 'name_en',
    popularity: 'order_count',
    view_count: 'view_count',
  };
  const allowedSortOrders = ['asc', 'desc'];
  const sortField = SORT_COLUMNS[sortBy as string] || 'created_at';
  const order = allowedSortOrders.includes((sortOrder as string)?.toLowerCase()) ? (sortOrder as string).toUpperCase() : 'DESC';

  // Get products
  const productsSql = `
    SELECT
      p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.slug as category_slug,
      p.subcategory_id, p.price, p.compare_at_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
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
  const publicCityId = await resolvePublicCityId(req);

  let sql = `
    SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.name_ur as category_name_ur,
      c.slug as category_slug, c.qualifies_for_free_delivery,
      c.minimum_order_for_free_delivery,
      p.subcategory_id, sc.name_en as subcategory_name,
      p.price, p.compare_at_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
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
    WHERE p.id = $1 AND p.is_active = TRUE`;
  const params: any[] = [id];
  if (publicCityId) {
    sql += ` AND p.city_id = $2`;
    params.push(publicCityId);
  }

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Product not found');
  }

  query('UPDATE products SET view_count = view_count + 1 WHERE id = $1', [id]).catch(
    () => undefined
  );

  successResponse(res, result.rows[0], 'Product retrieved successfully');
});

/**
 * Get product by slug
 * GET /api/products/slug/:slug
 */
export const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const publicCityId = await resolvePublicCityId(req);

  let sql = `
    SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.name_ur as category_name_ur,
      c.slug as category_slug, c.qualifies_for_free_delivery,
      c.minimum_order_for_free_delivery,
      p.subcategory_id, sc.name_en as subcategory_name,
      p.price, p.compare_at_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
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
    WHERE p.slug = $1 AND p.is_active = TRUE`;
  const params: any[] = [slug];
  if (publicCityId) {
    sql += ` AND p.city_id = $2`;
    params.push(publicCityId);
  }

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Product not found');
  }

  query(
    'UPDATE products SET view_count = view_count + 1 WHERE id = $1',
    [result.rows[0].id]
  ).catch(() => undefined);

  successResponse(res, result.rows[0], 'Product retrieved successfully');
});

/**
 * Get featured products
 * GET /api/products/featured/list
 */
export const getFeaturedProducts = asyncHandler(async (req: Request, res: Response) => {
  const requested = parseInt((req.query.limit as string) || '20', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 20;
  const publicCityId = await resolvePublicCityId(req);

  let sql = `
    SELECT
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name, c.slug as category_slug
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = TRUE AND p.is_featured = TRUE`;
  const params: any[] = [];
  if (publicCityId) {
    sql += ` AND p.city_id = $1`;
    params.push(publicCityId);
  }
  sql += ` ORDER BY p.order_count DESC, p.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

  successResponse(res, result.rows, 'Featured products retrieved successfully');
});

/**
 * Get new arrivals
 * GET /api/products/new-arrivals
 */
export const getNewArrivals = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 10 } = req.query;
  const publicCityId = await resolvePublicCityId(req);

  let sql = `
    SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name, c.slug as category_slug
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = TRUE AND p.is_new_arrival = TRUE`;
  const params: any[] = [];
  if (publicCityId) {
    sql += ` AND p.city_id = $1`;
    params.push(publicCityId);
  }
  sql += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

  successResponse(res, result.rows, 'New arrivals retrieved successfully');
});

/**
 * Get related products
 * GET /api/products/:id/related
 */
export const getRelatedProducts = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { limit = 8 } = req.query;
  const publicCityId = await resolvePublicCityId(req);

  const productResult = await query(
    'SELECT category_id FROM products WHERE id = $1',
    [id]
  );

  if (productResult.rows.length === 0) {
    return notFoundResponse(res, 'Product not found');
  }

  const categoryId = productResult.rows[0].category_id;

  let sql = `
    SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name, c.slug as category_slug
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.category_id = $1 
      AND p.id != $2 
      AND p.is_active = TRUE`;
  const params: any[] = [categoryId, id];
  if (publicCityId) {
    sql += ` AND p.city_id = $3`;
    params.push(publicCityId);
  }
  sql += ` ORDER BY p.order_count DESC, p.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

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

  const searchTerm = q
    .replace(/[%_\\]/g, '\\$&')
    .trim()
    .substring(0, 100);

  const publicCityId = await resolvePublicCityId(req);
  let cityClause = '';
  const params: any[] = [searchTerm, `%${searchTerm}%`];
  if (publicCityId) {
    cityClause = ` AND p.city_id = $${params.length + 1}`;
    params.push(publicCityId);
  }

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(
    `SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name, c.slug as category_slug,
      ts_rank(
        to_tsvector('english', COALESCE(p.name_en, '') || ' ' || COALESCE(p.description_en, '') || ' ' || array_to_string(COALESCE(p.tags, ARRAY[]::text[]), ' ')),
        plainto_tsquery('english', $1)
      ) as rank
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = TRUE
      AND (
        to_tsvector('english', COALESCE(p.name_en, '') || ' ' || COALESCE(p.description_en, '') || ' ' || array_to_string(COALESCE(p.tags, ARRAY[]::text[]), ' '))
        @@ plainto_tsquery('english', $1)
        OR p.name_ur ILIKE $2
        OR p.name_en ILIKE $2
        OR ${tagSearchSql(2)}
      )${cityClause}
    ORDER BY rank DESC, p.order_count DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  successResponse(res, result.rows, 'Search results retrieved successfully');
});
