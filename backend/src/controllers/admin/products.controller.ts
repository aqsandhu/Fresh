// ============================================================================
// ADMIN CONTROLLER — products & categories
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse, paginatedResponse } from '../../utils/response';
import { generateSlug } from '../../utils/validators';
import { deleteFileFromStorage } from '../../config/storage';
import logger from '../../utils/logger';
import {
  resolveCityScope,
  cityIdClause,
  cityRowInScope,
  requireCityScope,
} from '../../utils/cityScope';
import { parseTagsInput, tagSearchSql } from '../../utils/productTags';
import { hasVariableWeightColumns, hasUnitToggleColumns } from '../../config/productSchema';

/** Default Urdu popup shown when a customer adds a variable-weight product. */
export const DEFAULT_VARIABLE_WEIGHT_NOTE =
  'آرڈر پیک کرتے ہوئے اس پروڈکٹ کا وزن آپ کے آرڈر سے کم یا زیادہ ہو سکتا ہے۔ ایسی صورت میں آپ کا آرڈر اور اس کی رقم آپ کے اصل وزن کے مطابق تبدیل ہو جائے گی۔';

function toBool(v: unknown): boolean {
  return v === true || v === 'true' || v === '1' || v === 1;
}

/** Boolean coercion that keeps the default when the field is absent. */
function toBoolOr(v: unknown, def: boolean): boolean {
  if (v === undefined || v === null || v === '') return def;
  return toBool(v);
}

export const getAdminProducts = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const {
    category, search, page = 1, limit = 20,
    sortBy = 'created_at', sortOrder = 'desc',
  } = req.query;

  let sql = `FROM products p JOIN categories c ON p.category_id = c.id WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  if (category) {
    sql += ` AND p.category_id = $${paramIndex}`;
    params.push(category); paramIndex++;
  }
  if (search && typeof search === 'string') {
    const sanitizedSearch = search.replace(/[%_\\]/g, '\\$&').trim().substring(0, 100);
    if (sanitizedSearch.length > 0) {
      sql += ` AND (
        p.name_en ILIKE $${paramIndex}
        OR p.name_ur ILIKE $${paramIndex}
        OR ${tagSearchSql(paramIndex)}
      )`;
      params.push(`%${sanitizedSearch}%`); paramIndex++;
    }
  }
  if (req.query.is_active !== undefined) {
    const raw = req.query.is_active;
    const active = raw === 'true' || raw === '1';
    sql += ` AND p.is_active = $${paramIndex}`;
    params.push(active); paramIndex++;
  }

  const productCity = cityIdClause(scope, 'p', params, paramIndex);
  sql += productCity.sql;
  paramIndex = productCity.nextIndex;

  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  const allowedSortFields = ['created_at', 'price', 'name_en', 'stock_quantity'];
  const allowedSortOrders = ['asc', 'desc'];
  const sortField = allowedSortFields.includes(sortBy as string) ? sortBy : 'created_at';
  const order = allowedSortOrders.includes((sortOrder as string)?.toLowerCase()) ? (sortOrder as string).toUpperCase() : 'DESC';

  const listToggleCols = (await hasUnitToggleColumns()) ? 'p.allow_half_kg, p.allow_quarter_kg,' : '';
  const productsSql = `SELECT p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode, p.category_id, c.name_en as category_name, c.slug as category_slug, c.qualifies_for_free_delivery, p.subcategory_id, p.price, p.compare_at_price, p.cost_price, p.half_kg_price, p.quarter_kg_price, p.half_dozen_price, ${listToggleCols} p.unit_type, p.unit_value, p.stock_quantity, p.stock_status, p.primary_image, p.images, p.short_description, p.description_ur, p.description_en, p.is_active, p.is_featured, p.is_new_arrival, p.view_count, p.order_count, p.created_at, p.updated_at ${sql} ORDER BY p.${sortField} ${order} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(productsSql, params);
  paginatedResponse(res, result.rows, parseInt(page as string), parseInt(limit as string), total, 'Products retrieved successfully');
});

