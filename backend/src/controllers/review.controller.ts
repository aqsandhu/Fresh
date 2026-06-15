// ============================================================================
// REVIEW CONTROLLER — customer ratings & reviews for products, riders, and the
// delivery service. A review is always tied to a DELIVERED order the customer
// actually received, so ratings can't be faked. One review per customer per
// target per order (re-submitting edits the existing one). Product + rider
// aggregates are recomputed inside the same transaction.
// ============================================================================

import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  errorResponse,
} from '../utils/response';
import { ensureFeedbackTables } from '../config/feedbackSchema';
import { resolveCityScope } from '../utils/cityScope';
import { emitToAdmins } from '../config/socket';
import logger from '../utils/logger';

const VALID_TARGETS = ['product', 'rider', 'service'] as const;
type TargetType = (typeof VALID_TARGETS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function toRating(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

function cleanComment(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s.slice(0, 2000);
}

interface ReviewRow {
  id: string;
  user_id: string;
  target_type: string;
  product_id: string | null;
  rider_id: string | null;
  order_id: string | null;
  rating: number;
  comment: string | null;
  is_published: boolean;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
}

function mapReview(r: ReviewRow) {
  return {
    id: r.id,
    targetType: r.target_type,
    productId: r.product_id,
    riderId: r.rider_id,
    orderId: r.order_id,
    rating: Number(r.rating),
    comment: r.comment,
    isPublished: r.is_published,
    adminReply: r.admin_reply,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Recompute a product's rating_average + review_count from published reviews. */
async function recomputeProductRating(client: PoolClient, productId: string): Promise<void> {
  await client.query(
    `UPDATE products p SET
       review_count   = sub.cnt,
       rating_average = sub.avg
     FROM (
       SELECT COUNT(*)::int AS cnt,
              COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS avg
         FROM reviews
        WHERE target_type = 'product' AND product_id = $1 AND is_published = TRUE
     ) sub
     WHERE p.id = $1`,
    [productId]
  );
}

/**
 * Recompute a rider's rating from published reviews. riders.rating carries a
 * CHECK (1.0–5.0), so we only write a real average when at least one review
 * exists; otherwise the rating_count is zeroed and the default rating is kept.
 */
async function recomputeRiderRating(client: PoolClient, riderId: string): Promise<void> {
  const r = await client.query(
    `SELECT COUNT(*)::int AS cnt, AVG(rating) AS avg
       FROM reviews
      WHERE target_type = 'rider' AND rider_id = $1 AND is_published = TRUE`,
    [riderId]
  );
  const cnt = Number(r.rows[0]?.cnt ?? 0);
  if (cnt > 0) {
    const avg = Math.min(5, Math.max(1, parseFloat(r.rows[0].avg)));
    await client.query(`UPDATE riders SET rating = $1, rating_count = $2 WHERE id = $3`, [
      avg.toFixed(1),
      cnt,
      riderId,
    ]);
  } else {
    await client.query(`UPDATE riders SET rating_count = 0 WHERE id = $1`, [riderId]);
  }
}

/**
 * POST /api/reviews
 * Body: { targetType, orderId, productId?, rating, comment? }
 * Reviews a product / rider / service for a delivered order. Upserts so a
 * customer can change their rating later.
 */
export const submitReview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  if (!(await ensureFeedbackTables())) {
    return errorResponse(res, 'Reviews are not available yet — please try again shortly.', 503);
  }

  const targetType = String(req.body.targetType ?? req.body.target_type ?? '').trim() as TargetType;
  if (!VALID_TARGETS.includes(targetType)) return errorResponse(res, 'Invalid review target.', 400);

  const orderId = String(req.body.orderId ?? req.body.order_id ?? '').trim();
  if (!orderId || !isUuid(orderId)) return errorResponse(res, 'A valid order is required to leave a review.', 400);

  const rating = toRating(req.body.rating);
  if (rating === null) return errorResponse(res, 'Rating must be a whole number from 1 to 5.', 400);

  const comment = cleanComment(req.body.comment);

  // Load + authorize the order (must be the customer's own, delivered order).
  const orderRes = await query(
    `SELECT id, user_id, status, rider_id, delivered_by, city_id
       FROM orders WHERE id = $1 AND deleted_at IS NULL`,
    [orderId]
  );
  const order = orderRes.rows[0];
  if (!order) return notFoundResponse(res, 'Order not found');
  if (order.user_id !== req.user.id) {
    return errorResponse(res, 'You can only review your own orders.', 403);
  }
  if (order.status !== 'delivered') {
    return errorResponse(res, 'You can review an order once it has been delivered.', 400);
  }

  let productId: string | null = null;
  let riderId: string | null = null;

  if (targetType === 'product') {
    productId = String(req.body.productId ?? req.body.product_id ?? '').trim() || null;
    if (!productId || !isUuid(productId)) return errorResponse(res, 'A valid product is required for a product review.', 400);
    const inOrder = await query(
      `SELECT 1 FROM order_items WHERE order_id = $1 AND product_id = $2 LIMIT 1`,
      [orderId, productId]
    );
    if (inOrder.rows.length === 0) {
      return errorResponse(res, 'This product is not part of that order.', 400);
    }
  } else if (targetType === 'rider') {
    // Rider-behaviour review is ALWAYS allowed. When a rider was actually
    // assigned, the review is attributed to them (rider_id set) and counts
    // toward that rider's rating. When no rider was assigned, rider_id stays
    // NULL — the review is still stored and shown to the customer + admin, but
    // it never affects any rider's rating (recompute skips NULL rider_id).
    riderId = order.rider_id || order.delivered_by || null;
  }

  try {
    const row = await withTransaction(async (client) => {
      let existing;
      if (targetType === 'product') {
        existing = await client.query(
          `SELECT id FROM reviews
            WHERE user_id = $1 AND order_id = $2 AND product_id = $3 AND target_type = 'product'
            FOR UPDATE`,
          [req.user!.id, orderId, productId]
        );
      } else {
        existing = await client.query(
          `SELECT id FROM reviews
            WHERE user_id = $1 AND order_id = $2 AND target_type = $3
            FOR UPDATE`,
          [req.user!.id, orderId, targetType]
        );
      }

      let result: ReviewRow;
      if (existing.rows.length > 0) {
        result = (
          await client.query(
            `UPDATE reviews SET rating = $1, comment = $2, updated_at = NOW()
              WHERE id = $3 RETURNING *`,
            [rating, comment, existing.rows[0].id]
          )
        ).rows[0];
      } else {
        result = (
          await client.query(
            `INSERT INTO reviews
               (user_id, target_type, product_id, rider_id, order_id, city_id, rating, comment)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [req.user!.id, targetType, productId, riderId, orderId, order.city_id, rating, comment]
          )
        ).rows[0];
      }

      if (targetType === 'product' && productId) await recomputeProductRating(client, productId);
      if (targetType === 'rider' && riderId) await recomputeRiderRating(client, riderId);

      return result;
    });

    logger.info('Review submitted', { reviewId: row.id, targetType, userId: req.user.id });

    const targetLabel =
      targetType === 'product' ? 'product' : targetType === 'rider' ? 'rider' : 'company service';
    emitToAdmins('review:new', {
      title: 'New review',
      message: `${rating}★ ${targetLabel} review`,
      reviewId: row.id,
      targetType,
      rating,
    });

    return createdResponse(res, mapReview(row), 'Thank you for your feedback');
  } catch (err: any) {
    // Belt-and-braces: a race that trips the unique index → treat as success-ish.
    if (err?.code === '23505') {
      return errorResponse(res, 'You have already reviewed this. Refresh and edit instead.', 409);
    }
    throw err;
  }
});

/**
 * GET /api/reviews/order/:orderId
 * What the customer can review for a delivered order (its products, the rider,
 * and the overall service) plus any reviews they've already left — powers the
 * "rate this order" UI below each order.
 */
export const getOrderReviewables = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const empty = { canReview: false, delivered: false, products: [], rider: null, reviews: [] };
  if (!(await ensureFeedbackTables())) return successResponse(res, empty, 'Reviews unavailable');

  const { orderId } = req.params;
  if (!isUuid(orderId)) return notFoundResponse(res, 'Order not found');
  const orderRes = await query(
    `SELECT o.id, o.user_id, o.status, COALESCE(o.rider_id, o.delivered_by) AS rider_id,
            ru.full_name AS rider_name
       FROM orders o
       LEFT JOIN riders rd ON rd.id = COALESCE(o.rider_id, o.delivered_by)
       LEFT JOIN users ru ON ru.id = rd.user_id
      WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orderId]
  );
  const order = orderRes.rows[0];
  if (!order) return notFoundResponse(res, 'Order not found');
  if (order.user_id !== req.user.id) return errorResponse(res, 'Not your order.', 403);

  const delivered = order.status === 'delivered';

  const [itemsRes, reviewsRes] = await Promise.all([
    query(
      `SELECT DISTINCT ON (oi.product_id)
              oi.product_id, oi.product_name, oi.product_image
         FROM order_items oi
        WHERE oi.order_id = $1 AND oi.product_id IS NOT NULL`,
      [orderId]
    ),
    query(
      `SELECT * FROM reviews WHERE user_id = $1 AND order_id = $2`,
      [req.user.id, orderId]
    ),
  ]);

  const products = itemsRes.rows.map((p) => ({
    productId: p.product_id,
    productName: p.product_name,
    productImage: p.product_image,
  }));

  return successResponse(
    res,
    {
      canReview: delivered,
      delivered,
      products,
      // Rider-behaviour is always reviewable. riderId is null when no rider was
      // assigned (review still recorded, just not tied to any rider's rating).
      rider: { riderId: order.rider_id || null, riderName: order.rider_name || null },
      reviews: reviewsRes.rows.map(mapReview),
    },
    'Order reviewables'
  );
});

/** GET /api/reviews/mine — the customer's own reviews (newest first). */
export const getMyReviews = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  if (!(await ensureFeedbackTables())) return successResponse(res, [], 'No reviews');

  const result = await query(
    `SELECT r.*, COALESCE(p.name_en, p.name_ur) AS product_name,
            o.order_number, ru.full_name AS rider_name
       FROM reviews r
       LEFT JOIN products p ON p.id = r.product_id
       LEFT JOIN orders o ON o.id = r.order_id
       LEFT JOIN riders rd ON rd.id = r.rider_id
       LEFT JOIN users ru ON ru.id = rd.user_id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC`,
    [req.user.id]
  );

  return successResponse(
    res,
    result.rows.map((r) => ({
      ...mapReview(r),
      productName: r.product_name,
      orderNumber: r.order_number,
      riderName: r.rider_name,
    })),
    'My reviews'
  );
});

/**
 * GET /api/reviews/product/:productId — published reviews for a product, plus
 * its rating summary. Public (no auth).
 */
export const getProductReviews = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFeedbackTables())) {
    return successResponse(res, { summary: { average: 0, count: 0 }, reviews: [] }, 'No reviews');
  }
  const { productId } = req.params;
  if (!isUuid(productId)) {
    return successResponse(res, { summary: { average: 0, count: 0 }, reviews: [] }, 'No reviews');
  }
  const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);

  const [summaryRes, reviewsRes] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS average
         FROM reviews WHERE target_type = 'product' AND product_id = $1 AND is_published = TRUE`,
      [productId]
    ),
    query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.admin_reply,
              COALESCE(u.full_name, 'Customer') AS author_name
         FROM reviews r
         LEFT JOIN users u ON u.id = r.user_id
        WHERE r.target_type = 'product' AND r.product_id = $1 AND r.is_published = TRUE
        ORDER BY r.created_at DESC
        LIMIT $2`,
      [productId, limit]
    ),
  ]);

  const s = summaryRes.rows[0];
  return successResponse(
    res,
    {
      summary: { average: Number(s.average), count: Number(s.count) },
      reviews: reviewsRes.rows.map((r) => ({
        id: r.id,
        rating: Number(r.rating),
        comment: r.comment,
        adminReply: r.admin_reply,
        authorName: maskName(r.author_name),
        createdAt: r.created_at,
      })),
    },
    'Product reviews'
  );
});

