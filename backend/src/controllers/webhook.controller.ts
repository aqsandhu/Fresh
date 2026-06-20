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
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, errorResponse } from '../utils/response';
import {
  isValidOrderTransition,
  restoreOrderInventory,
} from '../utils/orderStatus';
import { commitOrderSaleOnDelivery } from '../utils/systemStock';
import { deductOcpStockOnDelivery } from '../utils/ocpStock';
import logger from '../utils/logger';

/**
 * Atomically claim a webhook for processing.
 *
 * SECURITY FIX: the previous SELECT-then-INSERT pattern was a TOCTOU race —
 * two identical webhooks arriving in parallel could both pass the SELECT and
 * both get processed (double payment, double refund, double stock restore).
 *
 * This helper uses INSERT ... ON CONFLICT DO NOTHING against a unique
 * idempotency key so exactly one caller wins the claim per (key, source).
 *
 * Required schema (one of these is enough — both is fine):
 *   CREATE UNIQUE INDEX IF NOT EXISTS webhook_logs_idem_uidx
 *     ON webhook_logs (source, idempotency_key)
 *     WHERE idempotency_key IS NOT NULL;
 */
const claimWebhook = async (
  webhookType: string,
  payload: any,
  source: string | string[] | undefined,
  idempotencyKey: string,
  orderId?: string | null
): Promise<{ claimed: boolean; logId: string; existingResponse?: any }> => {
  const sourceStr = source ? String(source) : 'unknown';
  const effectiveOrderId = orderId || payload?.order_id || null;

  try {
    const inserted = await query(
      `INSERT INTO webhook_logs (webhook_type, idempotency_key, source, order_id, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'received')
       ON CONFLICT (source, idempotency_key) DO NOTHING
       RETURNING id`,
      [webhookType, idempotencyKey, sourceStr, effectiveOrderId, JSON.stringify(payload)]
    );

    if ((inserted.rowCount ?? 0) > 0) {
      return { claimed: true, logId: inserted.rows[0].id };
    }

    const existing = await query(
      `SELECT id, response_body FROM webhook_logs
        WHERE idempotency_key = $1 AND source = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [idempotencyKey, sourceStr]
    );
    if (existing.rows.length > 0) {
      logger.info('Duplicate webhook (atomic claim lost)', {
        webhookType,
        source: sourceStr,
        idempotencyKey,
      });
      return {
        claimed: false,
        logId: existing.rows[0].id,
        existingResponse: existing.rows[0].response_body,
      };
    }
    return { claimed: false, logId: 'unknown' };
  } catch (error) {
    logger.error('claimWebhook failed', { error, webhookType, source: sourceStr });
    // Fail closed — caller should reject if we couldn't claim.
    return { claimed: false, logId: 'unknown' };
  }
};

/**
 * Best-effort logging for webhooks that don't carry an idempotency key
 * (rider location ping, sms delivery confirmation). Returns the row id so
 * the caller can later attach a final status/response.
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
    logger.error('Failed to log webhook attempt (non-fatal)', { error, webhookType, source: sourceStr });
    return 'unknown';
  }
};

/**
 * Derive a stable idempotency key for webhooks where the upstream provider
 * didn't send one. Falls back to a content hash so retries with the exact
 * same payload are still deduped.
 */
const deriveIdempotencyKey = (
  explicit: string | undefined,
  webhookType: string,
  payload: any
): string => {
  if (explicit) return explicit.slice(0, 255);
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
  return `${webhookType}:${hash}`;
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
  const source = req.headers['x-webhook-source'];

  // Signature first — never trust payload before HMAC verification.
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  if (!verifyWebhookSignature(req, signature, source)) {
    return errorResponse(res, 'Invalid webhook signature', 401);
  }

  const { order_id, status } = req.body;

  if (!order_id || !status) {
    return errorResponse(res, 'Order ID and status are required', 400);
  }

  // Validate status against the order_status enum.
  const validStatuses = [
    'pending', 'confirmed', 'preparing', 'ready_for_pickup',
    'out_for_delivery', 'delivered', 'cancelled', 'refunded'
  ];
  if (!validStatuses.includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }

  // Atomic idempotency claim — losing the race short-circuits the rest.
  const idempotencyKey = deriveIdempotencyKey(
    req.headers['x-idempotency-key'] as string | undefined,
    'order_status',
    req.body
  );
  const claim = await claimWebhook('order_status', req.body, source, idempotencyKey, order_id);
  if (!claim.claimed) {
    return successResponse(res, { alreadyProcessed: true }, 'Already processed');
  }
  const logId = claim.logId;

  try {
    const responseBody = await withTransaction(async (client) => {
      const orderResult = await client.query(
        `SELECT id, order_number, status, time_slot_id
           FROM orders
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [order_id]
      );

      if (orderResult.rows.length === 0) {
        throw Object.assign(new Error('Order not found'), { http: 404 });
      }

      const order = orderResult.rows[0];

      if (!isValidOrderTransition(order.status, status)) {
        throw Object.assign(
          new Error(`Invalid transition: ${order.status} → ${status}`),
          { http: 409 }
        );
      }

      // Set the appropriate timestamp column alongside the status change.
      const timestampField =
        status === 'confirmed' ? 'confirmed_at' :
        status === 'preparing' ? 'preparing_at' :
        status === 'ready_for_pickup' ? 'ready_at' :
        status === 'out_for_delivery' ? 'out_for_delivery_at' :
        status === 'delivered' ? 'delivered_at' :
        status === 'cancelled' ? 'cancelled_at' : null;

      const updateSql = timestampField
        ? `UPDATE orders SET status = $1, ${timestampField} = NOW(), updated_at = NOW()
              WHERE id = $2 RETURNING id, order_number, status`
        : `UPDATE orders SET status = $1, updated_at = NOW()
              WHERE id = $2 RETURNING id, order_number, status`;

      const updated = await client.query(updateSql, [status, order_id]);

      // Mirror cancellation side-effects (stock + time slot capacity) so a
      // webhook-driven cancel matches the customer-driven cancelOrder path.
      if (status === 'cancelled' && order.status !== 'cancelled') {
        await restoreOrderInventory(client, { id: order_id, time_slot_id: order.time_slot_id });
      }
      if (status === 'delivered' && order.status !== 'delivered') {
        await commitOrderSaleOnDelivery(client, order_id);
        await deductOcpStockOnDelivery(client, order_id);
      }

      return {
        order_id: updated.rows[0].id,
        order_number: updated.rows[0].order_number,
        status: updated.rows[0].status,
      };
    });

    await updateWebhookLog(logId, 'processed', responseBody);
    logger.info('Order status updated via webhook', { orderId: order_id, status, source: source || 'unknown' });
    return successResponse(res, responseBody, 'Order status updated successfully');
  } catch (err: any) {
    await updateWebhookLog(logId, 'failed', { error: err?.message || 'unknown' });
    const code = err?.http || 400;
    return errorResponse(res, err?.message || 'Webhook failed', code);
  }
});