/**
 * Get product by ID (admin)
 * GET /api/admin/products/:id
 */

export const getAdminProductById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);
  const varCols = (await hasVariableWeightColumns())
    ? 'p.is_variable_weight, p.variable_weight_note,'
    : '';
  const toggleCols = (await hasUnitToggleColumns())
    ? 'p.allow_half_kg, p.allow_quarter_kg,'
    : '';
  const result = await query(
    `SELECT p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.slug as category_slug,
      p.subcategory_id, p.price, p.compare_at_price, p.cost_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
      ${varCols}
      ${toggleCols}
      p.unit_type, p.unit_value, p.stock_quantity, p.low_stock_threshold,
      p.stock_status, p.track_inventory, p.primary_image, p.images,
      p.short_description, p.description_ur, p.description_en,
      p.attributes, p.meta_title, p.meta_description, p.tags,
      p.is_active, p.is_featured, p.is_new_arrival, p.city_id,
      p.view_count, p.order_count, p.created_at, p.updated_at
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.id = $1`, [id]
  );
  if (result.rows.length === 0 || !cityRowInScope(scope, result.rows[0].city_id)) {
    return notFoundResponse(res, 'Product not found');
  }
  successResponse(res, result.rows[0], 'Product retrieved successfully');
});

/**
 * Create product
 * POST /api/admin/products
 */

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const scopeErr = requireCityScope(scope);
  if (scopeErr) {
    return errorResponse(res, scopeErr, 400);
  }

  const {
    name_ur,
    name_en,
    category_id,
    subcategory_id,
    price,
    compare_at_price,
    half_kg_price,
    quarter_kg_price,
    half_dozen_price,
    unit_type,
    unit_value,
    stock_quantity,
    description_ur,
    description_en,
    is_featured,
    is_new_arrival,
    tags,
    is_variable_weight,
    variable_weight_note,
    allow_half_kg,
    allow_quarter_kg,
  } = req.body;

  // Empty-string values come through multipart forms — coerce them to null
  // so the DB column stores NULL ("derive from price") instead of 0.
  const normPrice = (v: any) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const halfKg = normPrice(half_kg_price);
  const quarterKg = normPrice(quarter_kg_price);
  const halfDozen = normPrice(half_dozen_price);
  const productTags = parseTagsInput(tags);

  const slug = generateSlug(name_en);

  // Check if slug exists in this city
  const existingResult = await query(
    'SELECT id FROM products WHERE slug = $1 AND city_id = $2',
    [slug, scope.cityId]
  );
  if (existingResult.rows.length > 0) {
    return errorResponse(res, 'Product with similar name already exists', 409);
  }

  // Handle uploaded images. The upload middleware has already pushed each
  // file to Supabase Storage and attached the public URL on `f.url`.
  const uploadedFiles = req.files as Express.Multer.File[] | undefined;
  let primaryImage: string | null = null;
  let images: string[] = [];

  if (uploadedFiles && uploadedFiles.length > 0) {
    images = uploadedFiles.map(f => f.url || '').filter(Boolean);
    primaryImage = images[0] || null;
  }

  const varWeightReady = await hasVariableWeightColumns();
  const isVarWeight = toBool(is_variable_weight);
  const varNote = isVarWeight
    ? (typeof variable_weight_note === 'string' && variable_weight_note.trim()
        ? variable_weight_note.trim()
        : DEFAULT_VARIABLE_WEIGHT_NOTE)
    : null;

  const result = varWeightReady
    ? await query(
        `INSERT INTO products (
          name_ur, name_en, slug, category_id, subcategory_id,
          price, compare_at_price,
          half_kg_price, quarter_kg_price, half_dozen_price,
          unit_type, unit_value, stock_quantity,
          description_ur, description_en, is_featured, is_new_arrival,
          primary_image, images, city_id, tags,
          is_variable_weight, variable_weight_note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        RETURNING *`,
        [
          name_ur || name_en, name_en, slug, category_id, subcategory_id,
          price, compare_at_price,
          halfKg, quarterKg, halfDozen,
          unit_type, unit_value, stock_quantity || 0,
          description_ur || null, description_en || null, is_featured || false, is_new_arrival || false,
          primaryImage, images.length > 0 ? images : null,
          scope.cityId,
          productTags.length > 0 ? productTags : null,
          isVarWeight, varNote,
        ]
      )
    : await query(
        `INSERT INTO products (
          name_ur, name_en, slug, category_id, subcategory_id,
          price, compare_at_price,
          half_kg_price, quarter_kg_price, half_dozen_price,
          unit_type, unit_value, stock_quantity,
          description_ur, description_en, is_featured, is_new_arrival,
          primary_image, images, city_id, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *`,
        [
          name_ur || name_en, name_en, slug, category_id, subcategory_id,
          price, compare_at_price,
          halfKg, quarterKg, halfDozen,
          unit_type, unit_value, stock_quantity || 0,
          description_ur || null, description_en || null, is_featured || false, is_new_arrival || false,
          primaryImage, images.length > 0 ? images : null,
          scope.cityId,
          productTags.length > 0 ? productTags : null,
        ]
      );

  // Half/quarter-kg availability toggles (migration 25). Stored via a follow-up
  // update so the two INSERT branches above stay readable. Default TRUE keeps
  // the existing behaviour when the admin form doesn't send the fields.
  if (await hasUnitToggleColumns()) {
    const allowHalf = toBoolOr(allow_half_kg, true);
    const allowQuarter = toBoolOr(allow_quarter_kg, true);
    await query(
      `UPDATE products SET allow_half_kg = $1, allow_quarter_kg = $2 WHERE id = $3`,
      [allowHalf, allowQuarter, result.rows[0].id]
    );
    result.rows[0].allow_half_kg = allowHalf;
    result.rows[0].allow_quarter_kg = allowQuarter;
  }

  logger.info('Product created', { productId: result.rows[0].id, createdBy: req.user?.id });

  createdResponse(res, result.rows[0], 'Product created successfully');
});

