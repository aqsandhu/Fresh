// ============================================================================
// CART ROUTES
// ============================================================================

import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import {
  authenticate,
  validate,
  cartSchemas,
} from '../middleware';

const router = Router();

// All cart routes require authentication
router.use(authenticate);

router.get('/', cartController.getCart);
router.post('/add', validate(cartSchemas.addItem), cartController.addToCart);
router.put('/update/:itemId', validate(cartSchemas.updateItem), cartController.updateCartItem);
router.delete('/remove/:itemId', cartController.removeFromCart);
router.delete('/clear', cartController.clearCart);
router.post('/delivery-charge', validate(cartSchemas.deliveryCharge), cartController.calculateCartDeliveryCharge);
router.post('/apply-coupon', cartController.applyCoupon);
router.delete('/remove-coupon', cartController.removeCoupon);

export default router;
