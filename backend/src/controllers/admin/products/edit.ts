// Creating and editing a product (prices, units, qualities) — moved from products.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import {
  successResponse,
  notFoundResponse,
  errorResponse,
  createdResponse,
} from '../../../utils/response';
import { generateSlug } from '../../../utils/validators';
import logger from '../../../utils/logger';
import { resolveCityScope, cityRowInScope, requireCityScope } from '../../../utils/cityScope';
import { parseTagsInput } from '../../../utils/productTags';
import { hasVariableWeightColumns, hasUnitToggleColumns, hasQualityCatalogColumns } from '../../../config/productSchema';
import { hasCatalogV2Columns } from '../../../config/catalogV2Schema';
import { PRICE_CUT_LIMIT_PCT, CATALOG_V2_ENABLE_FLAGS, CATALOG_V2_FRACTION_PRICES, DEFAULT_VARIABLE_WEIGHT_NOTE, toBool, toBoolOr, MAX_PRODUCT_IMAGES, parseExistingImages } from './shared';

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

  // Validate category_id: must exist and belong to this admin's city scope —
  // same guard as moveProductsCategory, otherwise a cross-city or bogus id
  // corrupts the catalog (or trips the FK into a 500).
  const cat = await query('SELECT id, city_id FROM categories WHERE id = $1', [category_id]);
  if (cat.rows.length === 0 || !cityRowInScope(scope, cat.rows[0].city_id)) {
    return errorResponse(res, 'Invalid category_id', 400);
  }

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
          unit_type, unit_value, 0,
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
          unit_type, unit_value, 0,
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

  // Quality tiers (migration 34): consumer B/C price, the "also for
  // restaurants" flag, and restaurant prices. Stock always starts at 0 here;
  // inventory is added through stock purchasing / stock-management flows.
  if (await hasQualityCatalogColumns()) {
    const priceB = normPrice(req.body.price_b);
    const priceC = normPrice(req.body.price_c);
    const availForRest = toBool(req.body.available_for_restaurants);
    const rPriceA = normPrice(req.body.restaurant_price_a);
    const rPriceB = normPrice(req.body.restaurant_price_b);
    const rPriceC = normPrice(req.body.restaurant_price_c);
    await query(
      `UPDATE products SET
         price_b = $1, price_c = $2, stock_quantity_b = $3, stock_quantity_c = $4,
         available_for_restaurants = $5,
         restaurant_price_a = $6, restaurant_price_b = $7, restaurant_price_c = $8
       WHERE id = $9`,
      [priceB, priceC, 0, 0, availForRest, rPriceA, rPriceB, rPriceC, result.rows[0].id]
    );
    Object.assign(result.rows[0], {
      price_b: priceB, price_c: priceC,
      stock_quantity_b: 0, stock_quantity_c: 0,
      available_for_restaurants: availForRest,
      restaurant_price_a: rPriceA, restaurant_price_b: rPriceB, restaurant_price_c: rPriceC,
    });
  }

  // Catalog v2 (migration 37): per-quality channel enable flags + explicit B/C
  // and restaurant fraction prices. Follow-up update; defaults preserve prior
  // behaviour (consumer A/B/C on, restaurant off) when the form omits a field.
  if (await hasCatalogV2Columns()) {
    const flagOr = (v: any, dflt: boolean) => (v === '' || v === null || v === undefined ? dflt : toBool(v));
    const flagVals = [
      flagOr(req.body.consumer_enabled_a, true), flagOr(req.body.consumer_enabled_b, true), flagOr(req.body.consumer_enabled_c, true),
      flagOr(req.body.restaurant_enabled_a, false), flagOr(req.body.restaurant_enabled_b, false), flagOr(req.body.restaurant_enabled_c, false),
    ];
    const fracVals = CATALOG_V2_FRACTION_PRICES.map((c) => normPrice(req.body[c]));
    const allCols = [...CATALOG_V2_ENABLE_FLAGS, ...CATALOG_V2_FRACTION_PRICES];
    const allVals = [...flagVals, ...fracVals];
    const setSql = allCols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    await query(
      `UPDATE products SET ${setSql} WHERE id = $${allCols.length + 1}`,
      [...allVals, result.rows[0].id]
    );
    allCols.forEach((c, i) => { result.rows[0][c] = allVals[i]; });
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
  const existing = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0 || !cityRowInScope(scope, existing.rows[0].city_id)) {
    return notFoundResponse(res, 'Product not found');
  }
  const productCityId = existing.rows[0].city_id;

  // "Price dip": drop a price to almost nothing, let a friend order, put it
  // back. Orders lock the price at order time, so the sale then looks normal.
  // A staff admin may not cut any selling price by more than the limit — a
  // real clearance is the owner's call (super admin is not capped). The limit
  // is measured against the HIGHEST price of the last 24 hours, so it cannot be
  // walked down in small steps (1000 → 700 → 490 → 343 …). Earlier prices come
  // from the audit log, which stores the full product row before every edit.
  if (req.user?.role !== 'super_admin') {
    const priceKeys = Object.keys(updates).filter(
      (key) => /price/.test(key) && key !== 'compare_at_price' && key !== 'cost_price' && /^[a-z0-9_]+$/.test(key)
    );
    let recentHigh: Record<string, number> = {};
    if (priceKeys.length) {
      const hist = await query(
        `SELECT ${priceKeys.map((k, i) => `MAX(NULLIF(old_data->>'${k}', '')::numeric) AS h${i}`).join(', ')}
           FROM audit_logs
          WHERE resource = 'products' AND resource_id = $1 AND status = 'success'
            AND created_at > NOW() - INTERVAL '24 hours'`,
        [id]
      ).catch(() => ({ rows: [] as any[] }));
      recentHigh = Object.fromEntries(priceKeys.map((k, i) => [k, parseFloat(hist.rows[0]?.[`h${i}`]) || 0]));
    }
    for (const key of priceKeys) {
      const current = parseFloat(String(existing.rows[0][key] ?? ''));
      const before = Math.max(Number.isFinite(current) ? current : 0, recentHigh[key] || 0);
      const after = parseFloat(String(updates[key]));
      if (!(before > 0) || !(after > 0)) continue;
      if (after < before * (1 - PRICE_CUT_LIMIT_PCT / 100)) {
        const stepped = before > current;
        return errorResponse(
          res,
          stepped
            ? `${key} was Rs. ${before} within the last 24 hours; going to Rs. ${after} is a cut of more than ${PRICE_CUT_LIMIT_PCT}% and needs the super admin.`
            : `A price cut of more than ${PRICE_CUT_LIMIT_PCT}% (${key}: Rs. ${before} → Rs. ${after}) needs the super admin.`,
          400
        );
      }
    }
  }

  // Validate a category change: must exist and stay inside the admin's city
  // scope — same guard as moveProductsCategory.
  if (updates.category_id !== undefined && updates.category_id !== null && updates.category_id !== '') {
    const cat = await query('SELECT id, city_id FROM categories WHERE id = $1', [updates.category_id]);
    if (cat.rows.length === 0 || !cityRowInScope(scope, cat.rows[0].city_id)) {
      return errorResponse(res, 'Invalid category_id', 400);
    }
  }

  // Build update query
  const varWeightReady = await hasVariableWeightColumns();
  const unitToggleReady = await hasUnitToggleColumns();
  const qualityReady = await hasQualityCatalogColumns();
  const catalogV2Ready = await hasCatalogV2Columns();
  const allowedFields = [
    'name_ur', 'name_en', 'category_id', 'subcategory_id',
    'price', 'compare_at_price',
    'half_kg_price', 'quarter_kg_price', 'half_dozen_price',
    'unit_type', 'unit_value',
    'description_ur', 'description_en',
    'is_active', 'is_featured', 'is_new_arrival', 'tags',
    // Only writable once migration 23 has added the columns.
    ...(varWeightReady ? ['is_variable_weight', 'variable_weight_note'] : []),
    // Only writable once migration 25 has added the columns.
    ...(unitToggleReady ? ['allow_half_kg', 'allow_quarter_kg'] : []),
    // Quality tiers — only writable once migration 34 has added the columns.
    ...(qualityReady
      ? ['price_b', 'price_c', 'available_for_restaurants', 'restaurant_price_a', 'restaurant_price_b', 'restaurant_price_c']
      : []),
    // Catalog v2 — only writable once migration 37 has added the columns.
    ...(catalogV2Ready ? [...CATALOG_V2_ENABLE_FLAGS, ...CATALOG_V2_FRACTION_PRICES] : []),
  ];
  const booleanFields = new Set([
    'is_active', 'is_featured', 'is_new_arrival', 'is_variable_weight',
    'allow_half_kg', 'allow_quarter_kg', 'available_for_restaurants',
    ...CATALOG_V2_ENABLE_FLAGS,
  ]);
  // These columns must always serialize as NULL when the admin clears them.
  const nullableNumberFields = new Set([
    'compare_at_price', 'half_kg_price', 'quarter_kg_price', 'half_dozen_price',
    'price_b', 'price_c', 'restaurant_price_a', 'restaurant_price_b', 'restaurant_price_c',
    ...CATALOG_V2_FRACTION_PRICES,
  ]);
  const setClauses: string[] = [];
  const values: unknown[] = [];
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
  // The admin form echoes the images it wants to KEEP as `existing_images`
  // (JSON array, in stored order); new uploads are appended to that list.
  // Previously any upload replaced the whole gallery.
  const uploadedFiles = req.files as Express.Multer.File[] | undefined;
  const uploaded = (uploadedFiles ?? []).map(f => f.url || '').filter(Boolean);
  const existingImages = parseExistingImages(updates.existing_images);

  if (uploaded.length > 0 || existingImages !== null) {
    let base: string[];
    if (existingImages !== null) {
      base = existingImages;
    } else {
      const cur = await query('SELECT images FROM products WHERE id = $1', [id]);
      base = Array.isArray(cur.rows[0]?.images) ? cur.rows[0].images : [];
    }
    const images = [...base, ...uploaded].slice(0, MAX_PRODUCT_IMAGES);
    setClauses.push(`primary_image = $${paramIndex++}`);
    values.push(images[0] ?? null);
    setClauses.push(`images = $${paramIndex++}`);
    values.push(images.length > 0 ? images : null);
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
