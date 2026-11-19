// Images, delete, on/off, moving between categories — moved from products.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query, withTransaction } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../../utils/response';
import { deleteFileFromStorage } from '../../../config/storage';
import logger from '../../../utils/logger';
import { resolveCityScope, cityRowInScope } from '../../../utils/cityScope';
import { hasQualityCatalogColumns } from '../../../config/productSchema';
import { hasCatalogV2Columns } from '../../../config/catalogV2Schema';
import { hasOcpTables } from '../../../config/ocpSchema';
import { MAX_PRODUCT_IMAGES } from './shared';

/**
 * Append images to a product's gallery.
 * POST /api/admin/products/:id/images   (multipart `images`, up to 5)
 * The admin panel has called this endpoint for a long time; it never existed.
 */
export const addProductImages = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);
  const existing = await query('SELECT city_id, images FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0 || !cityRowInScope(scope, existing.rows[0].city_id)) {
    return notFoundResponse(res, 'Product not found');
  }
  const uploaded = ((req.files as Express.Multer.File[] | undefined) ?? [])
    .map(f => f.url || '')
    .filter(Boolean);
  if (uploaded.length === 0) return errorResponse(res, 'No images uploaded', 400);

  const current: string[] = Array.isArray(existing.rows[0].images) ? existing.rows[0].images : [];
  if (current.length + uploaded.length > MAX_PRODUCT_IMAGES) {
    return errorResponse(res, `A product can have at most ${MAX_PRODUCT_IMAGES} images`, 400);
  }
  const images = [...current, ...uploaded];
  const result = await query(
    `UPDATE products SET images = $1, primary_image = $2, updated_at = NOW() WHERE id = $3 RETURNING images, primary_image`,
    [images, images[0], id]
  );
  logger.info('Product images added', { productId: id, count: uploaded.length, by: req.user?.id });
  successResponse(res, { imageUrls: uploaded, images: result.rows[0].images }, 'Images added');
});

/**
 * Remove one gallery image by index.
 * DELETE /api/admin/products/:id/images/:index
 */
export const deleteProductImage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const index = parseInt(String(req.params.index), 10);
  if (!Number.isInteger(index) || index < 0) return errorResponse(res, 'Invalid image index', 400);

  const scope = await resolveCityScope(req);
  const existing = await query('SELECT city_id, images FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0 || !cityRowInScope(scope, existing.rows[0].city_id)) {
    return notFoundResponse(res, 'Product not found');
  }
  const current: string[] = Array.isArray(existing.rows[0].images) ? existing.rows[0].images : [];
  if (index >= current.length) return notFoundResponse(res, 'Image not found');

  const images = current.filter((_, i) => i !== index);
  await query(
    `UPDATE products SET images = $1, primary_image = $2, updated_at = NOW() WHERE id = $3`,
    [images.length > 0 ? images : null, images[0] ?? null, id]
  );
  logger.info('Product image removed', { productId: id, index, by: req.user?.id });
  successResponse(res, { images }, 'Image removed');
});

/**
 * Delete product
 * DELETE /api/admin/products/:id              -> soft delete (is_active = FALSE)
 * DELETE /api/admin/products/:id?hard=true    -> super-admin purge for unused dummy rows only
 *
 * Product rows with stock, reservations, carts, orders, purchases, or stock
 * ledger history cannot be purged. Deactivate them instead.
 */

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const hard = req.query.hard === 'true' || req.query.hard === '1' || req.query.purge === 'true';

  // City isolation: a scoped admin may only delete products in their own city.
  const scope = await resolveCityScope(req);
  const qualityReady = await hasQualityCatalogColumns();
  const catalogV2Ready = await hasCatalogV2Columns();
  const qualityCols = qualityReady ? ', stock_quantity_b, stock_quantity_c' : '';
  const reservedCols = catalogV2Ready ? ', reserved_quantity, reserved_quantity_b, reserved_quantity_c' : '';
  const existing = await query(
    `SELECT city_id, primary_image, images, stock_quantity${qualityCols}${reservedCols}
       FROM products WHERE id = $1`,
    [id]
  );
  if (existing.rows.length === 0 || !cityRowInScope(scope, existing.rows[0].city_id)) {
    return notFoundResponse(res, 'Product not found');
  }

  if (!hard) {
    await query(
      'UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [id]
    );
    logger.info('Product soft-deleted', { productId: id, deletedBy: req.user?.id });
    return successResponse(res, null, 'Product deactivated');
  }

  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admins can permanently purge a product.', 403);
  }

  const product = existing.rows[0];
  const onHand =
    (parseFloat(product.stock_quantity) || 0) +
    (qualityReady ? (parseFloat(product.stock_quantity_b) || 0) + (parseFloat(product.stock_quantity_c) || 0) : 0);
  const reserved = catalogV2Ready
    ? (parseFloat(product.reserved_quantity) || 0) +
      (parseFloat(product.reserved_quantity_b) || 0) +
      (parseFloat(product.reserved_quantity_c) || 0)
    : 0;
  const ocpReady = await hasOcpTables();
  const [orders, carts, reviews, movements, purchases, ocpStock, ocpMoves, ocpRequestItems] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM order_items WHERE product_id = $1', [id]),
    query('SELECT COUNT(*)::int AS count FROM cart_items WHERE product_id = $1', [id]),
    query('SELECT COUNT(*)::int AS count FROM reviews WHERE product_id = $1', [id]).catch(() => ({ rows: [{ count: 0 }] } as any)),
    catalogV2Ready
      ? query('SELECT COUNT(*)::int AS count FROM stock_movements WHERE product_id = $1', [id])
      : Promise.resolve({ rows: [{ count: 0 }] } as any),
    query('SELECT COUNT(*)::int AS count FROM stock_purchases WHERE product_id = $1', [id]).catch(() => ({ rows: [{ count: 0 }] } as any)),
    ocpReady
      ? query('SELECT COUNT(*)::int AS count, COALESCE(SUM(quantity), 0) AS quantity FROM ocp_stock WHERE product_id = $1', [id])
      : Promise.resolve({ rows: [{ count: 0, quantity: 0 }] } as any),
    ocpReady
      ? query('SELECT COUNT(*)::int AS count FROM ocp_stock_movements WHERE product_id = $1', [id])
      : Promise.resolve({ rows: [{ count: 0 }] } as any),
    ocpReady
      ? query('SELECT COUNT(*)::int AS count FROM ocp_stock_request_items WHERE product_id = $1', [id])
      : Promise.resolve({ rows: [{ count: 0 }] } as any),
  ]);

  const blockers = {
    onHand,
    reserved,
    orderItems: Number(orders.rows[0]?.count || 0),
    cartItems: Number(carts.rows[0]?.count || 0),
    reviews: Number(reviews.rows[0]?.count || 0),
    stockMovements: Number(movements.rows[0]?.count || 0),
    stockPurchases: Number(purchases.rows[0]?.count || 0),
    ocpStockRows: Number(ocpStock.rows[0]?.count || 0),
    ocpStock: parseFloat(ocpStock.rows[0]?.quantity || 0) || 0,
    ocpMovements: Number(ocpMoves.rows[0]?.count || 0),
    ocpStockRequestItems: Number(ocpRequestItems.rows[0]?.count || 0),
  };
  const blocked = Object.values(blockers).some((value) => Math.abs(Number(value)) > 0);
  if (blocked) {
    return errorResponse(
      res,
      'Product has stock or business history. Deactivate it instead; permanent purge is only for unused dummy products.',
      409,
      blockers
    );
  }

  await withTransaction(async (client) => {
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
