// ============================================================================
// NOTIFICATION CONTROLLER - Customer notifications (website / mobile app)
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { successResponse, errorResponse, notFoundResponse } from '../utils/response';

function mapNotification(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    orderId: row.order_id,
    isRead: row.is_read,
    readAt: row.read_at,
    actionUrl: row.action_url,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/notifications
 */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);

  const result = await query(
    `SELECT id, type, title, message, order_id, is_read, read_at, action_url, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [req.user.id, limit]
  );

  const unreadResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1 AND is_read = FALSE`,
    [req.user.id]
  );

  successResponse(res, {
    notifications: result.rows.map(mapNotification),
    unreadCount: unreadResult.rows[0]?.count ?? 0,
  });
});

/**
 * PATCH /api/notifications/:id/read
 */
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const result = await query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, type, title, message, order_id, is_read, read_at, action_url, created_at`,
    [id, req.user.id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Notification not found');
  }

  successResponse(res, { notification: mapNotification(result.rows[0]) }, 'Notification marked as read');
});

/**
 * PATCH /api/notifications/read-all
 */
export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  await query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [req.user.id]
  );

  successResponse(res, { ok: true }, 'All notifications marked as read');
});
