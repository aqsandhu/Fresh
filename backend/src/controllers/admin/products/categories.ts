// Categories — moved from products.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query, withTransaction } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import {
  successResponse,
  notFoundResponse,
  errorResponse,
  createdResponse,
} from '../../../utils/response';
import { generateSlug } from '../../../utils/validators';
import logger from '../../../utils/logger';
import {
  resolveCityScope,
  cityIdClause,
  cityRowInScope,
  requireCityScope,
} from '../../../utils/cityScope';
import { hasQualityCatalogColumns } from '../../../config/productSchema';
import { hasCatalogV2Columns } from '../../../config/catalogV2Schema';
import { hasOcpTables } from '../../../config/ocpSchema';
import { toBool } from './shared';

export const getAdminCategories = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const params: unknown[] = [];
  let paramIndex = 1;
  let whereSql = 'WHERE 1=1';
  const catCity = cityIdClause(scope, 'c', params, paramIndex);
  whereSql += catCity.sql;
  paramIndex = catCity.nextIndex;

  // Unified catalog: one set of categories. The "also for restaurants" flag is
  // just an attribute on each category now (no consumer/restaurant tab split).
  const availCol = (await hasQualityCatalogColumns()) ? 'c.available_for_restaurants,' : '';

  const result = await query(
    `SELECT
      c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url,
      c.parent_id, c.display_order, c.is_active, c.city_id, ${availCol}
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

  const cols = [
    'name_ur', 'name_en', 'slug', 'icon_url', 'image_url',
    'parent_id', 'display_order', 'is_active',
    'qualifies_for_free_delivery', 'created_by', 'city_id',
  ];
  const vals: unknown[] = [
    nameUr, nameEn, slug, icon || null, imageUrl,
    parent_id || null, display_order || 0,
    is_active !== undefined ? is_active : true,
    qualifiesFreeDelivery, req.user?.id, scope.cityId,
  ];
  // "Also available for restaurants" — additive flag (gated until migration 34).
  if (await hasQualityCatalogColumns()) {
    cols.push('available_for_restaurants');
    vals.push(toBool(req.body.available_for_restaurants));
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

  const result = await query(
    `INSERT INTO categories (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    vals
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
    'availableForRestaurants': 'available_for_restaurants',
  };

  const allowedFields = [
    'name_ur', 'name_en', 'icon_url', 'image_url',
    'parent_id', 'display_order', 'is_active',
    'qualifies_for_free_delivery',
  ];
  const booleanFields = new Set(['is_active', 'qualifies_for_free_delivery', 'available_for_restaurants']);
  if (await hasQualityCatalogColumns()) {
    allowedFields.push('available_for_restaurants');
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
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

  // Inactive products are hard-deleted below — apply the same guard philosophy
  // as the single-product purge (deleteProduct): refuse when any product in the
  // category still has stock, reservations, or business history. Only truly
  // empty inactive rows may be removed.
  const qualityReady = await hasQualityCatalogColumns();
  const catalogV2Ready = await hasCatalogV2Columns();
  const ocpReady = await hasOcpTables();
  const onHandSql = qualityReady
    ? 'COALESCE(SUM(stock_quantity + stock_quantity_b + stock_quantity_c), 0)'
    : 'COALESCE(SUM(stock_quantity), 0)';
  const reservedSql = catalogV2Ready
    ? 'COALESCE(SUM(reserved_quantity + reserved_quantity_b + reserved_quantity_c), 0)'
    : '0';
  const [stockTotals, orderItems, movements, purchases, ocpStock, ocpMoves, ocpRequestItems] = await Promise.all([
    query(`SELECT ${onHandSql} AS on_hand, ${reservedSql} AS reserved FROM products WHERE category_id = $1`, [id]),
    query(
      'SELECT COUNT(*)::int AS count FROM order_items WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)',
      [id]
    ),
    catalogV2Ready
      ? query('SELECT COUNT(*)::int AS count FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)', [id])
      : Promise.resolve({ rows: [{ count: 0 }] } as any),
    query('SELECT COUNT(*)::int AS count FROM stock_purchases WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)', [id]).catch(() => ({ rows: [{ count: 0 }] } as any)),
    ocpReady
      ? query('SELECT COUNT(*)::int AS count FROM ocp_stock WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)', [id])
      : Promise.resolve({ rows: [{ count: 0 }] } as any),
    ocpReady
      ? query('SELECT COUNT(*)::int AS count FROM ocp_stock_movements WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)', [id])
      : Promise.resolve({ rows: [{ count: 0 }] } as any),
    ocpReady
      ? query('SELECT COUNT(*)::int AS count FROM ocp_stock_request_items WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)', [id])
      : Promise.resolve({ rows: [{ count: 0 }] } as any),
  ]);

  const blockers = {
    onHand: parseFloat(stockTotals.rows[0]?.on_hand || 0) || 0,
    reserved: parseFloat(stockTotals.rows[0]?.reserved || 0) || 0,
    orderItems: Number(orderItems.rows[0]?.count || 0),
    stockMovements: Number(movements.rows[0]?.count || 0),
    stockPurchases: Number(purchases.rows[0]?.count || 0),
    ocpStockRows: Number(ocpStock.rows[0]?.count || 0),
    ocpMovements: Number(ocpMoves.rows[0]?.count || 0),
    ocpStockRequestItems: Number(ocpRequestItems.rows[0]?.count || 0),
  };
  if (Object.values(blockers).some((value) => Math.abs(Number(value)) > 0)) {
    return errorResponse(
      res,
      'Cannot delete category: its inactive products still have stock or business history. Purge them individually (super admin) once empty.',
      400,
      blockers
    );
  }

  // Clean up inactive products (and their cart rows) so the category FK
  // doesn't prevent deletion — this is what admins expect when the UI shows
  // "0 products". The guard above proves these rows carry no stock or history.
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
