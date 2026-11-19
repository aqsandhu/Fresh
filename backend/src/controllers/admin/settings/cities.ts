// Service cities and catalogue import — moved from settings.controller.ts (W21: only the place changed, not the behaviour).

import crypto from 'crypto';
import { Request, Response } from 'express';
import { query, withTransaction } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import {
  successResponse,
  notFoundResponse,
  errorResponse,
  createdResponse,
} from '../../../utils/response';
import logger from '../../../utils/logger';

export const getCities = asyncHandler(async (req: Request, res: Response) => {
  const scope = req.cityScope;

  // Super admins must always get the FULL list so the city switcher keeps
  // working even while a single city is selected — the X-City-Id header would
  // otherwise scope this list down to just the one selected city.
  if (req.user?.role !== 'super_admin' && scope) {
    if (scope.forbidden) {
      return successResponse(res, [], 'Cities retrieved');
    }
    if (!scope.unrestricted && scope.cityId) {
      const result = await query(
        `SELECT id, name, province, is_active, created_at
           FROM service_cities
          WHERE id = $1
          ORDER BY name`,
        [scope.cityId]
      );
      return successResponse(res, result.rows, 'Cities retrieved');
    }
  }

  const result = await query(
    `SELECT id, name, province, is_active, created_at FROM service_cities ORDER BY name`
  );
  successResponse(res, result.rows, 'Cities retrieved');
});

/**
 * Add a service city
 * POST /api/admin/cities
 */

export const addCity = asyncHandler(async (req: Request, res: Response) => {
  // A new city goes public at once (city picker on the website and apps) —
  // super admin only, like enabling, disabling or deleting one (B28).
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only the super admin can add a city.', 403);
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const { province } = req.body;

  if (name.length < 1 || name.length > 100) {
    return errorResponse(res, 'City name must be 1–100 characters', 400);
  }

  const existing = await query(
    `SELECT id FROM service_cities WHERE LOWER(name) = LOWER($1)`,
    [name]
  );
  if (existing.rows.length > 0) {
    return errorResponse(res, 'City already exists', 400);
  }

  const result = await query(
    `INSERT INTO service_cities (name, province) VALUES ($1, $2) RETURNING *`,
    [name, province]
  );
  createdResponse(res, result.rows[0], 'City added');
});

/**
 * Toggle city active status
 * PUT /api/admin/cities/:id/toggle
 */

export const toggleCity = asyncHandler(async (req: Request, res: Response) => {
  // Same gate as deleteCity / importCityCatalog: a city-scoped admin must not
  // be able to take another city offline.
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admins can enable or disable a city', 403);
  }
  const { id } = req.params;
  const result = await query(
    `UPDATE service_cities SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'City not found');
  }
  successResponse(res, result.rows[0], 'City updated');
});

/**
 * Delete a service city
 * DELETE /api/admin/cities/:id
 */

export const deleteCity = asyncHandler(async (req: Request, res: Response) => {
  // Deleting a city cascades through products/orders config — destructive
  // enough to restrict to super-admin (mirrors importCityCatalog).
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can delete a city', 403);
  }
  const { id } = req.params;
  const result = await query(
    `DELETE FROM service_cities WHERE id = $1 RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'City not found');
  }
  successResponse(res, null, 'City deleted');
});

/**
 * Copy categories + products from one city to another (super-admin only).
 * POST /api/admin/cities/import-catalog
 */

