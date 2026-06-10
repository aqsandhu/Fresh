// ============================================================================
// ORDER ROUTES
// ============================================================================

import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import {
  authenticate,
  verifyUserActive,
  orderRateLimiter,
  validate,
  orderSchemas,
  createRateLimiter,
} from '../middleware';

const router = Router();

// Time slots (public)
router.get('/time-slots', orderController.getTimeSlots);

router.get('/track/public/:orderNumber', orderController.trackOrderPublic);
router.get('/track/:id', authenticate, orderController.trackOrder);

// Protected routes
router.use(authenticate);

router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);
router.post(
  '/',
  verifyUserActive,
  orderRateLimiter,
  validate(orderSchemas.create),
  orderController.createOrder
);
router.put('/:id/cancel', orderController.cancelOrder);

export default router;