/**
 * Payment status webhook
 * POST /api/webhooks/payment
 *
 * Called by payment providers (EasyPaisa, JazzCash, etc.)
 */
export const paymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  const source = req.headers['x-webhook-source'];

  // Signature first.
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  if (!verifyWebhookSignature(req, signature, source)) {
    return errorResponse(res, 'Invalid webhook signature', 401);
  }

  const {
    order_id,
    transaction_id,
    amount,
    status,
    gateway_response,
  } = req.body;

  if (!order_id || !transaction_id || !status) {
    return errorResponse(res, 'Missing required fields', 400);
  }

  const validPaymentStatuses = ['pending', 'completed', 'failed', 'refunded'];
  if (!validPaymentStatuses.includes(status)) {
    return errorResponse(res, 'Invalid payment status', 400);
  }

  // Atomic idempotency claim.
  const idempotencyKey = deriveIdempotencyKey(
    req.headers['x-idempotency-key'] as string | undefined,
    'payment',
    req.body
  );
  const claim = await claimWebhook('payment', req.body, source, idempotencyKey, order_id);
  if (!claim.claimed) {
    return successResponse(res, { alreadyProcessed: true }, 'Already processed');
  }
  const logId = claim.logId;

  try {
    const responseBody = await withTransaction(async (client) => {
      const orderResult = await client.query(
        `SELECT id, total_amount, payment_status, payment_method
           FROM orders
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [order_id]
      );

      if (orderResult.rows.length === 0) {
        throw Object.assign(new Error('Order not found'), { http: 404 });
      }

      const order = orderResult.rows[0];
      const orderTotal = Number(order.total_amount);
      const paidAmount = Number(amount);

      // SECURITY FIX: never trust gateway-provided amount blindly. Require it
      // to match the order total within a small rounding tolerance before we
      // mark the order as fully paid.
      if (status === 'completed') {
        if (!Number.isFinite(paidAmount)) {
          throw Object.assign(new Error('Invalid payment amount'), { http: 400 });
        }
        if (Math.abs(paidAmount - orderTotal) > 0.01) {
          throw Object.assign(
            new Error(
              `Payment amount mismatch: gateway=${paidAmount} order_total=${orderTotal}`
            ),
            { http: 409 }
          );
        }
      }

      // COD orders never get a payments row at creation, so a plain UPDATE
      // silently dropped the gateway's record. Update-then-insert keeps one
      // row per order without needing a unique constraint.
      const paymentUpdate = await client.query(
        `UPDATE payments
            SET status = $1,
                transaction_id = $2,
                gateway_response = $3,
                updated_at = NOW()
          WHERE order_id = $4`,
        [status, transaction_id, JSON.stringify(gateway_response || {}), order_id]
      );
      if ((paymentUpdate.rowCount ?? 0) === 0) {
        await client.query(
          `INSERT INTO payments (order_id, payment_method, amount, status, transaction_id, gateway_response)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            order_id,
            order.payment_method,
            Number.isFinite(paidAmount) ? paidAmount : orderTotal,
            status,
            transaction_id,
            JSON.stringify(gateway_response || {}),
          ]
        );
      }

      if (status === 'completed') {
        await client.query(
          `UPDATE orders
              SET payment_status = 'completed',
                  paid_amount = $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [paidAmount, order_id]
        );
      } else if (status === 'failed') {
        await client.query(
          `UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [order_id]
        );
      } else if (status === 'refunded') {
        await client.query(
          `UPDATE orders SET payment_status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [order_id]
        );
      }

      return { order_id, transaction_id, status };
    });

    await updateWebhookLog(logId, 'processed', responseBody);
    logger.info('Payment status updated via webhook', {
      orderId: order_id,
      transactionId: transaction_id,
      status,
    });
    return successResponse(res, responseBody, 'Payment status updated successfully');
  } catch (err: any) {
    await updateWebhookLog(logId, 'failed', { error: err?.message || 'unknown' });
    const code = err?.http || 400;
    return errorResponse(res, err?.message || 'Webhook failed', code);
  }
});

/**
 * SMS delivery webhook
 * POST /api/webhooks/sms
 *
 * Called by SMS gateway to confirm message delivery
 */
export const smsWebhook = asyncHandler(async (req: Request, res: Response) => {
  const source = req.headers['x-webhook-source'];

  // Same HMAC contract as every other webhook — this was the only one that
  // skipped it, leaving an unauthenticated write into notifications.
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  if (!verifyWebhookSignature(req, signature, source)) {
    return errorResponse(res, 'Invalid webhook signature', 401);
  }

  const { message_id, status, delivered_at } = req.body;
  if (!message_id) {
    return errorResponse(res, 'message_id is required', 400);
  }

  const idempotencyKey = deriveIdempotencyKey(
    req.headers['x-idempotency-key'] as string | undefined,
    'sms',
    req.body
  );
  const claim = await claimWebhook('sms', req.body, source, idempotencyKey);
  if (!claim.claimed) {
    return successResponse(res, { alreadyProcessed: true }, 'Already processed');
  }
  const logId = claim.logId;

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
 * Rider location update from third-party telemetry (e.g. fleet GPS).
 * POST /api/webhooks/rider-location
 *
 * SECURITY FIX: this endpoint was previously unauthenticated, so any caller
 * could spoof a rider's live location and feed customers fake tracking.
 * It now requires the same HMAC signature as other webhooks. Mobile-app
 * driver updates already use the authenticated PUT /api/rider/location route.
 */
export const riderLocationWebhook = asyncHandler(async (req: Request, res: Response) => {
  const source = req.headers['x-webhook-source'];
  const signature = req.headers['x-webhook-signature'] as string | undefined;

  // Verify BEFORE writing anything — logging unauthenticated requests let
  // any caller flood webhook_logs for free.
  if (!verifyWebhookSignature(req, signature, source)) {
    return errorResponse(res, 'Invalid webhook signature', 401);
  }

  const logId = await logWebhookAttempt('rider_location', req.body, source, 'received');

  const { rider_id, latitude, longitude, timestamp } = req.body;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!rider_id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    await updateWebhookLog(logId, 'failed', { error: 'Missing or invalid fields' });
    return errorResponse(res, 'Missing or invalid fields', 400);
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    await updateWebhookLog(logId, 'failed', { error: 'Coordinates out of range' });
    return errorResponse(res, 'Coordinates out of range', 400);
  }

  const updateResult = await query(
    `UPDATE riders
     SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         location_updated_at = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING id`,
    [lng, lat, timestamp || new Date(), rider_id]
  );

  if (updateResult.rowCount === 0) {
    await updateWebhookLog(logId, 'failed', { error: 'Rider not found' });
    return errorResponse(res, 'Rider not found', 404);
  }

  await updateWebhookLog(logId, 'processed', { rider_id });
  successResponse(res, null, 'Location updated');
});

/**
 * Verify webhook signature (HMAC-SHA256 over the RAW request body).
 *
 * The HMAC is computed on the exact bytes the sender transmitted (captured by
 * the express.json `verify` hook in app.ts). Hashing JSON.stringify(req.body)
 * instead would silently reject valid webhooks whenever the sender's key
 * order/whitespace differs from our re-serialisation. JSON.stringify remains
 * only as a fallback for callers that bypass the HTTP pipeline (unit tests).
 */
const verifyWebhookSignature = (
  req: Request,
  signature: string | undefined,
  source: string | string[] | undefined
): boolean => {
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
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const payloadBytes = rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadBytes)
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
