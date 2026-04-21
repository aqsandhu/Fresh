// ============================================================================
// WEBHOOK CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, errorResponse } from '../utils/response';
import logger from '../utils/logger';

/**
 * Order status webhook
 * POST /api/webhooks/order-status
 * 
 * This webhook can be called by external services (SMS gateways, 
 * payment providers, etc.) to update order status
 */
export const orderStatusWebhook = asyncHandler(async (req: Request, res: Response) => {
  // Verify webhook signature
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  const source = req.headers['x-webhook-source'];
  if (!verifyWebhookSignature(req.body, signature, source)) {
    return errorResponse(res, 'Invalid webhook signature', 401);
  }

  const { order_id, status, metadata } = req.body;

  if (!order_id || !status) {
    return errorResponse(res, 'Order ID and status are required', 400);
  }

  // Validate status
  const validStatuses = [
    'pending', 'confirmed', 'preparing', 'ready_for_pickup',
    'out_for_delivery', 'delivered', 'cancelled', 'refunded'
  ];

  if (!validStatuses.includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }

  // Update order status
  const result = await query(
    `UPDATE orders 
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, order_number, status`,
    [status, order_id]
  );

  if (result.rows.length === 0) {
    return errorResponse(res, 'Order not found', 404);
  }

  logger.info('Order status updated via webhook', { 
    orderId: order_id, 
    status,
    source: req.headers['x-webhook-source'] || 'unknown'
  });

  successResponse(res, {
    order_id: result.rows[0].id,
    order_number: result.rows[0].order_number,
    status: result.rows[0].status,
  }, 'Order status updated successfully');
});

/**
 * Payment status webhook
 * POST /api/webhooks/payment
 * 
 * Called by payment providers (EasyPaisa, JazzCash, etc.)
 */
export const paymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  // Verify webhook signature
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  const source = req.headers['x-webhook-source'];
  if (!verifyWebhookSignature(req.body, signature, source)) {
    return errorResponse(res, 'Invalid webhook signature', 401);
  }

  const {
    order_id,
    transaction_id,
    amount,
    status,
    payment_method,
    gateway_response,
  } = req.body;

  if (!order_id || !transaction_id || !status) {
    return errorResponse(res, 'Missing required fields', 400);
  }

  // Update payment record
  await query(
    `UPDATE payments 
     SET status = $1, 
         transaction_id = $2,
         gateway_response = $3,
         updated_at = NOW()
     WHERE order_id = $4`,
    [status, transaction_id, JSON.stringify(gateway_response), order_id]
  );

  // Update order payment status
  if (status === 'completed') {
    await query(
      `UPDATE orders 
       SET payment_status = 'completed', 
           paid_amount = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount, order_id]
    );
  }

  logger.info('Payment status updated via webhook', { 
    orderId: order_id, 
    transactionId: transaction_id,
    status 
  });

  successResponse(res, null, 'Payment status updated successfully');
});

/**
 * SMS delivery webhook
 * POST /api/webhooks/sms
 * 
 * Called by SMS gateway to confirm message delivery
 */
export const smsWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { message_id, status, delivered_at } = req.body;

  // Update notification record
  await query(
    `UPDATE notifications 
     SET delivered_at = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [delivered_at || new Date(), message_id]
  );

  logger.info('SMS delivery confirmed', { messageId: message_id, status });

  successResponse(res, null, 'SMS status recorded');
});

/**
 * Rider location update from mobile app
 * POST /api/webhooks/rider-location
 */
export const riderLocationWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { rider_id, latitude, longitude, timestamp } = req.body;

  if (!rider_id || !latitude || !longitude) {
    return errorResponse(res, 'Missing required fields', 400);
  }

  await query(
    `UPDATE riders 
     SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         location_updated_at = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [longitude, latitude, timestamp || new Date(), rider_id]
  );

  successResponse(res, null, 'Location updated');
});

/**
 * Verify webhook signature
 * Implements HMAC-SHA256 signature verification
 * 
 * SECURITY FIX: Properly verifies webhook signatures using WEBHOOK_SECRET
 * Falls back to requiring x-webhook-source header for development
 */
const verifyWebhookSignature = (payload: any, signature: string | undefined, source: string | string[] | undefined): boolean => {
  // If no signature provided, check for development mode with source header
  if (!signature) {
    // In development, allow webhooks with valid source header
    if (process.env.NODE_ENV === 'development' && source) {
      logger.warn('Webhook accepted in development mode without signature');
      return true;
    }
    logger.error('Webhook rejected: No signature provided');
    return false;
  }

  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    logger.error('Webhook rejected: WEBHOOK_SECRET not configured');
    return false;
  }

  try {
    // Compute expected signature using HMAC-SHA256
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadString)
      .digest('hex');
    
    // Use timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (error) {
    logger.error('Webhook signature verification error:', error);
    return false;
  }
};

/**
 * Register webhook endpoint
 * POST /api/webhooks/register
 * (Admin only)
 */
export const registerWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { url, events, secret } = req.body;

  // Store webhook configuration
  const result = await query(
    `INSERT INTO webhooks (url, events, secret, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [url, events, secret, req.user?.id]
  );

  successResponse(res, result.rows[0], 'Webhook registered successfully', 201);
});

// Note: Create webhooks table if needed
/*
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
*/
