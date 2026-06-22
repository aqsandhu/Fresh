// ============================================================================
// ADMIN CONTROLLER — Today's Basket (curated combo packages, super-admin only)
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  createdResponse,
} from '../../utils/response';
import logger from '../../utils/logger';
import { isMissingTable } from '../../utils/dbErrors';

interface BasketItemInput {
  product_id?: string;
  productId?: string;
  quality?: string;
  quantity?: number | string;
  unit?: string;
}

function requireSuperAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== 'super_admin') {
    errorResponse(res, 'Only super admin can manage baskets', 403);
    return false;
  }
  return true;
}

function normalizeItems(raw: unknown): Array<{
  product_id: string;
  quality: string;
  quantity: number;
  unit: string;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ product_id: string; quality: string; quantity: number; unit: string }> = [];
  for (const r of raw as BasketItemInput[]) {
    const productId = r.product_id || r.productId;
    if (!productId) continue;
    const quality = String(r.quality || 'A').toUpperCase();
    const qty = Number(r.quantity);
    out.push({
      product_id: String(productId),
      quality: ['A', 'B', 'C'].includes(quality) ? quality : 'A',
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: String(r.unit || 'full').slice(0, 20),
    });
  }
  return out;
}

/** Fetch a basket with its items + product display info. */
async function fetchBasketWithItems(basketId: string) {
  const basket = await query(
    `SELECT id, city_id, name, description, total_price, image_url, is_active, created_at, updated_at
       FROM baskets WHERE id = $1`,
    [basketId]
  );
  if (basket.rows.length === 0) return null;
  const items = await query(
    `SELECT bi.id, bi.product_id, bi.quality, bi.quantity, bi.unit,
            p.name_en, p.name_ur, p.primary_image
       FROM basket_items bi
       JOIN products p ON p.id = bi.product_id
      WHERE bi.basket_id = $1
      ORDER BY bi.created_at ASC`,
    [basketId]
  );
  return { ...basket.rows[0], items: items.rows };
}

/**
 * List baskets (optionally by ?cityId), each with its items.
 * GET /api/admin/baskets
 */
export const getBaskets = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;
  const cityId = (req.query.cityId || req.query.city_id) as string | undefined;
  try {
    const baskets = cityId
      ? await query(`SELECT id FROM baskets WHERE city_id = $1 ORDER BY created_at DESC`, [cityId])
      : await query(`SELECT id FROM baskets ORDER BY created_at DESC`);

    const full = [];
    for (const row of baskets.rows) {
      const b = await fetchBasketWithItems(row.id);
      if (b) full.push(b);
    }
    successResponse(res, full, 'Baskets retrieved');
  } catch (err) {
    if (isMissingTable(err)) return successResponse(res, [], 'Baskets retrieved');
    throw err;
  }
});

/**
 * Create a basket with items.
 * POST /api/admin/baskets
 */
export const createBasket = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;

  const cityId = req.body.city_id || req.body.cityId || null;
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim() || null;
  const totalPrice = Number(req.body.total_price ?? req.body.totalPrice);
  const imageUrl = String(req.body.image_url || req.body.imageUrl || '').trim() || null;
  const isActive = req.body.is_active ?? req.body.isActive;
  const items = normalizeItems(req.body.items);

  if (!name) return errorResponse(res, 'Basket name is required', 400);
  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    return errorResponse(res, 'A valid total price is required', 400);
  }
  if (items.length === 0) return errorResponse(res, 'Add at least one product to the basket', 400);

  const created = await withTransaction(async (client) => {
    const basketRes = await client.query(
      `INSERT INTO baskets (city_id, name, description, total_price, image_url, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [cityId, name, description, totalPrice, imageUrl, isActive === false ? false : true, req.user?.id || null]
    );
    const basketId = basketRes.rows[0].id;
    for (const it of items) {
      await client.query(
        `INSERT INTO basket_items (basket_id, product_id, quality, quantity, unit)
         VALUES ($1, $2, $3, $4, $5)`,
        [basketId, it.product_id, it.quality, it.quantity, it.unit]
      );
    }
    return basketId;
  });

  logger.info('Basket created', { basketId: created, by: req.user?.id });
  const basket = await fetchBasketWithItems(created);
  createdResponse(res, basket, 'Basket created');
});

/**
 * Update a basket; if `items` is provided, the item set is replaced.
 * PUT /api/admin/baskets/:id
 */
export const updateBasket = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;
  const { id } = req.params;

  const existing = await query('SELECT id FROM baskets WHERE id = $1', [id]);
  if (existing.rows.length === 0) return notFoundResponse(res, 'Basket not found');

  await withTransaction(async (client) => {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const pushSet = (col: string, val: any) => {
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    };

    if (req.body.name !== undefined) pushSet('name', String(req.body.name).trim());
    if (req.body.description !== undefined)
      pushSet('description', String(req.body.description).trim() || null);
    if (req.body.total_price !== undefined || req.body.totalPrice !== undefined) {
      const tp = Number(req.body.total_price ?? req.body.totalPrice);
      pushSet('total_price', Number.isFinite(tp) && tp >= 0 ? tp : 0);
    }
    if (req.body.image_url !== undefined || req.body.imageUrl !== undefined)
      pushSet('image_url', String(req.body.image_url ?? req.body.imageUrl ?? '').trim() || null);
    if (req.body.is_active !== undefined || req.body.isActive !== undefined) {
      const v = req.body.is_active ?? req.body.isActive;
      pushSet('is_active', v === true || v === 'true');
    }

    if (sets.length > 0) {
      sets.push('updated_at = NOW()');
      params.push(id);
      await client.query(`UPDATE baskets SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    }

    if (req.body.items !== undefined) {
      const items = normalizeItems(req.body.items);
      await client.query('DELETE FROM basket_items WHERE basket_id = $1', [id]);
      for (const it of items) {
        await client.query(
          `INSERT INTO basket_items (basket_id, product_id, quality, quantity, unit)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, it.product_id, it.quality, it.quantity, it.unit]
        );
      }
    }
  });

  const basket = await fetchBasketWithItems(id);
  successResponse(res, basket, 'Basket updated');
});

/**
 * Delete a basket (cascades to items).
 * DELETE /api/admin/baskets/:id
 */
export const deleteBasket = asyncHandler(async (req: Request, res: Response) => {
  if (!requireSuperAdmin(req, res)) return;
  const { id } = req.params;
  const result = await query('DELETE FROM baskets WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return notFoundResponse(res, 'Basket not found');
  successResponse(res, { id }, 'Basket deleted');
});
