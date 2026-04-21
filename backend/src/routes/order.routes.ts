// ============================================================================
// ORDER ROUTES
// ============================================================================

import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import {
  authenticate,
  orderRateLimiter,
  validate,
  orderSchemas,
  createRateLimiter,
} from '../middleware';

const router = Router();

// Time slots (public)
router.get('/time-slots', orderController.getTimeSlots);

// SECURITY FIX: Track order now requires authentication to prevent data exposure
// If public tracking is needed, implement a separate endpoint with limited data
router.get('/track/:id', authenticate, orderController.trackOrder);

// Protected routes
router.use(authenticate);

router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);
router.post(
  '/',
  orderRateLimiter,
  validate(orderSchemas.create),
  orderController.createOrder
);
router.put('/:id/cancel', orderController.cancelOrder);

export default router;
