// ============================================================================
// ORDER ROUTES
// ============================================================================

import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import {
  authenticate,
  verifyUserActive,
  orderRateLimiter,
  publicTrackingRateLimiter,
  validate,
  orderSchemas,
} from '../middleware';

const router = Router();

// Time slots (public)
router.get('/time-slots', orderController.getTimeSlots);

router.get('/track/public/:orderNumber', publicTrackingRateLimiter, orderController.trackOrderPublic);
router.get('/track/:id', authenticate, verifyUserActive, orderController.trackOrder);

// Protected routes
router.use(authenticate);

router.get('/', verifyUserActive, validate(orderSchemas.list, 'query'), orderController.getOrders);
router.get('/:id', verifyUserActive, orderController.getOrderById);
router.post(
  '/',
  verifyUserActive,
  orderRateLimiter,
  validate(orderSchemas.create),
  orderController.createOrder
);
router.put('/:id/cancel', verifyUserActive, orderController.cancelOrder);

export default router;
