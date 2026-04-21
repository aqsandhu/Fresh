// ============================================================================
// CATEGORY CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse } from '../utils/response';

/**
 * Get all categories
 * GET /api/categories
 */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const { parent_id } = req.query;

  let sql = `
    SELECT 
      c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url,
      c.parent_id, c.display_order, c.is_active,
      c.qualifies_for_free_delivery, c.minimum_order_for_free_delivery,
      COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.is_active = TRUE
    WHERE c.is_active = TRUE
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (parent_id) {
    sql += ` AND c.parent_id = $${paramIndex++}`;
    params.push(parent_id);
  } else {
    sql += ` AND c.parent_id IS NULL`; // Only top-level categories by default
  }

  sql += `
    GROUP BY c.id
    ORDER BY c.display_order ASC, c.name_en ASC
  `;

  const result = await query(sql, params);

  successResponse(res, result.rows, 'Categories retrieved successfully');
});

/**
 * Get category by slug with subcategories
 * GET /api/categories/:slug
 */
export const getCategoryBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;

  // Get main category
  const categoryResult = await query(
    `SELECT 
      c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url,
      c.parent_id, c.display_order, c.is_active,
      c.qualifies_for_free_delivery, c.minimum_order_for_free_delivery,
      c.meta_title, c.meta_description
    FROM categories c
    WHERE c.slug = $1 AND c.is_active = TRUE`,
    [slug]
  );

  if (categoryResult.rows.length === 0) {
    return notFoundResponse(res, 'Category not found');
  }

  const category = categoryResult.rows[0];

  // Get subcategories
  const subcategoriesResult = await query(
    `SELECT 
      c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url,
      c.display_order,
      COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.is_active = TRUE
    WHERE c.parent_id = $1 AND c.is_active = TRUE
    GROUP BY c.id
    ORDER BY c.display_order ASC, c.name_en ASC`,
    [category.id]
  );

  category.subcategories = subcategoriesResult.rows;

  successResponse(res, category, 'Category retrieved successfully');
});

/**
 * Get all categories as tree structure
 * GET /api/categories/tree
 */
export const getCategoryTree = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT 
      c.id, c.name_ur, c.name_en, c.slug, c.icon_url, c.image_url,
      c.parent_id, c.display_order
    FROM categories c
    WHERE c.is_active = TRUE
    ORDER BY c.display_order ASC, c.name_en ASC`
  );

  // Build tree structure
  const categories = result.rows;
  const categoryMap = new Map();
  const rootCategories: any[] = [];

  // First pass: create map
  categories.forEach((cat) => {
    categoryMap.set(cat.id, { ...cat, children: [] });
  });

  // Second pass: build tree
  categories.forEach((cat) => {
    const categoryWithChildren = categoryMap.get(cat.id);
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      categoryMap.get(cat.parent_id).children.push(categoryWithChildren);
    } else {
      rootCategories.push(categoryWithChildren);
    }
  });

  successResponse(res, rootCategories, 'Category tree retrieved successfully');
});
