// ============================================================================
// CHAT CONTROLLER - Order-based messaging between customer and rider
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, errorResponse, notFoundResponse } from '../utils/response';

/**
 * Get messages for an order
 * GET /api/chat/:orderId
 */
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);

  const { orderId } = req.params;

  // Verify user has access to this order (customer who placed it or assigned rider)
  const access = await query(
    `SELECT o.id, o.status, o.user_id,
       r.user_id as rider_user_id
     FROM orders o
     LEFT JOIN riders r ON o.rider_id = r.id
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orderId]
  );

  if (access.rows.length === 0) return notFoundResponse(res, 'Order not found');

  const order = access.rows[0];
  const isCustomer = order.user_id === req.user.id;
  const isRider = order.rider_user_id === req.user.id;

  if (!isCustomer && !isRider) {
    return errorResponse(res, 'Not authorized to view these messages', 403);
  }

  const messages = await query(
    `SELECT m.id, m.message, m.sender_type, m.created_at,
       u.full_name as sender_name
     FROM order_messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.order_id = $1
     ORDER BY m.created_at ASC`,
    [orderId]
  );

  successResponse(res, {
    messages: messages.rows,
    order_status: order.status,
  });
});

/**
 * Send a message for an order
 * POST /api/chat/:orderId
 */
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);

  const { orderId } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return errorResponse(res, 'Message cannot be empty', 400);
  }

  // Verify access and check order is active (not delivered/cancelled)
  const access = await query(
    `SELECT o.id, o.status, o.user_id,
       r.user_id as rider_user_id
     FROM orders o
     LEFT JOIN riders r ON o.rider_id = r.id
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orderId]
  );

  if (access.rows.length === 0) return notFoundResponse(res, 'Order not found');

  const order = access.rows[0];
  const isCustomer = order.user_id === req.user.id;
  const isRider = order.rider_user_id === req.user.id;

  if (!isCustomer && !isRider) {
    return errorResponse(res, 'Not authorized', 403);
  }

  if (['delivered', 'cancelled'].includes(order.status)) {
    return errorResponse(res, 'Cannot send messages on completed orders', 400);
  }

  const senderType = isRider ? 'rider' : 'customer';

  const result = await query(
    `INSERT INTO order_messages (order_id, sender_type, sender_id, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id, message, sender_type, created_at`,
    [orderId, senderType, req.user.id, message.trim()]
  );

  const newMsg = result.rows[0];
  newMsg.sender_name = req.user.full_name;

  successResponse(res, newMsg, 'Message sent', 201);
});