/** Show first name + initial of last name only (privacy on public pages). */
function maskName(name: string): string {
  const parts = String(name || 'Customer').trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// ============================================================================
// ADMIN-FACING — moderation
// ============================================================================

/** GET /api/admin/reviews — city-scoped list with optional ?targetType filter. */
export const listReviewsAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFeedbackTables())) {
    return successResponse(res, { reviews: [], counts: {} }, 'Reviews unavailable');
  }
  const scope = await resolveCityScope(req);

  const where: string[] = ['1=1'];
  const params: unknown[] = [];

  if (scope.cityId && !scope.unrestricted) {
    params.push(scope.cityId);
    where.push(`(r.city_id = $${params.length} OR r.city_id IS NULL)`);
  } else if (scope.cityId) {
    params.push(scope.cityId);
    where.push(`(r.city_id = $${params.length} OR r.city_id IS NULL)`);
  }

  const targetType = req.query.targetType;
  if (typeof targetType === 'string' && VALID_TARGETS.includes(targetType as TargetType)) {
    params.push(targetType);
    where.push(`r.target_type = $${params.length}`);
  }

  const whereSql = where.join(' AND ');

  const [rowsRes, countsRes] = await Promise.all([
    query(
      `SELECT r.*, COALESCE(p.name_en, p.name_ur) AS product_name, o.order_number,
              u.full_name AS author_name, ru.full_name AS rider_name
         FROM reviews r
         LEFT JOIN products p ON p.id = r.product_id
         LEFT JOIN orders o ON o.id = r.order_id
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN riders rd ON rd.id = r.rider_id
         LEFT JOIN users ru ON ru.id = rd.user_id
        WHERE ${whereSql}
        ORDER BY r.created_at DESC
        LIMIT 500`,
      params
    ),
    query(
      `SELECT r.target_type, COUNT(*)::int AS count
         FROM reviews r WHERE ${whereSql} GROUP BY r.target_type`,
      params
    ),
  ]);

  const counts: Record<string, number> = {};
  for (const row of countsRes.rows) counts[row.target_type] = Number(row.count);

  return successResponse(
    res,
    {
      reviews: rowsRes.rows.map((r) => ({
        ...mapReview(r),
        productName: r.product_name,
        orderNumber: r.order_number,
        authorName: r.author_name,
        riderName: r.rider_name,
      })),
      counts,
    },
    'Reviews retrieved'
  );
});

