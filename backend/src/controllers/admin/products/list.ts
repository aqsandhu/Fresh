// Product list and one product — moved from products.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { successResponse, notFoundResponse, paginatedResponse } from '../../../utils/response';
import { parsePagination } from '../../../utils/validators';
import { resolveCityScope, cityIdClause, cityRowInScope } from '../../../utils/cityScope';
import { tagSearchSql } from '../../../utils/productTags';
import { hasVariableWeightColumns, hasUnitToggleColumns, hasQualityCatalogColumns } from '../../../config/productSchema';
import { hasCatalogV2Columns } from '../../../config/catalogV2Schema';
import { CATALOG_V2_READ_COLS } from './shared';

export const getAdminProducts = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const {
    category, search, page = 1, limit = 20,
    sortBy = 'created_at', sortOrder = 'desc',
  } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit);

  let sql = `FROM products p JOIN categories c ON p.category_id = c.id WHERE 1=1`;
  const params: unknown[] = [];
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

  // Unified catalog: one set of products (no consumer/restaurant tab split).
  const qualityReady = await hasQualityCatalogColumns();

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
  const listQualityCols = qualityReady
    ? 'p.price_b, p.price_c, p.stock_quantity_b, p.stock_quantity_c, p.available_for_restaurants, p.restaurant_price_a, p.restaurant_price_b, p.restaurant_price_c,'
    : '';
  const listCatalogV2Cols = (await hasCatalogV2Columns()) ? CATALOG_V2_READ_COLS : '';
  const productsSql = `SELECT p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode, p.category_id, c.name_en as category_name, c.slug as category_slug, c.qualifies_for_free_delivery, p.subcategory_id, p.price, p.compare_at_price, p.cost_price, p.half_kg_price, p.quarter_kg_price, p.half_dozen_price, ${listToggleCols} ${listQualityCols} ${listCatalogV2Cols} p.unit_type, p.unit_value, p.stock_quantity, p.stock_status, p.primary_image, p.images, p.short_description, p.description_ur, p.description_en, p.is_active, p.is_featured, p.is_new_arrival, p.view_count, p.order_count, p.created_at, p.updated_at ${sql} ORDER BY p.${sortField} ${order}, p.id LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(safeLimit, offset);

  const result = await query(productsSql, params);
  paginatedResponse(res, result.rows, safePage, safeLimit, total, 'Products retrieved successfully');
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
  const qualityCols = (await hasQualityCatalogColumns())
    ? `p.price_b, p.price_c, p.stock_quantity_b, p.stock_quantity_c,
       p.available_for_restaurants, p.restaurant_price_a, p.restaurant_price_b, p.restaurant_price_c,
       c.available_for_restaurants as category_available_for_restaurants,`
    : '';
  const catalogV2Cols = (await hasCatalogV2Columns()) ? CATALOG_V2_READ_COLS : '';
  const result = await query(
    `SELECT p.id, p.name_ur, p.name_en, p.slug, p.sku, p.barcode,
      p.category_id, c.name_en as category_name, c.slug as category_slug,
      p.subcategory_id, p.price, p.compare_at_price, p.cost_price,
      p.half_kg_price, p.quarter_kg_price, p.half_dozen_price,
      ${varCols}
      ${toggleCols}
      ${qualityCols}
      ${catalogV2Cols}
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
