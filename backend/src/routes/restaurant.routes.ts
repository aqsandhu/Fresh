// ============================================================================
// RESTAURANT ROUTES (public + restaurant-authed). Mounted at /api/restaurant.
// Admin management lives under /api/admin/restaurants.
// ============================================================================

import { Router } from 'express';
import { validate, restaurantSchemas } from '../middleware';
import { createRateLimiter } from '../middleware/rateLimiter';
import { authenticateRestaurant } from '../middleware/restaurantAuth';
import {
  registerRestaurant,
  loginRestaurant,
  getRestaurantMe,
} from '../controllers/restaurant.controller';
import {
  getRestaurantCategories,
  getRestaurantProducts,
  getRestaurantDeliverySettings,
  createRestaurantOrder,
  getRestaurantOrders,
} from '../controllers/restaurant.storefront.controller';

const router = Router();

// Cap registration + login attempts (public endpoints).
const registerLimiter = createRateLimiter(
  60 * 60 * 1000,
  10,
  'Too many registration attempts. Please try again later.'
);
const loginLimiter = createRateLimiter(
  15 * 60 * 1000,
  20,
  'Too many login attempts. Please try again later.'
);

router.post('/register', registerLimiter, validate(restaurantSchemas.register), registerRestaurant);
router.post('/login', loginLimiter, validate(restaurantSchemas.login), loginRestaurant);

// Restaurant-authed storefront + orders.
router.get('/me', authenticateRestaurant, getRestaurantMe);
router.get('/categories', authenticateRestaurant, getRestaurantCategories);
router.get('/products', authenticateRestaurant, getRestaurantProducts);
router.get('/delivery', authenticateRestaurant, getRestaurantDeliverySettings);
router.get('/orders', authenticateRestaurant, getRestaurantOrders);
router.post('/orders', authenticateRestaurant, validate(restaurantSchemas.placeOrder), createRestaurantOrder);

export default router;
