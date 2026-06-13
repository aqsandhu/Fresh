// ============================================================================
// CART ROUTES
// ============================================================================

import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import {
  authenticate,
  verifyUserActive,
  validate,
  cartSchemas,
} from '../middleware';

const router = Router();

// All cart routes require authentication. verifyUserActive re-checks the DB so
// a suspended/deleted user loses cart access immediately instead of riding a
// still-valid access token until it expires. It runs AFTER input validation so
// a malformed request fails fast (422) without an extra DB round-trip.
router.use(authenticate);

router.get('/', verifyUserActive, cartController.getCart);
router.post('/add', validate(cartSchemas.addItem), verifyUserActive, cartController.addToCart);
router.post('/sync', validate(cartSchemas.sync), verifyUserActive, cartController.syncCart);
router.put('/update/:itemId', validate(cartSchemas.updateItem), verifyUserActive, cartController.updateCartItem);
router.delete('/remove/:itemId', verifyUserActive, cartController.removeFromCart);
router.delete('/clear', verifyUserActive, cartController.clearCart);
router.post('/delivery-charge', validate(cartSchemas.deliveryCharge), verifyUserActive, cartController.calculateCartDeliveryCharge);
router.post('/apply-coupon', verifyUserActive, cartController.applyCoupon);
router.delete('/remove-coupon', verifyUserActive, cartController.removeCoupon);

export default router;
