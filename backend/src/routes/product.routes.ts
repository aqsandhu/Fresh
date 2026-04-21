// ============================================================================
// PRODUCT ROUTES
// ============================================================================

import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import { optionalAuth, validate, productSchemas, createRateLimiter } from '../middleware';

const router = Router();

// SECURITY FIX: Add rate limiting for public product endpoints
const productRateLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  60, // 60 requests per minute
  'Too many product requests, please try again later'
);

const searchRateLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  30, // 30 search requests per minute
  'Too many search requests, please try again later'
);

// Public routes with rate limiting
router.get('/', productRateLimiter, optionalAuth, validate(productSchemas.list), productController.getProducts);
router.get('/search', searchRateLimiter, optionalAuth, productController.searchProducts);
router.get('/featured/list', productRateLimiter, optionalAuth, productController.getFeaturedProducts);
router.get('/new-arrivals', productRateLimiter, optionalAuth, productController.getNewArrivals);
router.get('/slug/:slug', productRateLimiter, optionalAuth, productController.getProductBySlug);
router.get('/:id/related', productRateLimiter, optionalAuth, productController.getRelatedProducts);
router.get('/:id', productRateLimiter, optionalAuth, productController.getProductById);

export default router;
