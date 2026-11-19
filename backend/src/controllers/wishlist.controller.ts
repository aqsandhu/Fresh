// ============================================================================
// WISHLIST (W22) — kept with the customer's account, so the website and every
// phone show the same list. The server stores product ids only; the apps fill
// in the details through the product list (active products of their city).
//
// Joining rule: at sign-in the device's list and the account's list are
// joined (POST /merge — nothing lost, nothing doubled). After that the server
// is the truth: the apps read it on open and add / remove one item at a time,
// so a product removed on one device does not come back from another.
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { errorResponse, notFoundResponse, successResponse } from '../utils/response';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_READY = 'The wishlist is being set up. Please try again shortly.';
const MAX_ITEMS = 200;

let tableReady = false;
async function wishlistReady(): Promise<boolean> {
  if (tableReady) return true;
  const r = await query(`SELECT to_regclass('public.wishlist_items') IS NOT NULL AS ok`);
  tableReady = r.rows[0]?.ok === true;
  return tableReady;
}

/** The customer's wishlist: only products still on sale, newest first. */
async function listIds(userId: string): Promise<string[]> {
  const r = await query<{ product_id: string }>(
    `SELECT w.product_id
       FROM wishlist_items w
       JOIN products p ON p.id = w.product_id
      WHERE w.user_id = $1 AND p.is_active = TRUE
      ORDER BY w.created_at DESC
      LIMIT ${MAX_ITEMS}`,
    [userId]
  );
  return r.rows.map((x) => x.product_id);
}

/** GET /api/wishlist */
export const getWishlist = asyncHandler(async (req: Request, res: Response) => {
  if (!(await wishlistReady())) return errorResponse(res, NOT_READY, 503);
  return successResponse(res, { product_ids: await listIds(req.user!.id) }, 'Wishlist');
});

/** POST /api/wishlist/:productId — add one (adding again is fine). */
export const addToWishlist = asyncHandler(async (req: Request, res: Response) => {
  if (!(await wishlistReady())) return errorResponse(res, NOT_READY, 503);
  const productId = String(req.params.productId || '');
  if (!UUID_RE.test(productId)) return errorResponse(res, 'Invalid product.', 400);
  const ok = await query(`SELECT 1 FROM products WHERE id = $1 AND is_active = TRUE`, [productId]);
  if (ok.rows.length === 0) return notFoundResponse(res, 'Product not found');
  await query(
    `INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.user!.id, productId]
  );
  return successResponse(res, { product_ids: await listIds(req.user!.id) }, 'Added to wishlist');
});

/** DELETE /api/wishlist/:productId — remove one (not there = nothing to do). */
export const removeFromWishlist = asyncHandler(async (req: Request, res: Response) => {
  if (!(await wishlistReady())) return errorResponse(res, NOT_READY, 503);
  const productId = String(req.params.productId || '');
  if (!UUID_RE.test(productId)) return errorResponse(res, 'Invalid product.', 400);
  await query(`DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2`, [req.user!.id, productId]);
  return successResponse(res, { product_ids: await listIds(req.user!.id) }, 'Removed from wishlist');
});

/** POST /api/wishlist/merge { product_ids } — join the device's list at sign-in. */
export const mergeWishlist = asyncHandler(async (req: Request, res: Response) => {
  if (!(await wishlistReady())) return errorResponse(res, NOT_READY, 503);
  const raw: unknown = req.body?.product_ids;
  if (!Array.isArray(raw)) return errorResponse(res, 'product_ids must be a list.', 400);
  const ids = Array.from(new Set(raw.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)))).slice(0, MAX_ITEMS);
  if (ids.length) {
    // Only products that exist and are on sale; unknown ids are skipped quietly
    // (a device may remember a product the office has since removed).
    await query(
      `INSERT INTO wishlist_items (user_id, product_id)
       SELECT $1, p.id FROM products p WHERE p.id = ANY($2::uuid[]) AND p.is_active = TRUE
       ON CONFLICT DO NOTHING`,
      [req.user!.id, ids]
    );
  }
  return successResponse(res, { product_ids: await listIds(req.user!.id) }, 'Wishlist joined');
});
