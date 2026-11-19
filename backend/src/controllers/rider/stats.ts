// Today's numbers, earnings, cash hand-overs, reviews — moved from rider.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query, type DbRow } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../utils/response';
import { hasFeedbackTables } from '../../config/feedbackSchema';
import { hasAttaCashColumns, hasRiderCashSettlementTables } from '../../config/riderSchema';
import { computeRiderStats, computeRiderToday } from '../../utils/riderStats';
import { resolveRiderId } from './shared';

/**
 * Today's stats for the Home dashboard (Asia/Karachi day, by delivery time)
 * GET /api/rider/stats/today
 */
export const getTodayStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const today = await computeRiderToday(riderId);
  successResponse(res, { ...today, totalDistance: 0, avgDeliveryTime: 0 }, "Today's stats retrieved successfully");
});

/**
 * Get today's earnings (legacy shape)
 * GET /api/rider/earnings/today
 */
export const getTodayEarnings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const today = await computeRiderToday(riderId);
  successResponse(res, {
    completed_deliveries: today.totalDeliveries + today.attaTasks,
    deliveries: today.totalDeliveries,
    atta_tasks: today.attaTasks,
    total_earnings: today.totalEarnings,
  }, "Today's earnings retrieved successfully");
});

/**
 * Full rider stats (periods + cash position)
 * GET /api/rider/stats
 */
export const getMyStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const stats = await computeRiderStats(riderId);
  successResponse(res, stats, 'Rider stats retrieved');
});

/**
 * Cash the rider has handed over to the company.
 * GET /api/rider/cash-settlements
 */
export const getMyCashSettlements = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');
  if (!(await hasRiderCashSettlementTables())) return successResponse(res, [], 'Cash settlements');

  const attaReady = await hasAttaCashColumns();
  const result = await query<DbRow<{ amount: string }>>(
    `SELECT s.id, s.amount, s.status, s.note, s.received_at,
            u.full_name AS received_by_name,
            (SELECT COUNT(*)::int FROM rider_cash_settlement_orders so WHERE so.settlement_id = s.id) AS order_count,
            ${attaReady ? '(SELECT COUNT(*)::int FROM rider_cash_settlement_atta sa WHERE sa.settlement_id = s.id)' : '0'} AS atta_count
       FROM rider_cash_settlements s
       LEFT JOIN users u ON u.id = s.received_by
      WHERE s.rider_id = $1
      ORDER BY s.received_at DESC
      LIMIT 50`,
    [riderId]
  );
  successResponse(
    res,
    result.rows.map((row) => ({ ...row, amount: parseFloat(row.amount) || 0 })),
    'Cash settlements'
  );
});

/**
 * Customer reviews about this rider (published only). Customer identity is
 * reduced to a first name — the rider never gets a customer's contact data.
 * GET /api/rider/reviews
 */
export const getMyReviews = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const summary = await query(`SELECT rating, rating_count FROM riders WHERE id = $1`, [riderId]);
  if (!(await hasFeedbackTables())) {
    return successResponse(res, {
      rating: parseFloat(summary.rows[0]?.rating) || null,
      ratingCount: Number(summary.rows[0]?.rating_count || 0),
      reviews: [],
    }, 'Reviews');
  }

  const result = await query(
    `SELECT rv.id, rv.rating, rv.comment, rv.admin_reply, rv.created_at,
            o.order_number,
            split_part(COALESCE(u.full_name, ''), ' ', 1) AS customer_first_name
       FROM reviews rv
       LEFT JOIN orders o ON o.id = rv.order_id
       LEFT JOIN users u ON u.id = rv.user_id
      WHERE rv.target_type = 'rider' AND rv.rider_id = $1 AND rv.is_published = TRUE
      ORDER BY rv.created_at DESC
      LIMIT 50`,
    [riderId]
  );

  successResponse(res, {
    rating: summary.rows[0]?.rating_count > 0 ? parseFloat(summary.rows[0]?.rating) : null,
    ratingCount: Number(summary.rows[0]?.rating_count || 0),
    reviews: result.rows,
  }, 'Reviews');
});