/**
 * Update product
 * PUT /api/admin/products/:id
 */

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  // City isolation: a scoped admin may only edit products in their own city.
  const scope = await resolveCityScope(req);
  const existing = await query('SELECT city_id FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0 || !cityRowInScope(scope, existing.rows[0].city_id)) {
    return notFoundResponse(res, 'Product not found');
  }
  const productCityId = existing.rows[0].city_id;

  // Build update query
  const varWeightReady = await hasVariableWeightColumns();
  const unitToggleReady = await hasUnitToggleColumns();
  const allowedFields = [
    'name_ur', 'name_en', 'category_id', 'subcategory_id',
    'price', 'compare_at_price',
    'half_kg_price', 'quarter_kg_price', 'half_dozen_price',
    'unit_type', 'unit_value',
    'stock_quantity', 'description_ur', 'description_en',
    'is_active', 'is_featured', 'is_new_arrival', 'tags',
    // Only writable once migration 23 has added the columns.
    ...(varWeightReady ? ['is_variable_weight', 'variable_weight_note'] : []),
    // Only writable once migration 25 has added the columns.
    ...(unitToggleReady ? ['allow_half_kg', 'allow_quarter_kg'] : []),
  ];
  const booleanFields = new Set([
    'is_active', 'is_featured', 'is_new_arrival', 'is_variable_weight',
    'allow_half_kg', 'allow_quarter_kg',
  ]);
  // These columns must always serialize as NULL when the admin clears them.
  const nullableNumberFields = new Set([
    'compare_at_price', 'half_kg_price', 'quarter_kg_price', 'half_dozen_price',
  ]);

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      let normalised: any = value;
      if (key === 'tags') {
        normalised = parseTagsInput(value);
        normalised = normalised.length > 0 ? normalised : null;
      } else if (key === 'variable_weight_note') {
        normalised = typeof value === 'string' && value.trim() ? value.trim() : null;
      } else if (booleanFields.has(key)) {
        normalised = toBool(value);
      } else if (nullableNumberFields.has(key)) {
        if (value === '' || value === null || value === undefined) {
          normalised = null;
        } else {
          const n = parseFloat(String(value));
          normalised = Number.isFinite(n) && n > 0 ? n : null;
        }
      }
      setClauses.push(`${key} = $${paramIndex++}`);
      values.push(normalised);
    }
  }

  // Handle uploaded images — Supabase URLs already attached to f.url.
  const uploadedFiles = req.files as Express.Multer.File[] | undefined;

  if (uploadedFiles && uploadedFiles.length > 0) {
    const images = uploadedFiles.map(f => f.url || '').filter(Boolean);
    if (images.length > 0) {
      setClauses.push(`primary_image = $${paramIndex++}`);
      values.push(images[0]);
      setClauses.push(`images = $${paramIndex++}`);
      values.push(images);
    }
  }

  if (setClauses.length === 0) {
    return errorResponse(res, 'No valid fields to update', 400);
  }

  // If name_en is being updated, update slug too — same per-city collision
  // check as createProduct, so a duplicate name is a clean 409 instead of a
  // unique-constraint 500.
  if (updates.name_en) {
    const newSlug = generateSlug(updates.name_en);
    const slugClash = await query(
      'SELECT id FROM products WHERE slug = $1 AND city_id IS NOT DISTINCT FROM $2 AND id != $3',
      [newSlug, productCityId, id]
    );
    if (slugClash.rows.length > 0) {
      return errorResponse(res, 'Product with similar name already exists', 409);
    }
    setClauses.push(`slug = $${paramIndex++}`);
    values.push(newSlug);
  }

  values.push(id);

  const result = await query(
    `UPDATE products SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Product not found');
  }

  logger.info('Product updated', { productId: id, updatedBy: req.user?.id });

  successResponse(res, result.rows[0], 'Product updated successfully');
});

/**
 * Delete product
 * DELETE /api/admin/products/:id              -> permanent delete (default)
 * DELETE /api/admin/products/:id?soft=true    -> soft delete (is_active = FALSE)
 *
 * Permanent delete removes the product row and its Supabase images. Order
 * history is preserved: order_items keeps its own snapshot (product_name,
 * product_image, prices) and order_items.product_id is set to NULL by the
 * FK (migration 19) — past orders keep showing the item exactly as sold.
 */

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const soft = req.query.soft === 'true' || req.query.soft === '1';

  // City isolation: a scoped admin may only delete products in their own city.
  const scope = await resolveCityScope(req);
  const existing = await query(
    'SELECT city_id, primary_image, images FROM products WHERE id = $1',
    [id]
  );
  if (existing.rows.length === 0 || !cityRowInScope(scope, existing.rows[0].city_id)) {
    return notFoundResponse(res, 'Product not found');
  }

  if (soft) {
    await query(
      'UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [id]
    );
    logger.info('Product soft-deleted', { productId: id, deletedBy: req.user?.id });
    return successResponse(res, null, 'Product deactivated');
  }

  // cart_items also reference products — remove those rows first or the
  // DELETE fails with an FK error that looked like "delete didn't work".
  // order_items rows survive: their product_id FK is ON DELETE SET NULL.
  await withTransaction(async (client) => {
    await client.query('DELETE FROM cart_items WHERE product_id = $1', [id]);
    await client.query('DELETE FROM products WHERE id = $1', [id]);
  });

  const allUrls = [
    ...(existing.rows[0].primary_image ? [existing.rows[0].primary_image] : []),
    ...(existing.rows[0].images ?? []),
  ];
  for (const url of allUrls) {
    // Keep any image that an order snapshot still points at — deleting it
    // would blank the picture on historical orders.
    const inOrders = await query(
      'SELECT 1 FROM order_items WHERE product_image = $1 LIMIT 1',
      [url]
    );
    if (inOrders.rows.length > 0) continue;
    const m = String(url).match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    if (m) await deleteFileFromStorage(m[1]);
  }

  logger.info('Product hard-deleted', { productId: id, deletedBy: req.user?.id });
  successResponse(res, null, 'Product permanently deleted');
});

/**
 * Toggle product active/inactive (without losing the row).
 * PATCH /api/admin/products/:id/toggle-active
 */

export const toggleProductActive = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);
  const existing = await query('SELECT city_id FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0 || !cityRowInScope(scope, existing.rows[0].city_id)) {
    return notFoundResponse(res, 'Product not found');
  }
  const result = await query(
    'UPDATE products SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active',
    [id]
  );
  successResponse(res, result.rows[0], `Product ${result.rows[0].is_active ? 'activated' : 'deactivated'}`);
});

/**
 * Move one or more products to a different category in a single transaction.
 * PATCH /api/admin/products/move-category
 * Body: { product_ids: string[], category_id: string }
 *
 * Lets the admin reorganise the catalog without editing every product
 * individually. Verifies the target category exists and is active so we
 * don't move products into a hidden bucket by mistake.
 */

export const moveProductsCategory = asyncHandler(async (req: Request, res: Response) => {
  const { product_ids, category_id } = req.body as { product_ids?: string[]; category_id?: string };
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return errorResponse(res, 'product_ids must be a non-empty array', 400);
  }
  if (!category_id) return errorResponse(res, 'category_id is required', 400);

  const scope = await resolveCityScope(req);

  const cat = await query('SELECT id, is_active, city_id FROM categories WHERE id = $1', [category_id]);
  if (cat.rows.length === 0 || !cityRowInScope(scope, cat.rows[0].city_id)) {
    return errorResponse(res, 'Target category not found', 404);
  }
  if (cat.rows[0].is_active === false) {
    return errorResponse(res, 'Target category is inactive — activate it before moving products into it', 400);
  }

  // City isolation: the UPDATE itself is scoped so a city admin can't move
  // another city's products even by guessing IDs.
  const params: unknown[] = [category_id, product_ids];
  let scopeSql = '';
  if (!scope.unrestricted && scope.cityId && scope.dbReady) {
    params.push(scope.cityId);
    scopeSql = ' AND city_id = $3';
  }
  const result = await query(
    `UPDATE products SET category_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])${scopeSql} RETURNING id`,
    params
  );

  logger.info('Products moved to category', {
    moved: result.rowCount,
    categoryId: category_id,
    by: req.user?.id,
  });
  successResponse(res, { moved: result.rowCount }, `${result.rowCount} product(s) moved`);
});

/**
 * Create WhatsApp order
 * POST /api/admin/whatsapp-orders
 */

export const getAdminCategories = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const params: unknown[] = [];
  let paramIndex = 1;
  let whereSql = 'WHERE 1=1';
  const catCity = cityIdClause(scope, 'c', params, paramIndex);
  whereSql += catCity.sql;
  paramIndex = catCity.nextIndex;

  const result = await query(
    `SELECT 
      c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url,
      c.parent_id, c.display_order, c.is_active, c.city_id,
      c.qualifies_for_free_delivery, c.minimum_order_for_free_delivery,
      COUNT(p.id) FILTER (WHERE p.is_active = TRUE) as product_count,
      COUNT(p.id) as total_product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id
    ${whereSql}
    GROUP BY c.id
    ORDER BY c.display_order ASC, c.name_en ASC`,
    params
  );

  successResponse(res, result.rows, 'Categories retrieved successfully');
});

/**
 * Create category
 * POST /api/admin/categories
 */

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const scopeErr = requireCityScope(scope);
  if (scopeErr) {
    return errorResponse(res, scopeErr, 400);
  }

  // Frontend sends camelCase field names
  const nameEn = req.body.nameEn || req.body.name_en;
  const nameUr = req.body.nameUr || req.body.name_ur;
  const {
    icon,
    parent_id,
    display_order,
    is_active,
    qualifies_for_free_delivery,
  } = req.body;

  // Validation
  if (!nameEn || !nameUr) {
    return errorResponse(res, 'Name (English) and Name (Urdu) are required', 400);
  }

  // Default OFF: a category only counts toward the free-delivery threshold when
  // the admin explicitly ticks the box.
  const qualifiesFreeDelivery = toBool(qualifies_for_free_delivery);

  let slug = generateSlug(nameEn);
  if (!slug) {
    slug = `category-${Date.now()}`;
  }

  // Check if slug exists in this city — append suffix on collision
  const existingResult = await query(
    'SELECT id FROM categories WHERE slug = $1 AND city_id = $2',
    [slug, scope.cityId]
  );
  if (existingResult.rows.length > 0) {
    slug = `${slug}-${Date.now()}`;
  }

  // Handle uploaded image — Supabase URL on req.file.url.
  const imageUrl: string | null = req.file?.url || null;

  if (req.file && !imageUrl) {
    return errorResponse(
      res,
      'Category image upload failed. Verify Supabase Storage bucket "uploads" exists (Public) and SUPABASE_SERVICE_ROLE_KEY is set on Render.',
      502
    );
  }

  const result = await query(
    `INSERT INTO categories (
      name_ur, name_en, slug, icon_url, image_url,
      parent_id, display_order, is_active,
      qualifies_for_free_delivery,
      created_by, city_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      nameUr, nameEn, slug, icon || null, imageUrl,
      parent_id || null, display_order || 0,
      is_active !== undefined ? is_active : true,
      qualifiesFreeDelivery,
      req.user?.id,
      scope.cityId,
    ]
  );

  logger.info('Category created', { categoryId: result.rows[0].id, createdBy: req.user?.id, imageUrl });

  createdResponse(res, result.rows[0], 'Category created successfully');
});

