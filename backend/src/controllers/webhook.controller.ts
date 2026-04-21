// ============================================================================
// WEBHOOK CONTROLLER - WITH IDEMPOTENCY PROTECTION
// ============================================================================
// CRITICAL SECURITY: This controller implements webhook idempotency to prevent
// duplicate processing. All webhook attempts are logged to the webhook_logs
// table. Identical webhooks (by idempotency_key or composite key) return
// 200 with "Already processed" instead of reprocessing.
// ============================================================================
// REQUIRED SQL (run as migration or manually):
/*
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_type VARCHAR(50) NOT NULL,              -- 'order_status', 'payment', 'sms', 'rider_location'
  idempotency_key VARCHAR(255),                    -- Client-provided idempotency key
  source VARCHAR(100) NOT NULL,                    -- 'easypaisa', 'jazzcash', 'sms_gateway', etc.
  order_id UUID,                                   -- Related order ID (if applicable)
  payload JSONB NOT NULL,                          -- Full webhook payload
  status VARCHAR(50) NOT NULL DEFAULT 'received',  -- 'received', 'processed', 'duplicate', 'failed'
  response_body JSONB,                             -- Response sent back to webhook caller
  processed_at TIMESTAMPTZ,                        -- When webhook was processed
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite unique constraint for duplicate detection
  -- Prevents processing the same order+status+source combination twice
  CONSTRAINT webhook_logs_unique_composite
    UNIQUE NULLS NOT DISTINCT (order_id, source, status)
);

-- Index for fast idempotency key lookups
CREATE INDEX idx_webhook_logs_idempotency_key ON webhook_logs(idempotency_key);

-- Index for order_id lookups
CREATE INDEX idx_webhook_logs_order_id ON webhook_logs(order_id);

-- Index for querying recent webhook logs
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
*/
// ============================================================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, errorResponse } from '../utils/response';
import logger from '../utils/logger';

/**
 * Check if a webhook has already been processed.
 * Uses either idempotency_key (if provided by client) or
 * a composite key of order_id + status + source for duplicate detection.
 */
const checkDuplicateWebhook = async (
  webhookType: string,
  payload: any,
  source: string | string[] | undefined,
  idempotencyKey?: string
): Promise<{ isDuplicate: boolean; logId?: string; existingResponse?: any }> => {
  const sourceStr = source ? String(source) : 'unknown';

  // Strategy 1: Check by explicit idempotency key (most reliable)
  if (idempotencyKey) {
    const existing = await query(
      `SELECT id, status, response_body FROM webhook_logs
       WHERE idempotency_key = $1 AND source = $2`,
      [idempotencyKey, sourceStr]
    );
    if (existing.rows.length > 0) {
      logger.info('Duplicate webhook detected by idempotency key', {
        idempotencyKey,
        source: sourceStr,
        logId: existing.rows[0].id,
      });
      return {
        isDuplicate: true,
        logId: existing.rows[0].id,
        existingResponse: existing.rows[0].response_body,
      };
    }
  }

  // Strategy 2: Check by composite key (order_id + status + source)
  const orderId = payload.order_id || null;
  const status = payload.status || null;

  if (orderId && status) {
    const existing = await query(
      `SELECT id, status, response_body FROM webhook_logs
       WHERE order_id = $1 AND source = $2 AND response_body->>'status' = $3
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [orderId, sourceStr, status]
    );
    if (existing.rows.length > 0) {
      logger.info('Duplicate webhook detected by composite key', {
        orderId,
        status,
        source: sourceStr,
        logId: existing.rows[0].id,
      });
      return {
        isDuplicate: true,
        logId: existing.rows[0].id,
        existingResponse: existing.rows[0].response_body,
      };
    }
  }

  return { isDuplicate: false };
};

/**
 * Log a webhook attempt to the database.
 * Returns the log entry ID for later status updates.
 */
const logWebhookAttempt = async (
  webhookType: string,
  payload: any,
  source: string | string[] | undefined,
  status: string = 'received',
  idempotencyKey?: string,
  orderId?: string
): Promise<string> => {
  const sourceStr = source ? String(source) : 'unknown';
  const effectiveOrderId = orderId || payload.order_id || null;

  try {
    const result = await query(
      `INSERT INTO webhook_logs (webhook_type, idempotency_key, source, order_id, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [webhookType, idempotencyKey || null, sourceStr, effectiveOrderId, JSON.stringify(payload), status]
    );
    return result.rows[0].id;
  } catch (error) {
    // Non-fatal: Log the error but don't fail the webhook
    logger.error('Failed to log webhook attempt (non-fatal)', { error, webhookType, source: sourceStr });
    return 'unknown';
  }
};

/**
 * Update webhook log with final status and response.
 */
const updateWebhookLog = async (
  logId: string,
  status: string,
  responseBody: any
): Promise<void> => {
  if (logId === 'unknown') return;

  try {
    await query(
      `UPDATE webhook_logs
       SET status = $1, response_body = $2, processed_at = NOW()
       WHERE id = $3`,
      [status, JSON.stringify(responseBody), logId]
    );
  } catch (error) {
    logger.error('Failed to update webhook log (non-fatal)', { error, logId });
  }
};

/**
 * Order status webhook
 * POST /api/webhooks/order-status
 *
 * This webhook can be called by external services (SMS gateways,
 * payment providers, etc.) to update order status
 */
export const orderStatusWebhook = asyncHandler(async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
  const source = req.headers['x-webhook-source'];

  // Log the attempt first
  const logId = await logWebhookAttempt('order_status', req.body, source, 'received', idempotencyKey);

  // Verify webhook signature
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  if (!verifyWebhookSignature(req.body, signature, source)) {
    await updateWebhookLog(logId, 'failed', { error: 'Invalid webhook signature' });
    return errorResponse(res, 'Invalid webhook signature', 401);
  }

  const { order_id, status, metadata } = req.body;

  if (!order_id || !status) {
    await updateWebhookLog(logId, 'failed', { error: 'Order ID and status are required' });
    return errorResponse(res, 'Order ID and status are required', 400);
  }

  // Validate status
  const validStatuses = [
    'pending', 'confirmed', 'preparing', 'ready_for_pickup',
    'out_for_delivery', 'delivered', 'cancelled', 'refunded'
  ];

  if (!validStatuses.includes(status)) {
    await updateWebhookLog(logId, 'failed', { error: 'Invalid status' });
    return errorResponse(res, 'Invalid status', 400);
  }

  // Check for duplicate webhook (idempotency check)
  const duplicateCheck = await checkDuplicateWebhook('order_status', req.body, source, idempotencyKey);
  if (duplicateCheck.isDuplicate) {
    await updateWebhookLog(logId, 'duplicate', { message: 'Already processed' });
    logger.info('Duplicate order status webhook ignored', { orderId: order_id, status, source });
    return successResponse(res, { alreadyProcessed: true }, 'Already processed');
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
    await updateWebhookLog(logId, 'failed', { error: 'Order not found' });
    return errorResponse(res, 'Order not found', 404);
  }

  const responseBody = {
    order_id: result.rows[0].id,
    order_number: result.rows[0].order_number,
    status: result.rows[0].status,
  };

  await updateWebhookLog(logId, 'processed', responseBody);

  logger.info('Order status updated via webhook', {
    orderId: order_id,
    status,
    source: source || 'unknown'
  });

  successResponse(res, responseBody, 'Order status updated successfully');
});

