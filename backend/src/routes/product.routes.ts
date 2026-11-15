// ============================================================================
// PRODUCT ROUTES
// ============================================================================

import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import { optionalAuth, validate, productSchemas } from '../middleware';
import { twoLayerLimiter } from '../middleware/rateLimiter';

const router = Router();

// SECURITY FIX: Add rate limiting for public product endpoints
// Two layers (see twoLayerLimiter): per signed-in session, plus a per-IP
// ceiling. It used to be 60 a minute PER IP — shared by every customer behind
// the same mobile-carrier address and by ALL website visitors (their calls
// arrive from Vercel's proxy addresses). A load test hit it within a second.
const productRateLimiter = twoLayerLimiter({
  name: 'products',
  windowMs: 60 * 1000,
  perSession: 120,
  perIp: Math.max(60, Number(process.env.PRODUCT_MAX_PER_IP || 1200)),
  message: 'Too many product requests, please try again later',
});

const searchRateLimiter = twoLayerLimiter({
  name: 'search',
  windowMs: 60 * 1000,
  perSession: 60,
  perIp: Math.max(30, Number(process.env.SEARCH_MAX_PER_IP || 600)),
  message: 'Too many search requests, please try again later',
});

// Public routes with rate limiting
router.get('/', productRateLimiter, optionalAuth, validate(productSchemas.list, 'query'), productController.getProducts);
router.get('/search', searchRateLimiter, optionalAuth, validate(productSchemas.search, 'query'), productController.searchProducts);
router.get('/featured/list', productRateLimiter, optionalAuth, productController.getFeaturedProducts);
router.get('/new-arrivals', productRateLimiter, optionalAuth, validate(productSchemas.limitOnly, 'query'), productController.getNewArrivals);
router.get('/slug/:slug', productRateLimiter, optionalAuth, productController.getProductBySlug);
router.get('/:id/related', productRateLimiter, optionalAuth, validate(productSchemas.related, 'query'), productController.getRelatedProducts);
router.get('/:id', productRateLimiter, optionalAuth, productController.getProductById);

export default router;