export const importCityCatalog = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can import catalog between cities', 403);
  }

  const sourceCityId = req.body.source_city_id || req.body.sourceCityId;
  const targetCityId = req.body.target_city_id || req.body.targetCityId;

  if (!sourceCityId || !targetCityId) {
    return errorResponse(res, 'source_city_id and target_city_id are required', 400);
  }
  if (sourceCityId === targetCityId) {
    return errorResponse(res, 'Source and target city must be different', 400);
  }

  const cities = await query(
    `SELECT id, name FROM service_cities WHERE id = ANY($1::uuid[])`,
    [[sourceCityId, targetCityId]]
  );
  if (cities.rows.length !== 2) {
    return errorResponse(res, 'Invalid source or target city', 400);
  }

  const summary = await withTransaction(async (client) => {
    // Every column is copied INSIDE the database (INSERT … SELECT), so the
    // copy keeps exact types and picks up columns added later by itself. The
    // old version listed columns by hand and silently dropped 23 product
    // columns (quality B/C prices, half/quarter switches, variable weight,
    // restaurant prices and visibility) and every category's parent.
    // Only these are NOT copied:
    //   ids, created/updated times, rating/review/view/order counters → defaults
    //   slug → made unique in the new city; city → the new city
    //   category / sub-category / parent → the new city's copies
    //   stock (all qualities) and reservations → 0, status out_of_stock:
    //     a catalogue copy brings the product LIST, not its goods (stock used
    //     to be copied with no purchase and no ledger row — stock from nowhere)
    //   SKU → empty (unique across cities: one SKU made the whole import fail)
    const columnsOf = async (table: string): Promise<string[]> =>
      (
        await client.query(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER'
            ORDER BY ordinal_position`,
          [table]
        )
      ).rows.map((r: { column_name: string }) => r.column_name);
    const ident = (c: string) => `"${c.replace(/"/g, '""')}"`;
    const LEFT_TO_DEFAULTS = new Set(['id', 'created_at', 'updated_at', 'rating_average', 'review_count', 'view_count', 'order_count']);

    const buildCopy = (table: string, cols: string[], set: Record<string, string>) => {
      const target = cols.filter((c) => !LEFT_TO_DEFAULTS.has(c));
      const exprs = target.map((c) => {
        if (c in set) return set[c];
        if (/^(stock_quantity|reserved_quantity)(_[a-z])?$/.test(c)) return '0';
        return ident(c);
      });
      return `INSERT INTO ${table} (${target.map(ident).join(', ')})
              SELECT ${exprs.join(', ')} FROM ${table} WHERE id = $1 RETURNING id`;
    };

    const categoryCols = await columnsOf('categories');
    const productCols = await columnsOf('products');
    const updatedBy: Record<string, string> = categoryCols.includes('updated_by') ? { updated_by: 'NULL' } : {};
    const copyCategory = buildCopy('categories', categoryCols, {
      slug: '$2', city_id: '$3', parent_id: 'NULL', created_by: '$4', ...updatedBy,
    });
    const copyProduct = buildCopy('products', productCols, {
      slug: '$2', city_id: '$3', category_id: '$4', subcategory_id: '$5', created_by: '$6',
      sku: 'NULL', stock_status: `'out_of_stock'`, ...(productCols.includes('updated_by') ? { updated_by: 'NULL' } : {}),
    });

    const uniqueSlug = async (table: string, slug: string): Promise<string> => {
      const taken = await client.query(`SELECT 1 FROM ${table} WHERE slug = $1 AND city_id = $2`, [slug, targetCityId]);
      return taken.rows.length > 0 ? `${slug}-${crypto.randomBytes(3).toString('hex')}` : slug;
    };

    const categories = await client.query(
      `SELECT id, slug, parent_id FROM categories WHERE city_id = $1 ORDER BY display_order, name_en`,
      [sourceCityId]
    );
    const categoryMap = new Map<string, string>();
    for (const cat of categories.rows) {
      const inserted = await client.query(copyCategory, [cat.id, await uniqueSlug('categories', cat.slug), targetCityId, req.user?.id || null]);
      categoryMap.set(cat.id, inserted.rows[0].id);
    }
    // Parents once every copy exists (a child can be listed before its parent).
    for (const cat of categories.rows) {
      if (!cat.parent_id) continue;
      await client.query(`UPDATE categories SET parent_id = $1 WHERE id = $2`, [
        categoryMap.get(cat.parent_id) ?? null,
        categoryMap.get(cat.id),
      ]);
    }

    const products = await client.query(
      `SELECT id, slug, category_id, subcategory_id FROM products WHERE city_id = $1`,
      [sourceCityId]
    );
    let productsCopied = 0;
    for (const prod of products.rows) {
      const newCategoryId = categoryMap.get(prod.category_id);
      if (!newCategoryId) continue;
      await client.query(copyProduct, [
        prod.id,
        await uniqueSlug('products', prod.slug),
        targetCityId,
        newCategoryId,
        prod.subcategory_id ? categoryMap.get(prod.subcategory_id) ?? null : null,
        req.user?.id || null,
      ]);
      productsCopied++;
    }

    return { categoriesCopied: categoryMap.size, productsCopied };
  });

  logger.info('City catalog imported', {
    sourceCityId,
    targetCityId,
    ...summary,
    importedBy: req.user?.id,
  });

  successResponse(res, summary, 'Catalog imported successfully');
});

// ============================================================================
// DELIVERY ZONES MANAGEMENT
// ============================================================================

/**
 * List all delivery zones
 * GET /api/admin/delivery-zones
 */