/**
 * Update category
 * PUT /api/admin/categories/:id
 */

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  // City isolation: a scoped admin may only edit categories in their own city.
  const scope = await resolveCityScope(req);
  const existingCat = await query('SELECT city_id FROM categories WHERE id = $1', [id]);
  if (existingCat.rows.length === 0 || !cityRowInScope(scope, existingCat.rows[0].city_id)) {
    return notFoundResponse(res, 'Category not found');
  }

  // Field name mapping from camelCase (frontend) to snake_case (database)
  const fieldMapping: Record<string, string> = {
    'nameEn': 'name_en',
    'nameUr': 'name_ur',
    'icon': 'icon_url',
    'imageUrl': 'image_url',
    'parentId': 'parent_id',
    'displayOrder': 'display_order',
    'isActive': 'is_active',
    'qualifiesForFreeDelivery': 'qualifies_for_free_delivery',
  };

  const allowedFields = [
    'name_ur', 'name_en', 'icon_url', 'image_url',
    'parent_id', 'display_order', 'is_active',
    'qualifies_for_free_delivery',
  ];
  const booleanFields = new Set(['is_active', 'qualifies_for_free_delivery']);

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Process body fields with mapping
  for (const [key, value] of Object.entries(updates)) {
    // Map camelCase to snake_case if needed
    const dbField = fieldMapping[key] || key;

    if (allowedFields.includes(dbField)) {
      setClauses.push(`${dbField} = $${paramIndex++}`);
      values.push(booleanFields.has(dbField) ? toBool(value) : value);
    }
  }

  // Handle uploaded image — Supabase URL on req.file.url.
  if (req.file && !req.file.url) {
    return errorResponse(
      res,
      'Category image upload failed. Verify Supabase Storage bucket "uploads" exists (Public) and SUPABASE_SERVICE_ROLE_KEY is set on Render.',
      502
    );
  }
  if (req.file?.url) {
    setClauses.push(`image_url = $${paramIndex++}`);
    values.push(req.file.url);
  }

  if (setClauses.length === 0) {
    return errorResponse(res, 'No valid fields to update', 400);
  }

  // If name_en is being updated (either directly or via nameEn), also update slug.
  // Slugs are unique PER CITY (the same "Chicken"/"Fruits"/"Sabzi" exists in
  // every city), so the collision check must be scoped to this category's city —
  // otherwise editing a shared category falsely reports a duplicate.
  const nameEnValue = updates.name_en || updates.nameEn;
  if (nameEnValue) {
    const newSlug = generateSlug(nameEnValue);
    const categoryCityId = existingCat.rows[0].city_id;
    const existingResult = await query(
      'SELECT id FROM categories WHERE slug = $1 AND id != $2 AND city_id IS NOT DISTINCT FROM $3',
      [newSlug, id, categoryCityId]
    );
    if (existingResult.rows.length > 0) {
      return errorResponse(res, 'Category with similar name already exists', 409);
    }
    setClauses.push(`slug = $${paramIndex++}`);
    values.push(newSlug);
  }

  values.push(id);

  const result = await query(
    `UPDATE categories SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Category not found');
  }

  logger.info('Category updated', { categoryId: id, updatedBy: req.user?.id });

  successResponse(res, result.rows[0], 'Category updated successfully');
});

/**
 * Toggle category active/inactive — visibility flip without deleting.
 * PATCH /api/admin/categories/:id/toggle-active
 */

export const toggleCategoryActive = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);
  const existingCat = await query('SELECT city_id FROM categories WHERE id = $1', [id]);
  if (existingCat.rows.length === 0 || !cityRowInScope(scope, existingCat.rows[0].city_id)) {
    return notFoundResponse(res, 'Category not found');
  }
  const result = await query(
    'UPDATE categories SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active',
    [id]
  );
  if (result.rows.length === 0) return errorResponse(res, 'Category not found', 404);
  successResponse(
    res,
    result.rows[0],
    `Category ${result.rows[0].is_active ? 'activated' : 'deactivated'}`
  );
});

/**
 * Delete category (hard delete)
 * DELETE /api/admin/categories/:id
 */

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const scope = await resolveCityScope(req);
  const categoryCheck = await query('SELECT id, city_id FROM categories WHERE id = $1', [id]);
  if (categoryCheck.rows.length === 0 || !cityRowInScope(scope, categoryCheck.rows[0].city_id)) {
    return notFoundResponse(res, 'Category not found');
  }

  // Active products must be moved or deactivated first — the admin UI shows
  // only this count, so blocking here matches what the user sees.
  const activeProductsResult = await query(
    'SELECT COUNT(*)::int AS cnt FROM products WHERE category_id = $1 AND is_active = TRUE',
    [id]
  );
  if (activeProductsResult.rows[0].cnt > 0) {
    return errorResponse(
      res,
      'Cannot delete category with active products. Move or deactivate products first.',
      400
    );
  }

  const childResult = await query(
    'SELECT COUNT(*)::int AS cnt FROM categories WHERE parent_id = $1',
    [id]
  );
  if (childResult.rows[0].cnt > 0) {
    return errorResponse(res, 'Cannot delete category with subcategories. Please delete subcategories first.', 400);
  }

  // Clean up inactive products (and their cart rows) so the category FK
  // doesn't prevent deletion — this is what admins expect when the UI shows
  // "0 products". Order history is safe: order_items snapshots the product
  // and its product_id FK is ON DELETE SET NULL (migration 19).
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM cart_items
       WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)`,
      [id]
    );
    await client.query('DELETE FROM products WHERE category_id = $1', [id]);
    await client.query('DELETE FROM categories WHERE id = $1', [id]);
  });

  logger.info('Category deleted', { categoryId: id, deletedBy: req.user?.id });
  successResponse(res, null, 'Category deleted successfully');
});

/**
 * Get all customers
 * GET /api/admin/customers
 */
