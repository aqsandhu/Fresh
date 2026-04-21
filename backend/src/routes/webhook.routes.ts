// ============================================================================
// WEBHOOK ROUTES
// ============================================================================

import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller';
import { webhookRateLimiter } from '../middleware';

const router = Router();

// Apply rate limiting to all webhook routes
router.use(webhookRateLimiter);

// Order status webhook
router.post('/order-status', webhookController.orderStatusWebhook);

// Payment webhook
router.post('/payment', webhookController.paymentWebhook);

// SMS delivery webhook
router.post('/sms', webhookController.smsWebhook);

// Rider location webhook (from mobile app)
router.post('/rider-location', webhookController.riderLocationWebhook);

export default router;