/**
 * PUT /api/admin/reviews/:id
 * Body: { isPublished?, adminReply? } — hide/show a review or post a reply.
 * Toggling publish recomputes the affected product/rider aggregate.
 */
export const updateReviewAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFeedbackTables())) return notFoundResponse(res, 'Review not found');
  const scope = await resolveCityScope(req);
  const { id } = req.params;
  if (!isUuid(id)) return notFoundResponse(res, 'Review not found');

  const existing = await query('SELECT * FROM reviews WHERE id = $1', [id]);
  const review = existing.rows[0] as ReviewRow & { city_id: string | null };
  if (!review) return notFoundResponse(res, 'Review not found');
  if (!scope.unrestricted && scope.cityId && review.city_id && review.city_id !== scope.cityId) {
    return errorResponse(res, 'This review belongs to another city.', 403);
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (req.body.isPublished !== undefined || req.body.is_published !== undefined) {
    const val = req.body.isPublished ?? req.body.is_published;
    params.push(val === true || val === 'true');
    sets.push(`is_published = $${params.length}`);
  }
  if (req.body.adminReply !== undefined || req.body.admin_reply !== undefined) {
    const reply = req.body.adminReply ?? req.body.admin_reply;
    const clean = reply == null ? null : String(reply).trim().slice(0, 2000) || null;
    params.push(clean);
    sets.push(`admin_reply = $${params.length}`);
  }
  if (sets.length === 0) return errorResponse(res, 'Nothing to update.', 400);

  sets.push('updated_at = NOW()');
  params.push(id);

  const row = await withTransaction(async (client) => {
    const updated = (
      await client.query(
        `UPDATE reviews SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      )
    ).rows[0];
    if (updated.target_type === 'product' && updated.product_id) {
      await recomputeProductRating(client, updated.product_id);
    }
    if (updated.target_type === 'rider' && updated.rider_id) {
      await recomputeRiderRating(client, updated.rider_id);
    }
    return updated;
  });

  logger.info('Review moderated', { reviewId: id, by: req.user?.id });
  return successResponse(res, mapReview(row), 'Review updated');
});