/**
 * Payment status webhook
 * POST /api/webhooks/payment
 *
 * Called by payment providers (EasyPaisa, JazzCash, etc.)
 */
export const paymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
  const source = req.headers['x-webhook-source'];

  // Log the attempt first
  const logId = await logWebhookAttempt('payment', req.body, source, 'received', idempotencyKey);

  // Verify webhook signature
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  if (!verifyWebhookSignature(req.body, signature, source)) {
    await updateWebhookLog(logId, 'failed', { error: 'Invalid webhook signature' });
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
    await updateWebhookLog(logId, 'failed', { error: 'Missing required fields' });
    return errorResponse(res, 'Missing required fields', 400);
  }

  // Check for duplicate webhook (idempotency check)
  const duplicateCheck = await checkDuplicateWebhook('payment', req.body, source, idempotencyKey);
  if (duplicateCheck.isDuplicate) {
    await updateWebhookLog(logId, 'duplicate', { message: 'Already processed' });
    logger.info('Duplicate payment webhook ignored', { orderId: order_id, transactionId: transaction_id });
    return successResponse(res, { alreadyProcessed: true }, 'Already processed');
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

  const responseBody = { order_id, transaction_id, status };
  await updateWebhookLog(logId, 'processed', responseBody);

  logger.info('Payment status updated via webhook', {
    orderId: order_id,
    transactionId: transaction_id,
    status
  });

  successResponse(res, responseBody, 'Payment status updated successfully');
});

/**
 * SMS delivery webhook
 * POST /api/webhooks/sms
 *
 * Called by SMS gateway to confirm message delivery
 */
export const smsWebhook = asyncHandler(async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
  const source = req.headers['x-webhook-source'];

  // Log the attempt (SMS webhooks are lower risk, but still logged)
  const logId = await logWebhookAttempt('sms', req.body, source, 'received', idempotencyKey);

  const { message_id, status, delivered_at } = req.body;

  if (!message_id) {
    await updateWebhookLog(logId, 'failed', { error: 'message_id is required' });
    return errorResponse(res, 'message_id is required', 400);
  }

  // Check for duplicate
  const duplicateCheck = await checkDuplicateWebhook('sms', req.body, source, idempotencyKey);
  if (duplicateCheck.isDuplicate) {
    await updateWebhookLog(logId, 'duplicate', { message: 'Already processed' });
    return successResponse(res, { alreadyProcessed: true }, 'Already processed');
  }

  // Update notification record
  await query(
    `UPDATE notifications
     SET delivered_at = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [delivered_at || new Date(), message_id]
  );

  await updateWebhookLog(logId, 'processed', { message_id, status });

  logger.info('SMS delivery confirmed', { messageId: message_id, status });

  successResponse(res, null, 'SMS status recorded');
});

/**
 * Rider location update from mobile app
 * POST /api/webhooks/rider-location
 */
export const riderLocationWebhook = asyncHandler(async (req: Request, res: Response) => {
  const source = req.headers['x-webhook-source'];
  const { rider_id, latitude, longitude, timestamp } = req.body;

  if (!rider_id || !latitude || !longitude) {
    return errorResponse(res, 'Missing required fields', 400);
  }

  // Log the attempt (fire-and-forget, no idempotency check needed for location updates)
  await logWebhookAttempt('rider_location', req.body, source, 'processed', undefined, undefined);

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
CREATE TABLE IF NOT EXISTS webhooks (
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
